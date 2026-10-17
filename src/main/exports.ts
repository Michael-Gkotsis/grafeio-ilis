// Συμπλήρωση των εντύπων της Ίλης από την κατάσταση της εφαρμογής (06, 11).
// Κάθε συνάρτηση παίρνει το κενό template και επιστρέφει το συμπληρωμένο αρχείο.
import { dm, dmy, dmyy, hkDate, parseD, MON_SHORT, type ISODate } from '../shared/dates';
import { norm } from '../shared/text';
import { byName, hkaiLeaveLines, hkaiPunLines, hkaiReqLines } from '../shared/hkaiText';
import { TYPES, coversDay, fatherTxt, fullName, type AppState, type Person, type Phase, type Status } from '../shared/domain';
import { statusLbl } from '../shared/ranks';
import { activePeople, personMap, statusesOn, hkaiCounts, postBy, postOf, HK_OFFICERS, HK_NCO } from '../shared/rules';
import { Workbook } from './xlsx';
import { hkaiMapOf, type HkaiMap } from '../shared/sources';
import { FROURA_FORMS, absenceText, dutyName, frouraLayout, lyLine } from '../shared/froura';
export { FROURA_FORMS };

export const who = (p: Person) => [p.rank, p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
const titleDate = (d: ISODate, longYear: boolean) => { const x = parseD(d); return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + (longYear ? x.getFullYear() : String(x.getFullYear()).slice(2)); };
export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);

export interface ExportResult { name: string; data: Buffer; warnings: string[] }

// ------------------------------------------------------------------ ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01) και ΦΡΟΥΡΑ ΣΠΕΝ (φωτογραφία γραφέα)
const FROURA_ROWS = 6; // γραμμές τιμωρημένων και απόντων στο κενό έντυπο
export function punishedOn(s: AppState, d: ISODate): Status[] {
  return s.statuses.filter(x => x.type === 'PUN' && !x.pending && coversDay(x, d));
}
export function absentOn(s: AppState, d: ISODate): Status[] {
  // απόντες του εντύπου υπηρεσιών: άδειες, αναρρωτικές, νοσοκομείο (όχι οι εξοδούχοι)
  return s.statuses.filter(x => TYPES[x.type].away && TYPES[x.type].cat !== 'out' && coversDay(x, d));
}

// sheet: φύλλο του template (Αρχεία Excel)· κενό = το πρώτο
export async function fillFroura(tpl: Buffer, s: AppState, d: ISODate, phase: Phase = s.settings.phase || 'sven', sheet?: string): Promise<ExportResult> {
  const form = FROURA_FORMS[phase];
  const wb = await Workbook.open(tpl); const ws = await wb.sheet(sheet && wb.hasSheet(sheet) ? sheet : 0); const pm = personMap(s.people);
  const warnings: string[] = [];
  const g = s.guards[d] || {};
  ws.set('L1', s.settings.unit[0]).set('L2', s.settings.unit[1]).set('L3', s.settings.unit[2]);
  ws.set('A5', 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ ' + titleDate(d, true));
  const p = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  ws.set('A9', 'Λ/Υ: ' + (p('ly') ? lyLine(p('ly')!) : ''));
  ws.set('A10', 'Δ/Υ: ' + (p('dy') ? lyLine(p('dy')!) : ''));
  const lay = frouraLayout(s, d, phase); const extra = lay.extra;
  for (const k of lay.foreign) warnings.push('Η θέση ' + (postBy(s, k)?.label || k) + ' δεν ανήκει στη ΦΡΟΥΡΑ ' + (phase === 'spen' ? 'ΣΠΕΝ' : 'ΣΒΕΝ') + ' και δεν γράφτηκε');
  lay.cells.forEach((names, at) => { if (names.length) ws.set(at, names.join('\n')); });
  if (extra.length) ws.insertRows(form.extra.after, extra.length, form.extra.after, wb);
  extra.forEach((x, i) => { const r = form.extra.after + 1 + i; ws.set(form.extra.label + r, x.label).set(form.extra.name + r, x.name); });
  const first = form.list + extra.length;
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
    if (b) ws.set('I' + r, dutyName(b.p)).set('J' + r, absenceText(b.x.kind, TYPES[b.x.type].long)).set('K' + r, dm(b.x.from)).set('L' + r, b.x.open ? '' : dm(b.x.to)).set('M' + r, b.x.note || '');
  }
  return { name: 'ΦΡΟΥΡΑ ' + (phase === 'spen' ? 'ΣΠΕΝ ' : '') + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings };
}

// ------------------------------------------------------------------ ΗΚΑΙ (δείγμα 15)
// στήλες ανά είδος κωλυομένων/απόντων (τα κλειδιά του hkaiCounts)
const HK_KEYS = ['yp', 'ey', 'tim', 'bl', 'os', 'mag', 'sid', 'kin', 'ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh'];
export class TemplateError extends Error {}
// 5. ΑΙΤΗΣΕΙΣ (G12): το ελεύθερο κείμενο γράφεται μαζί με τις αριθμημένες αιτήσεις, στο τέλος
export const HK_TEXT: Record<string, string> = { egr: 'G8', dia: 'G9', loi: 'G19', off: 'A18' };
// front/back: φύλλα μπροστινής και πίσω σελίδας· map: πού μπαίνει κάθε αριθμός (Αρχεία Excel → ΗΚΑΙ)
export async function fillHkai(tpl: Buffer, s: AppState, d: ISODate, opts: { front?: string; back?: string; map?: HkaiMap } = {}): Promise<ExportResult> {
  const wb = await Workbook.open(tpl);
  const pick = (n: string | undefined, i: number) => (n && wb.hasSheet(n) ? n : i);
  const fr = await wb.sheet(pick(opts.front, 0)); const bk = await wb.sheet(pick(opts.back, 1));
  const m = opts.map || hkaiMapOf();
  const pm = personMap(s.people); const warnings: string[] = [];
  const hk = hkaiCounts(s, d);
  fr.set(m.title, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(d));
  fr.set(m.date, s.settings.place + ', ' + hkDate(d));
  const rowsOf: [string, number][] = [...HK_OFFICERS, ...HK_NCO].map(r => [r, m.rows[r]] as [string, number]).filter(([, r]) => r > 0);
  // Προέλεγχος template (έρευνα §3.6): τα αθροίσματα πρέπει να είναι τύποι, όχι γραμμένοι αριθμοί
  const lost = rowsOf.flatMap(([, r]) => [m.cols.sum, m.cols.sumK, m.cols.sumA, m.cols.avail].filter(Boolean).map(c => c + r)).filter(ref => !fr.hasFormula(ref));
  if (lost.length) throw new TemplateError('Το template της ΗΚΑΙ έχει χάσει τύπους στα κελιά ' + lost.slice(0, 6).join(', ') + (lost.length > 6 ? ' κ.ά.' : '') + '. Τα αθροίσματα δεν θα ήταν σωστά. Βάλε ξανά τους τύπους ή σβήσε το δικό σου hkai.xlsx από τον φάκελο templates (ή διάλεξε άλλο template στα Αρχεία Excel).');
  for (const [rank, r] of rowsOf) {
    const x = hk.rank[rank];
    fr.set(m.cols.placed + r, x.n - x.attached).set(m.cols.attached + r, x.attached);
    for (const k of HK_KEYS) if (m.cols[k]) fr.set(m.cols[k] + r, x.c[k] || null);
    if (m.cols.ab && !fr.hasFormula(m.cols.ab + r)) fr.set(m.cols.ab + r, x.c.ab || null);
  }
  // κείμενα που γράφει ο χρήστης στην οθόνη ΗΚΑΙ (πίσω σελίδα)
  const tx = s.hkaiManual?.[d]?.text || {};
  for (const [k, ref] of Object.entries(HK_TEXT)) if (tx[k]) bk.set(ref, tx[k]);
  // Πίσω όψη: φρουρές της ημέρας, αποφάσεις Διοικητή, όργανα υπηρεσίας
  const g = s.guards[d] || {};
  let night = 0, day24 = 0;
  for (const k in g) { const p = postBy(s, k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  bk.set('D5', night || null).set('D8', day24 || null);
  // 3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ και 5. ΑΙΤΗΣΕΙΣ: αριθμημένες («1.»), μία ανά γραμμή, με υπογραμμισμένη τη διάρκεια της ποινής
  const leaves = hkaiLeaveLines(s, d), puns = hkaiPunLines(s, d), reqs = hkaiReqLines(s, d);
  if (leaves.length) await wb.setRich(bk, 'G10', leaves);
  if (puns.length) await wb.setRich(bk, 'G11', puns);
  if (reqs.length) await wb.setRich(bk, 'G12', reqs);
  const ly = g.ly && pm.get(g.ly), dy = g.dy && pm.get(g.dy);
  if (ly) bk.set('A22', 'Λ/Υ: ' + who(ly));
  if (dy) bk.set('A23', 'Δ/Υ: ' + who(dy));
  bk.set('L23', s.settings.place + ', ' + hkDate(d));
  return { name: 'ΗΚΑΙ ' + dmyy(d).replace(/\//g, '.') + '.xlsx', data: await wb.save(), warnings };
}

// ------------------------------------------------------------------ Εξοδούχοι / Παραμένοντες (δείγμα 10)
export function outsAndStay(s: AppState, d: ISODate): { outs: { p: Person; st: Status }[]; stay: { p: Person; note: string }[] } {
  const outs: { p: Person; st: Status }[] = []; const stay: { p: Person; note: string }[] = [];
  for (const p of activePeople(s)) {
    const ss = statusesOn(s.statuses, p.id, d);
    const o = ss.find(x => TYPES[x.type].cat === 'out');
    if (o) { outs.push({ p, st: o }); continue; }
    if (ss.some(x => TYPES[x.type].away)) continue; // σε άδεια/νοσοκομείο: ούτε εξοδούχος ούτε παραμένων
    const post = postOf(s, d, p.id);
    // και η ποινή που ακόμα αιτείται κρατά μέσα (γραφέας, 10/10)
    const pend = s.statuses.filter(x => x.pid === p.id && x.type === 'PUN' && x.pending && coversDay(x, d));
    const note = [...ss.map(x => statusLbl(x, s.settings.lists)), ...pend.map(x => statusLbl(x, s.settings.lists)), post ? post.label : '', p.post || ''].filter(Boolean).join(', ');
    stay.push({ p, note: norm(note) });
  }
  // ανά θάλαμο, όπως έρχονται τα χαρτιά (γραφέας, 10/10)
  outs.sort((a, b) => byRoom(a.p, b.p)); stay.sort((a, b) => byRoom(a.p, b.p));
  return { outs, stay };
}
// sheets: φύλλα εξοδούχων και παραμενόντων στο template (Αρχεία Excel)
export async function fillOuts(tpl: Buffer, s: AppState, d: ISODate, sheets: { outs?: string; stay?: string } = {}): Promise<ExportResult> {
  const wb = await Workbook.open(tpl);
  const { outs, stay } = outsAndStay(s, d);
  const lists: [string, { p: Person; note: string }[], string | undefined][] = [
    ['ΕΞΟΔΟΥΧΟΙ', outs.map(x => ({ p: x.p, note: x.st.type === 'DN' ? 'ΔΝ' : '' })), sheets.outs],
    ['ΠΑΡΑΜΕΝΟΝΤΕΣ', stay, sheets.stay]
  ];
  for (const [title, list, name] of lists) {
    const ws = await wb.sheet(name && wb.hasSheet(name) ? name : title);
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
  }
  return { name: 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings: [] };
}
