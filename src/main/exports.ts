// Συμπλήρωση των εντύπων της Ίλης από την κατάσταση της εφαρμογής (06, 11).
// Κάθε συνάρτηση παίρνει το κενό template και επιστρέφει το συμπληρωμένο αρχείο.
import { addDays, dm, dmy, dmyy, hkDate, parseD, DOW_FULL, MON_SHORT, type ISODate } from '../shared/dates';
import { dutyAt, isWk, outLbl, outNoteOf, withNote } from '../shared/weekend';
import { norm } from '../shared/text';
import { backBy } from '../shared/hours';
import { byName, hkOrgans, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines } from '../shared/hkaiText';
import { TYPES, blocksOf, coversDay, hkOn, fatherTxt, fullName, type AppState, type Person, type Phase, type Status } from '../shared/domain';
import { hkRowsOf, itemKey, statusLbl, type HkRows } from '../shared/ranks';
import { formText, hkRowLabel, reportOf, unitKindOf, unitText } from '../shared/unit';
import { activePeople, personMap, statusesFrom, outMin, DUTY_START, hkaiCounts, postBy, postOf } from '../shared/rules';
import { Workbook, colName, colNum, unesc, type Sheet } from './xlsx';
import { hkaiMapOf, type HkaiMap } from '../shared/sources';
import { hkOffText } from '../shared/cadre';
import { FROURA_FORMS, absenceOf, dutyName, frouraLayout, frouraTables, lyLine, type FrouraForm, type FrouraTable, type TableCols } from '../shared/froura';
import { sigsCustom, sigsFor, sigsSaved, type Sig, type SigForm } from '../shared/sigs';
import { placeSigs } from './sigs';
import { applyMoves, blockOf } from './layout';
import type { Block, LayoutForm, LayoutSheet, Moves } from '../shared/layout';
export { FROURA_FORMS };

export const who = (p: Person) => [p.rank, p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
const titleDate = (d: ISODate, longYear: boolean) => { const x = parseD(d); return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + (longYear ? x.getFullYear() : String(x.getFullYear()).slice(2)); };
export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);

export interface ExportResult { name: string; data: Buffer; warnings: string[]; layout?: LayoutSheet[] }

// Λόχος/Τάγμα (Michael, 18/10): οι λέξεις της ίλης στα κείμενα του template («ΔΚΤΗΣ ΙΛΗΣ», «2Η ΕΠΧΙΑ») γίνονται του λόχου,
// πριν γραφτεί οτιδήποτε (ό,τι γράφει η εφαρμογή, π.χ. η κεφαλίδα, έχει ήδη τις σωστές). Και ανάποδα (20/10): δικό σου
// template του λόχου σε ίλη παίρνει τις λέξεις της ίλης. Τα templates της εφαρμογής είναι της ίλης και εκεί δεν αλλάζουν.
export async function unitWords(wb: Workbook, s: AppState) {
  const kind = unitKindOf(s.settings);
  await wb.mapTexts(t => unitText(t, kind));
}
// Οι υπογραφές ενός εντύπου (Michael, 20/10): όσες έδωσες τη στιγμή που βγαίνει (over), αλλιώς οι δικές σου των Ρυθμίσεων·
// χωρίς αυτές μένουν του εντύπου. def: για το κελί {ΥΠΟΓΡΑΦΕΣ} σε δικό σου template, όταν δεν άλλαξες τίποτα.
export function sigsOf(s: AppState, form: SigForm, over?: Sig[] | null): { sigs: Sig[] | null; def: Sig[] } {
  const def = sigsFor(s.settings, sigsSaved(s.settings, form));
  return { sigs: over ? sigsFor(s.settings, over) : sigsCustom(s.settings, form) ? def : null, def };
}
// Υπογραφές σε κάθε φύλλο, και μετά ό,τι μετακίνησες πάνω στο χαρτί (κεφαλίδα, ημερομηνία, υπογραφές: layout.ts).
// more: τα άλλα κομμάτια του φύλλου (κεφαλίδα, τόπος και ημερομηνία)· key: ποιο φύλλο του εντύπου (LAYOUT_SHEETS)
export interface SheetPart { ws: Sheet; key: string; more: (Block | null)[] }
export async function signSheets(wb: Workbook, sheets: SheetPart[], s: AppState, form: SigForm, over: Sig[] | null | undefined, warnings: string[], moves?: (key: string) => Moves | undefined): Promise<LayoutSheet[]> {
  const g = sigsOf(s, form, over); const out: LayoutSheet[] = [];
  const mv = moves || ((key: string) => (form === 'reports' ? undefined : s.settings.layout?.[form as LayoutForm]?.[key]));
  for (const x of sheets) {
    const sg = await placeSigs(wb, x.ws, g.sigs, g.def, warnings);
    const blocks = [...x.more.filter((b): b is Block => !!b), ...sg];
    out.push({ key: x.key, sheet: x.ws.name, blocks: applyMoves(wb, x.ws, blocks, mv(x.key)) });
  }
  return out;
}

// ------------------------------------------------------------------ ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01) και ΦΡΟΥΡΑ ΣΠΕΝ (φωτογραφία γραφέα)
const FROURA_ROWS = 6; // γραμμές τιμωρημένων και απόντων στο κενό έντυπο
export function punishedOn(s: AppState, d: ISODate): Status[] {
  return s.statuses.filter(x => x.type === 'PUN' && !x.pending && coversDay(x, d));
}
export function absentOn(s: AppState, d: ISODate): Status[] {
  // απόντες του εντύπου υπηρεσιών: άδειες, αναρρωτικές, νοσοκομείο (όχι οι εξοδούχοι)· όχι όποιος γυρίζει ως τις 14:00
  return s.statuses.filter(x => TYPES[x.type].away && TYPES[x.type].cat !== 'out' && coversDay(x, d) && !backBy(x, d, DUTY_START));
}

// Πίνακες των δικών σου υπηρεσιών κάτω από τους πίνακες του εντύπου, ανά δύο δίπλα δίπλα (στις στήλες των θαλαμοφυλάκων),
// με μία κενή γραμμή πριν από κάθε σειρά πινάκων. Επιστρέφει πόσες γραμμές μπήκαν.
function frouraTablesInto(wb: Workbook, ws: Sheet, form: FrouraForm, tabs: FrouraTable[]): number {
  if (!tabs.length) return 0;
  const lk = form.tables.look; const st = { aa: ws.style(lk.aa), name: ws.style(lk.name), hours: ws.style(lk.hours), note: ws.style(lk.note) };
  const groups: { t: FrouraTable; at: TableCols }[][] = [];
  for (let i = 0; i < tabs.length; i += 2) groups.push([{ t: tabs[i], at: form.tables.left }, ...(tabs[i + 1] ? [{ t: tabs[i + 1], at: form.tables.right }] : [])]);
  const n = groups.reduce((a, g) => a + 2 + Math.max(...g.map(x => x.t.rows.length)), 0);
  const after = form.extra.after; ws.insertRows(after, n, after + 1, wb);
  const put = (ref: string, v: string | null, style: number | null) => { ws.set(ref, v); if (style != null) ws.setStyle(ref, style); };
  const line = (at: TableCols, t: FrouraTable, r: number, v: { aa: string; name: string; hours: string; note: string }) => {
    put(at.aa + r, v.aa, st.aa); put(at.name + r, v.name, st.name); put(at.note + r, v.note, st.note);
    const last = colName(colNum(t.hours ? at.hours : at.note) - 1);
    for (let c = colNum(at.name) + 1; c <= colNum(last); c++) put(colName(c) + r, null, st.name);
    if (last !== at.name) ws.addMerge(at.name + r + ':' + last + r);
    if (t.hours) put(at.hours + r, v.hours, st.hours);
  };
  let r = after + 1;
  for (const g of groups) {
    r++;
    for (const { t, at } of g) {
      line(at, t, r, { aa: 'Α/Α', name: t.title, hours: 'ΩΡΕΣ', note: 'ΠΑΡ/ΣΕΙΣ' });
      t.rows.forEach((x, i) => line(at, t, r + 1 + i, { aa: x.n, name: x.name, hours: x.hours, note: '' }));
    }
    r += 1 + Math.max(...g.map(x => x.t.rows.length));
  }
  return n;
}

// sheet: φύλλο του template (Αρχεία Excel)· κενό = το πρώτο
export async function fillFroura(tpl: Buffer, s: AppState, d: ISODate, phase: Phase = s.settings.phase || 'sven', sheet?: string, sigs?: Sig[] | null): Promise<ExportResult> {
  const form = FROURA_FORMS[phase];
  // οι στήλες φαρδαίνουν όσο χρειάζεται: το έντυπο τυπώνεται σε μία σελίδα (fitToPage), απλώς λίγο μικρότερο
  const wb = await Workbook.open(tpl); wb.widen = true; await unitWords(wb, s); const ws = await wb.sheet(sheet && wb.hasSheet(sheet) ? sheet : 0); const pm = personMap(s.people);
  const warnings: string[] = [];
  const g = s.guards[d] || {};
  ws.set('L1', s.settings.unit[0]).set('L2', s.settings.unit[1]).set('L3', s.settings.unit[2]);
  ws.set('A5', 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ ' + titleDate(d, true));
  const p = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  ws.set('A9', 'Λ/Υ: ' + (p('ly') ? lyLine(p('ly')!) : ''));
  ws.set('A10', 'Δ/Υ: ' + (p('dy') ? lyLine(p('dy')!) : ''));
  const lay = frouraLayout(s, d, phase);
  for (const k of lay.foreign) {
    const x = postBy(s, k); const off = x && blocksOf(s.settings, phase).find(b => b.id === x.block)?.hidden;
    warnings.push(off ? 'Η υπηρεσία ' + x!.label + ' είναι ανενεργή (Ρυθμίσεις › Υπηρεσίες) και δεν γράφτηκε' : 'Η θέση ' + (x?.label || k) + ' δεν ανήκει στη ΦΡΟΥΡΑ ' + (phase === 'spen' ? 'ΣΠΕΝ' : 'ΣΒΕΝ') + ' και δεν γράφτηκε');
  }
  lay.cells.forEach((names, at) => { if (names.length) ws.set(at, names.join('\n')); });
  const added = frouraTablesInto(wb, ws, form, frouraTables(s, lay, phase));
  const first = form.list + added;
  const pun = punishedOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const abs = absentOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const rows = Math.max(pun.length, abs.length);
  const last = first + FROURA_ROWS - 1;
  if (rows > FROURA_ROWS) ws.insertRows(last, rows - FROURA_ROWS, last, wb);
  for (let i = 0; i < Math.max(rows, FROURA_ROWS); i++) {
    const r = first + i;
    ws.set('A' + r, i + 1).set('H' + r, i + 1);
    const a = pun[i], b = abs[i];
    if (a) ws.set('B' + r, dutyName(a.p)).set('C' + r, norm(a.x.kind || 'Ποινή')).set('D' + r, dm(a.x.from)).set('E' + r, a.x.open ? '' : dm(a.x.to)).set('F' + r, a.x.note || '');
    if (b) ws.set('I' + r, dutyName(b.p)).set('J' + r, absenceOf(b.x)).set('K' + r, dm(b.x.from)).set('L' + r, b.x.open ? '' : dm(b.x.to)).set('M' + r, b.x.note || '');
  }
  const layout = await signSheets(wb, [{ ws, key: 'main', more: [blockOf(ws, 'head', ['L1', 'L2', 'L3'])] }], s, 'froura', sigs, warnings);
  return { name: 'ΦΡΟΥΡΑ ' + (phase === 'spen' ? 'ΣΠΕΝ ' : '') + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings, layout };
}

// ------------------------------------------------------------------ ΗΚΑΙ (δείγμα 15)
// στήλες ανά είδος κωλυομένων/απόντων (τα κλειδιά του hkaiCounts)
const HK_KEYS = ['yp', 'ey', 'tim', 'bl', 'os', 'mag', 'sid', 'kin', 'ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh'];
export class TemplateError extends Error {}
// 5. ΑΙΤΗΣΕΙΣ (G12): το ελεύθερο κείμενο γράφεται μαζί με τις αριθμημένες αιτήσεις, στο τέλος
// 1. ΕΓΓΡΑΦΕΣ και 2. ΔΙΑΓΡΑΦΕΣ (G8, G9): το ελεύθερο κείμενο μετά από όσους μπήκαν ή βγήκαν από τη δύναμη τη μέρα
// Αξιωματικός υπηρεσίας (A18): ό,τι γράφτηκε, αλλιώς από τα Στελέχη (hkOffText)
export const HK_TEXT: Record<string, string> = { loi: 'G19' };
// Ατυχήματα (K5 ολικές ζημιές, L5 μερικές, M5 σε άνδρες): ό,τι γράφτηκε στην οθόνη της ΗΚΑΙ, αλλιώς μένει το Ø του εντύπου
export const HK_ACC: Record<string, string> = { accT: 'K5', accP: 'L5', accM: 'M5' };
// front/back: φύλλα μπροστινής και πίσω σελίδας· map: πού μπαίνει κάθε αριθμός (Αρχεία Excel → ΗΚΑΙ)
export async function fillHkai(tpl: Buffer, s: AppState, d: ISODate, opts: { front?: string; back?: string; map?: HkaiMap; sigs?: Sig[] | null } = {}): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); await unitWords(wb, s);
  const pick = (n: string | undefined, i: number) => (n && wb.hasSheet(n) ? n : i);
  const fr = await wb.sheet(pick(opts.front, 0)); const bk = await wb.sheet(pick(opts.back, 1));
  const m0 = opts.map || hkaiMapOf(); const m: HkaiMap = { ...m0, rows: { ...m0.rows } };
  const pm = personMap(s.people); const warnings: string[] = [];
  const hk = hkaiCounts(s, d);
  const R = hkRowsOf(s.settings.lists); const ALL = [...R.off, ...R.nco];
  addHkRows(wb, fr, m, R, warnings);
  hkRowLabels(fr, m, ALL, s);
  hkHead(fr, m, s);
  fr.set(m.title, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(d));
  fr.set(m.date, s.settings.place + ', ' + hkDate(d));
  const rowsOf: [string, number][] = ALL.map(r => [r, m.rows[r]] as [string, number]).filter(([, r]) => r > 0);
  // Προέλεγχος template (έρευνα §3.6): τα αθροίσματα πρέπει να είναι τύποι, όχι γραμμένοι αριθμοί
  const lost = rowsOf.flatMap(([, r]) => [m.cols.sum, m.cols.sumK, m.cols.sumA, m.cols.avail].filter(Boolean).map(c => c + r)).filter(ref => !fr.hasFormula(ref));
  if (lost.length) throw new TemplateError('Το template της ' + reportOf(s.settings) + ' έχει χάσει τύπους στα κελιά ' + lost.slice(0, 6).join(', ') + (lost.length > 6 ? ' κ.ά.' : '') + '. Τα αθροίσματα δεν θα ήταν σωστά. Βάλε ξανά τους τύπους ή σβήσε το δικό σου hkai.xlsx από τον φάκελο templates (ή διάλεξε άλλο template στα Αρχεία Excel).');
  const prov = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  for (const [rank, r] of rowsOf) {
    const x = hk.rank[rank];
    if (prov[rank] > 0) fr.set((m.cols.prov || 'B') + r, prov[rank]);
    fr.set(m.cols.placed + r, x.n - x.attached).set(m.cols.attached + r, x.attached);
    for (const k of HK_KEYS) if (m.cols[k]) fr.set(m.cols[k] + r, x.c[k] || null);
    if (m.cols.ab && !fr.hasFormula(m.cols.ab + r)) fr.set(m.cols.ab + r, x.c.ab || null);
  }
  // «Προβλέπονται» στις γραμμές των συνόλων: το έντυπο δεν έχει τύπο εκεί, οπότε γράφεται το άθροισμα
  if (Object.values(prov).some(n => n > 0)) {
    const pc = m.cols.prov || 'B'; const sumOf = (list: string[]) => list.reduce((a, r) => a + (prov[r] || 0), 0);
    const last = (list: string[]) => Math.max(...list.map(r => m.rows[r] || 0));
    const tot = (r: number, n: number) => { if (r > 0 && /ΣΥΝΟΛΟ/.test(norm(fr.get('A' + r) || '')) && !fr.hasFormula(pc + r)) fr.set(pc + r, n || null); };
    tot(last(R.off) + 1, sumOf(R.off)); tot(last(R.nco) + 1, sumOf(R.nco)); tot(last(R.nco) + 2, sumOf(ALL));
  }
  // κείμενα που γράφει ο χρήστης στην οθόνη ΗΚΑΙ (πίσω σελίδα)
  const tx = s.hkaiManual?.[d]?.text || {};
  for (const [k, ref] of Object.entries(HK_TEXT)) if (tx[k]) bk.set(ref, tx[k]);
  const off = hkOffText(s, d); if (off) bk.set('A18', off);
  // Πίσω όψη: φρουρές της ημέρας, αποφάσεις Διοικητή, όργανα υπηρεσίας
  const g = s.guards[d] || {};
  let night = 0, day24 = 0;
  for (const k in g) { const p = postBy(s, k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  if (hkOn(s.settings, 'grd')) bk.set('D5', night || null).set('D8', day24 || null);
  // Κατάσταση οχημάτων (μία γραμμή στο έντυπο) και ατυχήματα, όταν η Ίλη τα χρησιμοποιεί
  const v = s.settings.hkai?.veh;
  if (hkOn(s.settings, 'veh') && v) { if (v.type) bk.set('F5', v.type); bk.set('G5', v.prov ?? null).set('H5', v.kin ?? null).set('I5', v.maint ?? null).set('J5', v.dmg ?? null); }
  if (hkOn(s.settings, 'acc')) for (const [k, ref] of Object.entries(HK_ACC)) if (tx[k]?.trim()) bk.set(ref, tx[k].trim());
  // 1. ΕΓΓΡΑΦΕΣ, 2. ΔΙΑΓΡΑΦΕΣ, 3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ και 5. ΑΙΤΗΣΕΙΣ: αριθμημένες («1.»), μία ανά γραμμή, με υπογραμμισμένη τη διάρκεια της ποινής
  const egr = hkaiEgrLines(s, d), dia = hkaiDiaLines(s, d), leaves = hkaiLeaveLines(s, d), puns = hkaiPunLines(s, d), reqs = hkaiReqLines(s, d);
  if (egr.length) await wb.setRich(bk, 'G8', egr);
  if (dia.length) await wb.setRich(bk, 'G9', dia);
  if (leaves.length) await wb.setRich(bk, 'G10', leaves);
  if (puns.length) await wb.setRich(bk, 'G11', puns);
  if (reqs.length) await wb.setRich(bk, 'G12', reqs);
  const og = hkOrgans(s, d); const ly = og.ly && pm.get(og.ly), dy = og.dy && pm.get(og.dy);
  if (ly) bk.set('A22', 'Λ/Υ: ' + who(ly));
  if (dy) bk.set('A23', 'Δ/Υ: ' + who(dy));
  bk.set('L23', s.settings.place + ', ' + hkDate(d));
  const t = /^([A-Z]+)(\d+)$/.exec(m.title); const hr = t && Number(t[2]) >= 3 ? [t[1] + (Number(t[2]) - 3), t[1] + (Number(t[2]) - 2)] : [];
  const front: SheetPart = { ws: fr, key: 'front', more: [blockOf(fr, 'head', hr), blockOf(fr, 'date', [m.date])] };
  const layout = await signSheets(wb, fr === bk ? [front] : [front, { ws: bk, key: 'back', more: [blockOf(bk, 'date', ['L23'])] }], s, 'hkai', opts.sigs, warnings);
  return { name: reportOf(s.settings) + ' ' + dmyy(d).replace(/\//g, '.') + '.xlsx', data: await wb.save(), warnings, layout };
}

// Οι δικές σου γραμμές (βαθμοί) που δεν έχει το έντυπο: νέα γραμμή κάτω από αυτήν που διάλεξες, με τη μορφή και τους
// τύπους της από πάνω (Σύνολο, κωλυόμενοι, απόντες, διαθέσιμοι), μέσα στο σύνολο της ομάδας. Ό,τι είναι από κάτω
// (σύνολα, υπογραφές, ημερομηνία) κατεβαίνει μία γραμμή, και οι αριθμημένες λίστες στο πλάι συνεχίζουν σωστά.
function addHkRows(wb: Workbook, fr: Sheet, m: HkaiMap, R: HkRows, warnings: string[]) {
  for (const group of [R.off, R.nco]) group.forEach((key, i) => {
    if (m.rows[key] > 0) return;
    const prev = group.slice(0, i).reverse().find(k => m.rows[k] > 0);
    if (!prev) { warnings.push('Η γραμμή «' + key + '» δεν μπήκε στο έντυπο: δεν βρέθηκε γραμμή από πάνω της'); return; }
    const rowsNow = group.map(k => m.rows[k]).filter(r => r > 0);
    const after = m.rows[prev], first = Math.min(...rowsNow), last = Math.max(...rowsNow), r = after + 1;
    fr.insertRows(after, 1, after, wb);
    for (const k in m.rows) if (m.rows[k] > after) m.rows[k]++;
    const down = (ref: string) => ref.replace(/(\d+)$/, (_x, n: string) => String(Number(n) > after ? Number(n) + 1 : Number(n)));
    m.title = down(m.title); m.date = down(m.date);
    m.rows[key] = r;
    // στο τέλος της ομάδας: τα σύνολα (SUM ως την τελευταία) φτάνουν και στη νέα, και η παχιά γραμμή από κάτω πάει σε αυτήν
    if (after === last) {
      fr.growFormulas(fr.name, first, last, r);
      if (after - 1 >= first) for (const c of [...fr.cells()].filter(x => x.r === after)) { const st = fr.style(colName(c.c) + (after - 1)); if (st != null) fr.setStyle(colName(c.c) + after, st); }
    }
    // οι τύποι της γραμμής από πάνω (σχετικές αναφορές στη γραμμή της), για τη νέα γραμμή
    for (const c of [...fr.cells()].filter(x => x.r === after)) {
      const f = fr.formula(colName(c.c) + after); if (!f) continue;
      fr.setFormula(colName(c.c) + r, unesc(f).replace(new RegExp('(?<![$\\d])([A-Z]{1,3})' + after + '(?!\\d)', 'g'), '$1' + r));
    }
    // αριθμημένες λίστες στο πλάι (π.χ. ΜΕΤΑΒΟΛΕΣ: ΕΓΓΡΑΦΗΚΑΝ 1, 2, 3…): η νέα γραμμή παίρνει τον επόμενο αριθμό
    for (const c of [...fr.cells()].filter(x => x.r === after)) {
      const L = colName(c.c), num = (row: number) => { const v = (fr.get(L + row) || '').trim(); return /^\d+$/.test(v) && !fr.formula(L + row) ? Number(v) : null; };
      const k = num(after); if (k == null) continue;
      let n = k + 1; fr.set(L + r, String(n));
      for (let x = r + 1; num(x) === n; x++) fr.set(L + x, String(++n));
    }
  });
}

// Τα ονόματα των γραμμών: στον λόχο οι αξιωματικοί (Ταγματάρχες, Λοχαγοί…) και οι δικές σου. Αν αλλάζει έστω μία,
// γράφονται όλες (με κεφαλαία, όπως ό,τι γράφει η εφαρμογή), για να είναι ίδιες στη στήλη· αλλιώς το έντυπο μένει ως έχει.
function hkRowLabels(fr: Sheet, m: HkaiMap, rows: string[], s: AppState) {
  const at = (r: number) => ['A', 'B', 'C', 'D'].find(c => { const v = (fr.get(c + r) || '').trim(); return v && !/^[\d.,]+$/.test(v) && !fr.formula(c + r); });
  const todo = rows.filter(k => m.rows[k] > 0).map(k => ({ r: m.rows[k], col: at(m.rows[k]) || at(m.rows[k] - 1) || 'A', label: hkRowLabel(k, s.settings) }));
  if (todo.every(x => itemKey(fr.get(x.col + x.r) || '') === itemKey(x.label))) return;
  for (const x of todo) fr.set(x.col + x.r, x.label);
}

// Η κεφαλίδα της ΗΚΑΙ (Michael, 18/10): οι 2 γραμμές πάνω από το «ΚΑΤΑΣΤΑΣΗ», στη στήλη του τίτλου. Μόνο αν τη γράψεις
// στις Ρυθμίσεις ή στην ΗΚΑΙ· αλλιώς μένει του εντύπου. Στον λόχο με τις λέξεις του λόχου, όπως όλο το έντυπο.
function hkHead(fr: Sheet, m: HkaiMap, s: AppState) {
  const head = (s.settings.hkai?.head || []).map(x => (x || '').trim());
  const t = /^([A-Z]+)(\d+)$/.exec(m.title); if (!t || !head.some(Boolean) || Number(t[2]) < 3) return;
  head.slice(0, 2).forEach((x, i) => { if (x) fr.set(t[1] + (Number(t[2]) - 3 + i), formText(s.settings, x)); });
}

// ------------------------------------------------------------------ Εξοδούχοι / Παραμένοντες (δείγμα 10)
export function outsAndStay(s: AppState, d: ISODate): { outs: { p: Person; st: Status }[]; stay: { p: Person; note: string }[] } {
  const outs: { p: Person; st: Status }[] = []; const stay: { p: Person; note: string }[] = [];
  for (const p of activePeople(s)) {
    // γύρισε ως την ώρα εξόδου: μετρά σαν να ήταν μέσα (εξοδούχος ή παραμένων)
    const ss = statusesFrom(s.statuses, p.id, d, outMin(s.rules));
    const o = ss.find(x => TYPES[x.type].cat === 'out');
    if (o) { outs.push({ p, st: o }); continue; }
    if (ss.some(x => TYPES[x.type].away)) continue; // σε άδεια/νοσοκομείο: ούτε εξοδούχος ούτε παραμένων
    const post = postOf(s, d, p.id);
    // και η ποινή που ακόμα αιτείται κρατά μέσα (γραφέας, 10/10)
    const pend = s.statuses.filter(x => x.pid === p.id && x.type === 'PUN' && x.pending && coversDay(x, d));
    const note = [...ss.map(x => statusLbl(x, s.settings.lists)), ...pend.map(x => statusLbl(x, s.settings.lists)), post ? post.label : '', p.post || ''].filter(Boolean).join(', ');
    stay.push({ p, note: norm(withNote(note, outNoteOf(s, d, p.id))) });
  }
  // ανά θάλαμο, όπως έρχονται τα χαρτιά (γραφέας, 10/10)
  outs.sort((a, b) => byRoom(a.p, b.p)); stay.sort((a, b) => byRoom(a.p, b.p));
  return { outs, stay };
}
// Παρατηρήσεις εξοδούχου: ΔΝ / ΔΝ ΣΚ, η υπηρεσία της επόμενης μέρας (γυρίζει το πρωί γι' αυτήν), και η παρατήρηση
// της μέρας σε παρένθεση: «ΔΝ ΣΚ, ΥΠΗΡΕΣΙΑ ΚΥΡΙΑΚΗ Λ/Υ 14:00 (ΙΑΤΡΟΣ ΣΤΕΠ)»
export function outsNote(s: AppState, d: ISODate, pid: number, st: Status): string {
  const duty = st.type === 'DN' ? dutyAt(s, addDays(d, 1), pid) : null;
  const auto = [st.type === 'DN' ? outLbl(st) : isWk(st) ? 'ΔΝ ΣΚ' : '', duty && 'ΥΠΗΡΕΣΙΑ ' + DOW_FULL[parseD(addDays(d, 1)).getDay()] + ' ' + duty.label + (duty.time ? ' ' + duty.time : '')].filter(Boolean).join(', ');
  return norm(withNote(auto, outNoteOf(s, d, pid)));
}
// sheets: φύλλα εξοδούχων και παραμενόντων στο template (Αρχεία Excel)
export async function fillOuts(tpl: Buffer, s: AppState, d: ISODate, sheets: { outs?: string; stay?: string } = {}, sigs?: Sig[] | null): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); wb.widen = true; await unitWords(wb, s); const warnings: string[] = []; const done: SheetPart[] = [];
  const { outs, stay } = outsAndStay(s, d);
  const lists: [string, { p: Person; note: string }[], string | undefined][] = [
    ['ΕΞΟΔΟΥΧΟΙ', outs.map(x => ({ p: x.p, note: outsNote(s, d, x.p.id, x.st) })), sheets.outs],
    ['ΠΑΡΑΜΕΝΟΝΤΕΣ', stay, sheets.stay]
  ];
  for (const [title, list, name] of lists) {
    const ws = await wb.sheet(name && wb.hasSheet(name) ? name : title); const key = title === 'ΕΞΟΔΟΥΧΟΙ' ? 'outs' : 'stay';
    ws.set('H1', s.settings.unit[0]).set('H2', s.settings.unit[1]).set('H3', s.settings.unit[2]);
    ws.set('A5', title + ' ΤΗΣ ' + titleDate(d, false));
    if (list.length > 1) ws.insertRows(7, list.length - 1, 7, wb);
    list.forEach(({ p, note }, i) => {
      const r = 7 + i;
      ws.set('B' + r, p.rank).set('C' + r, p.spec).set('D' + r, p.last).set('E' + r, p.first + fatherTxt(p))
        .set('F' + r, p.room ?? '').set('G' + r, p.phone).set('H' + r, note);
    });
    const foot = 9 + Math.max(list.length - 1, 0);
    ws.set('G' + foot, s.settings.place + ', ' + dmy(d).replace(/\//g, '-'));
    if (!done.some(x => x.ws === ws)) done.push({ ws, key, more: [blockOf(ws, 'head', ['H1', 'H2', 'H3']), blockOf(ws, 'date', ['G' + foot])] });
  }
  const layout = await signSheets(wb, done, s, 'outs', sigs, warnings);
  return { name: 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings, layout };
}
