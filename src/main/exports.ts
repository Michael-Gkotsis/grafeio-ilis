// Συμπλήρωση των εντύπων της Ίλης από την κατάσταση της εφαρμογής (06, 11).
// Κάθε συνάρτηση παίρνει το κενό template και επιστρέφει το συμπληρωμένο αρχείο.
import { addDays, dm, dmy, dmyy, hkDate, parseD, DOW_FULL, MON_SHORT, type ISODate } from '../shared/dates';
import { dutyAt, isWk, outLbl, outNoteOf, withNote } from '../shared/weekend';
import { norm } from '../shared/text';
import { backBy } from '../shared/hours';
import { byName, hkOrgans, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines } from '../shared/hkaiText';
import { TYPES, DEFAULT_DUTY_START, blocksOf, coversDay, dutyStartOf, hkOn, fatherTxt, fullName, frouraFile, phaseBase, phaseName, PHASE_NAME, type AppState, type Person, type Phase, type Post, type Status } from '../shared/domain';
import { hkRowsOf, itemKey, rankTxt, statusLbl, type HkRows } from '../shared/ranks';
import { formText, hkRowLabel, reportOf, unitKindOf, unitText } from '../shared/unit';
import { activePeople, seatMap, statusesFrom, outMin, dutyMin, hkaiCounts, postBy, postOf, postsOf } from '../shared/rules';
import { Workbook, colName, colNum, sheetSafe, unesc, type Sheet, type XlValue } from './xlsx';
import { HK_COLS, detectHkai, type HkaiMap } from '../shared/sources';
import { hkOffText } from '../shared/cadre';
import { FROURA_FORMS, absenceOf, dutyName, frouraLayout, frouraTables, lyLine, tableRowSpan, type FrouraTable, type TableCols } from '../shared/froura';
import { mapFroura, mapHkBack, mapOuts, textCells, tnorm, type FList, type FNum, type FrouraMap, type FTable, type TCell } from './tplmap';
import { sigsCustom, sigsFor, sigsSaved, type Sig, type SigForm } from '../shared/sigs';
import { SIG_TAG, placeSigs } from './sigs';
import { formPart, xlLook, type XlPart } from '../shared/xlLook';
import { applyMoves, blockOf } from './layout';
import type { Block, LayoutForm, LayoutSheet, Moves } from '../shared/layout';
export { FROURA_FORMS };

export const who = (p: Person) => [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');
const titleDate = (d: ISODate, longYear: boolean) => { const x = parseD(d); return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + (longYear ? x.getFullYear() : String(x.getFullYear()).slice(2)); };
export const byRoom = (a: Person, b: Person) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b);

export interface ExportResult { name: string; data: Buffer; warnings: string[]; layout?: LayoutSheet[]; sheet?: string }   // sheet: το φύλλο του εντύπου (ΠΣΚ: αυτό κρατιέται)

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
// tagOnly: οι υπογραφές μόνο στο {ΥΠΟΓΡΑΦΕΣ} (Excel της εφαρμογής, χωρίς υπογραφές δικές τους)· after, names: Έντυπα (placeSigs)
export interface SheetPart { ws: Sheet; key: string; more: (Block | null)[]; tagOnly?: boolean; after?: number; names?: string[] }
export async function signSheets(wb: Workbook, sheets: SheetPart[], s: AppState, form: SigForm, over: Sig[] | null | undefined, warnings: string[], moves?: (key: string) => Moves | undefined): Promise<LayoutSheet[]> {
  const g = sigsOf(s, form, over); const out: LayoutSheet[] = [];
  const mv = moves || ((key: string) => (form === 'reports' ? undefined : s.settings.layout?.[form as LayoutForm]?.[key]));
  const L = xlLook(s.settings); const hdr = formPart(L, 'hdr'), sig = formPart(L, 'sig');
  for (const x of sheets) {
    const sg = await placeSigs(wb, x.ws, g.sigs, g.def, warnings, { tagOnly: x.tagOnly, after: x.after, names: x.names });
    const blocks = [...x.more.filter((b): b is Block => !!b), ...sg];
    // γράμματα της κεφαλίδας και των υπογραφών (Ρυθμίσεις › Γράμματα Excel), πριν μετακινηθούν
    for (const b of blocks) { const o = b.id === 'head' ? hdr : /^s\d/.test(b.id) ? sig : null; if (o) await restyle(wb, x.ws, b, o); }
    out.push({ key: x.key, sheet: x.ws.name, blocks: applyMoves(wb, x.ws, blocks, mv(x.key)) });
  }
  return out;
}

// Τα Excel που φτιάχνει η εφαρμογή (excel.ts: Έλεγχος υπηρεσιών, Δυναμολόγιο, Στελέχη, Οπλισμός) όπως όλα τα έντυπα
// (Michael, 22/10): οι υπογραφές της λίστας τους μία κενή γραμμή κάτω από κάθε φύλλο, σε όλο το πλάτος του, και μετά ό,τι
// μετακίνησες (κεφαλίδα, ημερομηνία, τίτλος, υπογραφές). Χωρίς υπογραφές και μετακινήσεις το φύλλο μένει όπως ήταν.
export interface MadeMark { sheet: string; key: string; head: string[]; date: string[]; title: string[]; foot: number; cols: number }
export async function signMade(data: Buffer, s: AppState, form: SigForm, marks: MadeMark[], over?: Sig[] | null): Promise<{ data: Buffer; warnings: string[]; layout: LayoutSheet[] }> {
  const wb = await Workbook.open(data); wb.widen = true; const warnings: string[] = [];
  const g = sigsOf(s, form, over); const list = g.sigs ?? g.def;
  const L = xlLook(s.settings); const st = list.length ? await wb.style({ font: L.font, sz: L.sz, b: true, h: 'center', v: 'center' }) : 0;
  const parts: SheetPart[] = [];
  for (const m of marks) {
    if (!wb.hasSheet(m.sheet)) continue;
    const ws = await wb.sheet(m.sheet);
    if (list.length) {
      const r = m.foot + 2; ws.set('A' + r, SIG_TAG).setStyle('A' + r, st);
      if (m.cols > 1) { for (let c = 2; c <= m.cols; c++) ws.setStyle(colName(c) + r, st); ws.addMerge('A' + r + ':' + colName(m.cols) + r); }
    }
    parts.push({ ws, key: m.key, tagOnly: true, more: [blockOf(ws, 'head', m.head), blockOf(ws, 'date', m.date), blockOf(ws, 'title', m.title)] });
  }
  const layout = await signSheets(wb, parts, s, form, over, warnings);
  for (const p of parts) p.ws.markAll();
  return { data: await wb.save(), warnings, layout };
}

// Τα κελιά με κείμενο ενός κομματιού με άλλο μέγεθος, έντονα, πλάγια ή υπογράμμιση· στα κείμενα με μορφή ανά κομμάτι αλλάζει και το μέγεθός τους
async function restyle(wb: Workbook, ws: Sheet, b: Block, o: XlPart) {
  for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) {
    const ref = colName(c) + r; const x = ws.raw(ref); if (!x) continue;
    ws.setStyle(ref, await wb.partStyle(x.s, o));
    if (o.sz && x.inner.includes('<r>')) ws.sizeRuns(ref, o.sz);
  }
}

// ------------------------------------------------------------------ ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01) και ΦΡΟΥΡΑ ΣΠΕΝ (φωτογραφία γραφέα)
export function punishedOn(s: AppState, d: ISODate): Status[] {
  return s.statuses.filter(x => x.type === 'PUN' && !x.pending && coversDay(x, d));
}
export function absentOn(s: AppState, d: ISODate): Status[] {
  // απόντες του εντύπου υπηρεσιών: άδειες, αναρρωτικές, νοσοκομείο (όχι οι εξοδούχοι)· όχι όποιος γυρίζει ως τις 14:00
  return s.statuses.filter(x => TYPES[x.type].away && TYPES[x.type].cat !== 'out' && coversDay(x, d) && !backBy(x, d, dutyMin(s.settings)));
}

// Πίνακες των δικών σου υπηρεσιών κάτω από τους πίνακες του εντύπου, ανά δύο δίπλα δίπλα (στις στήλες των δύο πρώτων
// πινάκων του εντύπου), με μία κενή γραμμή πριν από κάθε σειρά πινάκων. Επιστρέφει πόσες γραμμές μπήκαν.
interface ExtraAt { after: number; look: TableCols | null; left: TableCols; right: TableCols | null }
function frouraTablesInto(wb: Workbook, ws: Sheet, at0: ExtraAt, tabs: FrouraTable[]): number {
  if (!tabs.length) return 0;
  const lk = at0.look; const st = lk ? { aa: ws.style(lk.aa), name: ws.style(lk.name), hours: ws.style(lk.hours), note: ws.style(lk.note) } : { aa: null, name: null, hours: null, note: null };
  const groups: { t: FrouraTable; at: TableCols }[][] = [];
  const step = at0.right ? 2 : 1;
  for (let i = 0; i < tabs.length; i += step) groups.push([{ t: tabs[i], at: at0.left }, ...(at0.right && tabs[i + 1] ? [{ t: tabs[i + 1], at: at0.right }] : [])]);
  const height = (t: FrouraTable) => t.rows.reduce((a, x) => a + tableRowSpan(x), 0);
  const n = groups.reduce((a, g) => a + 2 + Math.max(...g.map(x => height(x.t))), 0);
  const after = at0.after; ws.insertRows(after, n, after + 1, wb);
  const put = (ref: string, v: string | null, style: number | null) => { ws.set(ref, v); if (style != null) ws.setStyle(ref, style); };
  // ένα νούμερο σε rs γραμμές (μία ανά βάρδια): Α/Α, όνομα και ΠΑΡ/ΣΕΙΣ ενωμένα κάθετα, οι ώρες μία σε κάθε γραμμή
  const line = (at: TableCols, t: FrouraTable, r: number, v: { aa: string; name: string; hours: string[]; note: string }) => {
    const rs = Math.max(1, v.hours.length); const end = r + rs - 1;
    const last = colName(colNum(t.hours ? at.hours : at.note) - 1);
    for (let rr = r; rr <= end; rr++) {
      put(at.aa + rr, rr === r ? v.aa : null, st.aa); put(at.note + rr, rr === r ? v.note : null, st.note);
      for (let c = colNum(at.name); c <= colNum(last); c++) put(colName(c) + rr, rr === r && c === colNum(at.name) ? v.name : null, st.name);
      if (t.hours) put(at.hours + rr, v.hours[rr - r] || '', st.hours);
    }
    if (last !== at.name || end > r) ws.addMerge(at.name + r + ':' + last + end);
    if (end > r) { ws.addMerge(at.aa + r + ':' + at.aa + end); ws.addMerge(at.note + r + ':' + at.note + end); }
  };
  let r = after + 1;
  for (const g of groups) {
    r++;
    for (const { t, at } of g) {
      line(at, t, r, { aa: 'Α/Α', name: t.title, hours: ['ΩΡΕΣ'], note: 'ΠΑΡ/ΣΕΙΣ' });
      let rr = r + 1;
      for (const x of t.rows) { line(at, t, rr, { aa: x.n, name: x.name, hours: x.shifts && x.shifts.length > 1 ? x.shifts : [x.hours], note: '' }); rr += tableRowSpan(x); }
    }
    r += 1 + Math.max(...g.map(x => height(x.t)));
  }
  return n;
}

// Το φύλλο ενός εντύπου μέσα στο template: αυτό που διάλεξες, αλλιώς το πρώτο που έχει κάποιο από τα κείμενα του εντύπου
async function sheetWith(wb: Workbook, want: string | undefined, re: RegExp): Promise<string> {
  if (want && wb.hasSheet(want)) return want;
  const names = wb.sheetNames();
  for (const n of names) if (re.test(tnorm(n))) return n;
  for (const n of names) if (textCells(await wb.values(n, 60, 30)).some(x => re.test(x.t))) return n;
  return names[0];
}
// «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ» → «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 12 ΟΚΤ 2026»· χωρίς άρθρο στο τέλος μπαίνει «ΤΗΝ»
const withDate = (raw: string, date: string, art = 'ΤΗΝ') => {
  const t = raw.replace(/\s+/g, ' ').trim().replace(/\s*\d{1,2}([/.\-]\d{1,2}[/.\-]\d{2,4}| [Α-ΩA-Zα-ω]{3,} \d{2,4})\s*$/, '').trim();
  return /(^|\s)(ΤΗΝ|ΤΗΣ|ΓΙΑ|ΣΤΙΣ|ΗΜΕΡΑΣ|ΗΜΕΡΟΜΗΝΙΑ:?)$/i.test(t) || !t ? (t + ' ' + date).trim() : t + ' ' + art + ' ' + date;
};
const refOf = (c: number, r: number) => colName(c) + r;

// Οι θέσεις της φρουράς στα κελιά του template: κάθε πίνακας παίρνει τις θέσεις του είδους του (θαλαμοφύλακες, οπλοφύλακες,
// μαγειρεία, σκοποί ή δική σου υπηρεσία με το όνομά της), με τη σειρά, μία σε κάθε νούμερο· οι σκοποί ανά ζεύγος, στο νούμερο
// της σκοπιάς τους («3η»). Ό,τι δεν βρίσκει θέση μπαίνει σε δικό του πίνακα από κάτω (frouraTables).
interface Seat { ref: string; t: FTable | null; n: FNum | null }
function seatFroura(map: FrouraMap, posts: Post[]): Map<string, Seat> {
  const out = new Map<string, Seat>();
  const kindOfPost = (x: Post, own: Set<string>) => (own.has('b:' + x.block) ? 'b:' + x.block : x.kind);
  const own = new Set(map.tables.map(t => t.kind).concat(map.single.map(x => x.kind)).filter(k => k.startsWith('b:')));
  const groupsOf = (ps: Post[]) => { const g: Post[][] = []; for (const p of ps) { const k = p.rot != null && p.kind === 'sk' ? 'r' + p.rot : p.k; const x = g.find(y => (y[0].rot != null && y[0].kind === 'sk' ? 'r' + y[0].rot : y[0].k) === k); if (x) x.push(p); else g.push([p]); } return g; };
  const kinds = [...new Set(posts.filter(x => x.k !== 'ly' && x.k !== 'dy').map(x => kindOfPost(x, own)))];
  for (const kind of kinds) {
    const groups = groupsOf(posts.filter(x => x.k !== 'ly' && x.k !== 'dy' && kindOfPost(x, own) === kind));
    const slots: Seat[] = [...map.tables.filter(t => t.kind === kind).flatMap(t => t.nums.map(n => ({ ref: refOf(t.name, n.r), t, n }))),
      ...map.single.filter(x => x.kind === kind).map(x => ({ ref: refOf(x.c, x.r), t: null, n: null }))];
    // σκοποί: «3η» → το ζεύγος της 3ης σκοπιάς (αν τα νούμερα του εντύπου ταιριάζουν με των θέσεων)
    const numOf = (x: string) => Number((/^(\d+)/.exec(x) || [])[1] || NaN);
    const byNum = kind === 'sk' && slots.some(sl => sl.n && groups.some(g => numOf(g[0].short) === numOf(sl.n!.label)));
    groups.forEach((g, i) => {
      const sl = byNum ? slots.find(x => x.n && numOf(x.n.label) === numOf(g[0].short)) : slots[i];
      if (sl) for (const p of g) out.set(p.k, sl);
    });
  }
  return out;
}

// sheet: φύλλο του template (Αρχεία Excel)· κενό = αυτό που έχει την «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ» (ή τους πίνακες)
// Κάθε στοιχείο γράφεται εκεί που το έχει το template (tplmap.ts): κεφαλίδα, τίτλος, Λ/Υ, Δ/Υ, πίνακες, τιμωρημένοι και απόντες
export async function fillFroura(tpl: Buffer, s: AppState, d: ISODate, phase: Phase = s.settings.phase || 'sven', sheet?: string, sigs?: Sig[] | null): Promise<ExportResult> {
  // οι στήλες φαρδαίνουν όσο χρειάζεται: το έντυπο τυπώνεται σε μία σελίδα (fitToPage), απλώς λίγο μικρότερο
  const wb = await Workbook.open(tpl); wb.widen = true; await unitWords(wb, s);
  const name = await sheetWith(wb, sheet, /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ|^ΘΑΛΑΜΟΦΥΛΑΚ|^ΦΡΟΥΡΑ/);
  const ws = await wb.sheet(name); const pm = seatMap(s);
  const warnings: string[] = [];
  const blocks = blocksOf(s.settings, phase);
  const ownNames: Record<string, string> = {};
  for (const b of blocks) if (b.custom || !['ly', 'th', 'op', 'mg', 'sk', 'tae'].includes(b.kind)) ownNames[tnorm(b.name)] = 'b:' + b.id;
  const vals = await wb.values(name, 400, 40); const raw = (c: TCell) => String(vals[c.r - 1]?.[c.c - 1] ?? '');
  const map = mapFroura(vals, ws.merges(), ownNames);
  const g = s.guards[d] || {};
  const posts = postsOf(s.settings); const seats = seatFroura(map, posts);
  // γραμμές που μπαίνουν (σε γραμμές του template): down() = πού πήγε μια γραμμή του template
  const ins: { after: number; n: number }[] = [];
  const down = (r: number) => r + ins.filter(x => x.after < r).reduce((a, x) => a + x.n, 0);
  const insert = (after: number, n: number, tpl0 = after) => { if (n <= 0) return; ws.insertRows(down(after), n, down(tpl0), wb); ins.push({ after, n }); };
  // νούμερα με άλλο πλήθος βαρδιών: στους πίνακες με ΩΡΕΣ που είναι δίπλα δίπλα με ίδιες γραμμές, μπαίνουν γραμμές μέσα στο
  // κουτί (το όνομα, το Α/Α και οι ΠΑΡ/ΣΕΙΣ μεγαλώνουν μαζί) ή όσες περισσεύουν κρύβονται· αλλιώς οι ώρες χωράνε στις γραμμές του
  const allNums = map.tables.flatMap(t => t.nums);
  const rowsOf = new Map<number, { h: number; aligned: boolean; need: number | null }>();
  for (const t of map.tables) for (const n of t.nums) {
    if (rowsOf.has(n.r)) continue;
    const touch = allNums.filter(m => m.r <= n.r + n.h - 1 && m.r + m.h - 1 >= n.r);
    rowsOf.set(n.r, { h: n.h, aligned: touch.every(m => m.r === n.r && m.h === n.h), need: null });
  }
  const shiftsOwn = (id: string) => dutyStartOf(s.settings) !== DEFAULT_DUTY_START || !!blocks.find(b => b.id === id)?.shift;
  for (const x of posts) { const st = seats.get(x.k); if (!st?.n || !st.t?.hours || !x.slots) continue; const k = rowsOf.get(st.n.r)!; k.need = Math.max(k.need || 1, x.slots.length); }
  const grow = [...rowsOf.entries()].filter(([, k]) => k.aligned && k.need != null && k.need !== k.h).sort((a, b) => a[0] - b[0]);
  for (const [r, k] of grow) if (k.need! > k.h) insert(k.h >= 2 ? r + k.h - 2 : r, k.need! - k.h);
  for (const [r, k] of grow) for (let j = k.need!; j < k.h; j++) ws.setRowHidden(down(r) + j);
  const at = (ref: string) => { const m = /^([A-Z]+)(\d+)$/.exec(ref)!; return m[1] + down(+m[2]); };
  // κεφαλίδα: στα κελιά του template· αν έχει λιγότερες γραμμές, οι υπόλοιπες στα κενά κελιά από κάτω (πάνω από τον τίτλο)
  const head = headCells(map.head, map.title?.r ?? map.ly?.r ?? 0, (r, c) => ws.get(refOf(c, r)) != null);
  s.settings.unit.forEach((u, i) => { const h = head[i]; if (h && (i < map.head.length || u)) ws.set(refOf(h.c, h.r), u); });
  if (map.title) ws.set(refOf(map.title.c, map.title.r), withDate(raw(map.title), titleDate(d, true)));
  else warnings.push('Το template δεν έχει τίτλο «ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ»: η ημερομηνία δεν γράφτηκε');
  const p = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  for (const [k, cell, l] of [['ly', map.ly, 'Λ/Υ'], ['dy', map.dy, 'Δ/Υ']] as const) {
    if (!cell) { if (p(k)) warnings.push('Το template δεν έχει «' + l + ':»: ο ' + l + ' δεν γράφτηκε'); continue; }
    const t = (raw(cell) || l + ':').replace(/\s+$/, ''); const lab = t.includes(':') ? t.slice(0, t.indexOf(':') + 1) : t + ':';
    ws.set(refOf(cell.c, cell.r), lab + ' ' + (p(k) ? lyLine(p(k)!) : ''));
  }
  const pos: Record<string, string> = {}; seats.forEach((st, k) => { pos[k] = st.ref; });
  const lay = frouraLayout(s, d, phase, pos);
  for (const k of lay.foreign) {
    const x = postBy(s, k); const off = x && blocks.find(b => b.id === x.block)?.hidden;
    warnings.push(off ? 'Η υπηρεσία ' + x!.label + ' είναι ανενεργή (Ρυθμίσεις › Υπηρεσίες) και δεν γράφτηκε' : 'Η θέση ' + (x?.label || k) + ' δεν ανήκει στη ΦΡΟΥΡΑ ' + phaseName(s.settings, phase) + ' και δεν γράφτηκε');
  }
  lay.cells.forEach((names, ref) => { if (names.length) ws.set(at(ref), names.join('\n')); });
  // ώρες των νούμερων με βάρδιες: στη στήλη ΩΡΕΣ του πίνακα, μία γραμμή ανά βάρδια. Με τις βάρδιες του εντύπου (2 ώρες από
  // τις 14:00) μένουν όπως είναι στο template, εκτός αν το template δεν τις έχει γραμμένες.
  const done = new Set<string>();
  for (const x of posts) {
    const st = seats.get(x.k); if (!st?.t?.hours || !st.n || !x.slots || done.has(st.ref)) continue;
    const k = rowsOf.get(st.n.r)!; const resized = k.aligned && k.need != null && k.need !== k.h;
    const blank = Array.from({ length: st.n.h }, (_, j) => ws.get(refOf(st.t!.hours!, down(st.n!.r) + j))).every(v => v == null || !String(v).trim());
    if (!shiftsOwn(x.block) && !resized && !blank) continue; done.add(st.ref);
    const n = resized ? k.need! : st.n.h;
    const hs = resized || x.slots.length <= n ? Array.from({ length: n }, (_, j) => x.slots![j] || '') : rowsN(x.slots, n);
    hs.forEach((h, j) => ws.set(refOf(st.t!.hours!, down(st.n!.r) + j), h));
  }
  // δικές σου υπηρεσίες χωρίς θέση στο template: πίνακες κάτω από τους πίνακες του εντύπου, στις στήλες των δύο πρώτων
  const firstRow = map.tables.length ? Math.min(...map.tables.map(t => t.hr)) : 0;
  const lr = map.tables.filter(t => t.hr === firstRow).sort((a, b) => a.name - b.name);
  const colsOf = (t: FTable): TableCols => { const aa = t.aa ?? Math.max(1, t.name - 1); const name = t.aa == null && t.name === aa ? t.name + 1 : t.name; const hours = t.hours ?? (t.note ?? name + 1); return { aa: colName(aa), name: colName(name), hours: colName(hours), note: colName(t.hours == null ? hours + (t.note == null ? 0 : 1) : t.note ?? hours + 1) }; };
  const left = lr[0] ? colsOf(lr[0]) : { aa: 'B', name: 'C', hours: 'D', note: 'E' };
  const right = lr[1] ? colsOf(lr[1]) : null;
  const look = lr[0] ? (() => { const r = down(lr[0].nums[0].r); return { aa: left.aa + r, name: left.name + r, hours: left.hours + r, note: left.note + r }; })() : null;
  const after = map.bottom || Math.max(map.dy?.r || 0, map.ly?.r || 0, map.title?.r || 0, ...map.head.map(h => h.r)) + 1;
  const tabs = frouraTables(s, lay, phase);
  const added = frouraTablesInto(wb, ws, { after: down(after), look, left, right }, tabs);
  if (added) ins.push({ after, n: added });
  // τιμωρημένοι και απόντες: στις στήλες του πίνακά τους· όσοι δεν χωράνε στις έτοιμες γραμμές παίρνουν νέες (με την αρίθμηση)
  const pun = punishedOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const abs = absentOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const lists: { l: FList; rows: { name: string; kind: string; from: string; to: string; note: string }[] }[] = [];
  for (const [l, data, what] of [[map.pun, pun, 'ΤΙΜΩΡΗΜΕΝΟΙ'], [map.abs, abs, 'ΑΠΟΝΤΕΣ']] as const) {
    const rows = data.map(({ x, p: q }) => ({ name: dutyName(q), kind: what === 'ΤΙΜΩΡΗΜΕΝΟΙ' ? norm(x.kind || 'Ποινή') : absenceOf(x), from: dm(x.from), to: x.open ? '' : dm(x.to), note: x.note || '' }));
    if (l) lists.push({ l, rows }); else if (rows.length) warnings.push('Το template δεν έχει πίνακα «' + what + '»: ' + rows.length + ' δεν γράφτηκαν');
  }
  const byFirst = [...new Set(lists.map(x => x.l.first))].sort((a, b) => a - b);
  for (const f of byFirst) {
    const grp = lists.filter(x => x.l.first === f);
    const ready = Math.min(...grp.map(x => x.l.ready)); const need = Math.max(...grp.map(x => x.rows.length));
    const top = down(f);
    if (need > ready) insert(f + ready - 1, need - ready);
    for (let i = 0; i < Math.max(need, ready); i++) {
      const r = top + i;
      for (const { l, rows } of grp) {
        const c = l.cols; const set = (cc: number | undefined, v: string | number) => { if (cc != null && !ws.hasFormula(refOf(cc, r))) ws.set(refOf(cc, r), v); };
        if (i < Math.max(need, l.ready)) set(c.aa, i + 1);
        const x = rows[i]; if (!x) continue;
        set(c.name, x.name); set(c.kind, x.kind); set(c.from, x.from); set(c.to, x.to); set(c.note, x.note);
      }
    }
  }
  // δικό σου έντυπο υπηρεσιών: το φύλλο του template («ΦΡΟΥΡΑ ΣΒΕΝ») παίρνει το όνομά του
  const base = phaseBase(s.settings, phase);
  const shName = base !== phase && name === 'ΦΡΟΥΡΑ ' + PHASE_NAME[base] ? wb.renameSheet(name, 'ΦΡΟΥΡΑ ' + phaseName(s.settings, phase)) : name;
  const headRefs = head.slice(0, Math.max(map.head.length, s.settings.unit.filter(Boolean).length)).map(h => refOf(h.c, h.r));
  const layout = await signSheets(wb, [{ ws, key: 'main', more: [blockOf(ws, 'head', headRefs)] }], s, 'froura', sigs, warnings);
  return { name: frouraFile(s.settings, phase) + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings, layout, sheet: shName };
}
// Τα κελιά της κεφαλίδας: του template, και (αν έχει λιγότερες από 3) τα κενά από κάτω της, πάνω από τη γραμμή stop
function headCells(head: { r: number; c: number }[], stop: number, busy: (r: number, c: number) => boolean): { r: number; c: number }[] {
  const out = [...head];
  while (out.length && out.length < 3) { const l = out[out.length - 1]; const r = l.r + 1; if ((stop && r >= stop) || busy(r, l.c)) break; out.push({ r, c: l.c }); }
  return out;
}
// Βάρδιες σε n γραμμές: λιγότερες αφήνουν κενό, περισσότερες μπαίνουν μαζί («14:00-16:00 · 22:00-00:00»)
function rowsN(sl: string[], n: number): string[] {
  if (sl.length <= n) return Array.from({ length: n }, (_, i) => sl[i] || '');
  const k = Math.ceil(sl.length / n); return Array.from({ length: n }, (_, i) => sl.slice(i * k, i * k + k).join(' · '));
}

// ------------------------------------------------------------------ ΗΚΑΙ (δείγμα 15)
// στήλες ανά είδος κωλυομένων/απόντων (τα κλειδιά του hkaiCounts)
const HK_KEYS = ['yp', 'ey', 'tim', 'bl', 'os', 'mag', 'sid', 'kin', 'ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh'];
export class TemplateError extends Error {}
// front/back: φύλλα μπροστινής και πίσω σελίδας (κενά: όποιο μοιάζει περισσότερο)· map: πού μπαίνει κάθε αριθμός· χωρίς
// αυτό βρίσκεται από τα κείμενα του εντύπου (detectHkai) και από πάνω ό,τι διόρθωσες (cells, Αρχεία Excel → ΗΚΑΙ)
// Η πίσω σελίδα από τις ετικέτες της (tplmap.ts): «1. ΕΓΓΡΑΦΕΣ:» … «6. ΛΟΙΠΑ:», «Υπαξιωματικοί:», φρουρές, οχήματα
export async function fillHkai(tpl: Buffer, s: AppState, d: ISODate, opts: { front?: string; back?: string; map?: HkaiMap; cells?: Partial<HkaiMap>; sigs?: Sig[] | null } = {}): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); await unitWords(wb, s);
  const names = wb.sheetNames(); const place = s.settings.place;
  const own = [...hkRowsOf(s.settings.lists).own], hkNames = s.settings.lists?.hkNames;
  const det = new Map<string, ReturnType<typeof detectHkai>>();
  for (const n of names) det.set(n, detectHkai({ name: n, rows: await wb.values(n, 120, 40) }, place, own, hkNames));
  const frName = opts.front && wb.hasSheet(opts.front) ? opts.front : [...names].sort((a, b) => det.get(b)!.found - det.get(a)!.found)[0];
  const backRe = /^\d\s*\.?\s*ΕΓΓΡΑΦΕΣ|^ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ|^ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|^ΑΠΟΦΑΣΕΙΣ/;
  let bkName = opts.back && wb.hasSheet(opts.back) ? opts.back : undefined;
  if (!bkName) for (const n of names) if (textCells(await wb.values(n, 120, 40)).some(x => backRe.test(x.t))) { bkName = n; break; }
  if (!bkName) bkName = names.find(n => n !== frName && det.get(n)!.found === 0) || frName;
  const fr = await wb.sheet(frName); const bk = await wb.sheet(bkName);
  const c = opts.cells; const m0 = opts.map || det.get(frName)!.map;
  const m: HkaiMap = { title: c?.title || m0.title, date: c?.date || m0.date, rows: { ...m0.rows, ...(c?.rows || {}) }, cols: { ...m0.cols, ...(c?.cols || {}) } };
  const pm = seatMap(s); const warnings: string[] = [];
  const hk = hkaiCounts(s, d);
  const R = hkRowsOf(s.settings.lists); const ALL = [...R.off, ...R.nco];
  const prov = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  addHkRows(wb, fr, m, R, warnings, k => hk.rank[k]?.n > 0 || prov[k] > 0);
  hkRowLabels(fr, m, ALL, s);
  hkHead(fr, m, s);
  if (m.title) fr.set(m.title, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(d));
  else warnings.push('Το template δεν έχει τίτλο «ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ…»: η ημερομηνία δεν γράφτηκε');
  if (m.date) fr.set(m.date, place + ', ' + hkDate(d));
  const rowsOf: [string, number][] = ALL.map(r => [r, m.rows[r]] as [string, number]).filter(([, r]) => r > 0);
  // Προέλεγχος template (έρευνα §3.6): τα αθροίσματα πρέπει να είναι τύποι, όχι γραμμένοι αριθμοί
  const lost = rowsOf.flatMap(([, r]) => [m.cols.sum, m.cols.sumK, m.cols.sumA, m.cols.avail].filter(Boolean).map(c => c + r)).filter(ref => !fr.hasFormula(ref));
  if (lost.length) throw new TemplateError('Το template της ' + reportOf(s.settings) + ' έχει χάσει τύπους στα κελιά ' + lost.slice(0, 6).join(', ') + (lost.length > 6 ? ' κ.ά.' : '') + '. Τα αθροίσματα δεν θα ήταν σωστά. Βάλε ξανά τους τύπους ή σβήσε το δικό σου hkai.xlsx από τον φάκελο templates (ή διάλεξε άλλο template στα Αρχεία Excel).');
  // στήλες που δεν έχει το έντυπο: ό,τι θα έμπαινε εκεί δεν γράφεται, και το λέει
  const miss = new Map<string, number>();
  for (const [rank, r] of rowsOf) {
    const x = hk.rank[rank];
    if (prov[rank] > 0) { if (m.cols.prov) fr.set(m.cols.prov + r, prov[rank]); else miss.set('prov', (miss.get('prov') || 0) + prov[rank]); }
    if (m.cols.placed) fr.set(m.cols.placed + r, x.n - x.attached);
    if (m.cols.attached) fr.set(m.cols.attached + r, x.attached);
    for (const k of HK_KEYS) { if (m.cols[k]) fr.set(m.cols[k] + r, x.c[k] || null); else if (x.c[k]) miss.set(k, (miss.get(k) || 0) + x.c[k]); }
    if (m.cols.ab && !fr.hasFormula(m.cols.ab + r)) fr.set(m.cols.ab + r, x.c.ab || null);
  }
  for (const [k, n] of miss) warnings.push('Το template δεν έχει στήλη «' + (HK_COLS.find(x => x[0] === k)?.[1] || 'Προβλέπονται') + '»: ' + n + ' δεν γράφτηκαν');
  // «Προβλέπονται» στις γραμμές των συνόλων: το έντυπο δεν έχει τύπο εκεί, οπότε γράφεται το άθροισμα
  if (m.cols.prov && Object.values(prov).some(n => n > 0)) {
    const pc = m.cols.prov; const sumOf = (list: string[]) => list.reduce((a, r) => a + (prov[r] || 0), 0);
    const vals = await wb.values(fr.name, 200, 8);
    const last = (list: string[]) => Math.max(...list.map(r => m.rows[r] || 0));
    const tot = (r: number, n: number) => { if (r > 0 && (vals[r - 1] || []).slice(0, 4).some(v => /ΣΥΝΟΛΟ/.test(norm(v ?? ''))) && !fr.hasFormula(pc + r)) fr.set(pc + r, n || null); };
    tot(last(R.off) + 1, sumOf(R.off)); tot(last(R.nco) + 1, sumOf(R.nco)); tot(last(R.nco) + 2, sumOf(ALL));
  }
  // Πίσω όψη: κάθε κείμενο στη θέση της ετικέτας του
  const B = mapHkBack(await wb.values(bk.name, 400, 40), bk.merges(), place);
  const put = (ref: string | undefined, v: string | number | null, what: string) => { if (ref) bk.set(ref, v); else if (v != null && v !== '') warnings.push('Το template δεν έχει «' + what + '»: δεν γράφτηκε'); };
  const tx = s.hkaiManual?.[d]?.text || {};
  if (tx.loi) put(B.loi, tx.loi, '6. ΛΟΙΠΑ');
  const off = hkOffText(s, d); if (off) put(B.off, off, 'Αξιωματικοί:');
  // φρουρές της ημέρας, αποφάσεις Διοικητή, όργανα υπηρεσίας
  const g = s.guards[d] || {};
  let night = 0, day24 = 0;
  for (const k in g) { const p = postBy(s, k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  if (hkOn(s.settings, 'grd')) { put(B.night, night || null, 'Νυκτοφρουρές'); put(B.day24, day24 || null, '24ώρες'); }
  // Κατάσταση οχημάτων (μία γραμμή στο έντυπο) και ατυχήματα, όταν η Ίλη τα χρησιμοποιεί
  const v = s.settings.hkai?.veh;
  if (hkOn(s.settings, 'veh') && v) {
    if (v.type) put(B.vType, v.type, 'Είδη οχημάτων');
    for (const [ref, x, w] of [[B.vProv, v.prov, 'Προβλέπονται'], [B.vKin, v.kin, 'Σε κίνηση'], [B.vMaint, v.maint, 'Για συντήρηση'], [B.vDmg, v.dmg, 'Λόγω βλάβης']] as const) put(ref, x ?? null, w + ' (οχήματα)');
  }
  if (hkOn(s.settings, 'acc')) for (const [k, ref, w] of [['accT', B.accT, 'Ολικές'], ['accP', B.accP, 'Μερικές'], ['accM', B.accM, 'Σε άνδρες']] as const) if (tx[k]?.trim()) put(ref, tx[k].trim(), w + ' (ατυχήματα)');
  // 1. ΕΓΓΡΑΦΕΣ, 2. ΔΙΑΓΡΑΦΕΣ, 3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ και 5. ΑΙΤΗΣΕΙΣ: αριθμημένες («1.»), μία ανά γραμμή, με υπογραμμισμένη τη διάρκεια της ποινής
  const lines: [string | undefined, ReturnType<typeof hkaiEgrLines>, string][] = [[B.egr, hkaiEgrLines(s, d), '1. ΕΓΓΡΑΦΕΣ'], [B.dia, hkaiDiaLines(s, d), '2. ΔΙΑΓΡΑΦΕΣ'], [B.leaves, hkaiLeaveLines(s, d), '3. ΑΔΕΙΕΣ'], [B.puns, hkaiPunLines(s, d), '4. ΠΟΙΝΕΣ'], [B.reqs, hkaiReqLines(s, d), '5. ΑΙΤΗΣΕΙΣ']];
  for (const [ref, ls, w] of lines) if (ls.length) { if (ref) await wb.setRich(bk, ref, ls); else warnings.push('Το template δεν έχει «' + w + ':»: ' + ls.length + ' δεν γράφτηκαν'); }
  const og = hkOrgans(s, d); const ly = og.ly && pm.get(og.ly), dy = og.dy && pm.get(og.dy);
  if (ly) put(B.ly, 'Λ/Υ: ' + who(ly), 'Υπαξιωματικοί:');
  if (dy) put(B.dy, 'Δ/Υ: ' + who(dy), 'Υπαξιωματικοί:');
  if (B.date && (bk !== fr || B.date !== m.date)) bk.set(B.date, place + ', ' + hkDate(d));
  const t = /^([A-Z]+)(\d+)$/.exec(m.title); const hr = t && Number(t[2]) >= 3 ? [t[1] + (Number(t[2]) - 3), t[1] + (Number(t[2]) - 2)] : [];
  const front: SheetPart = { ws: fr, key: 'front', more: [blockOf(fr, 'head', hr), blockOf(fr, 'date', m.date ? [m.date] : [])] };
  const layout = await signSheets(wb, fr === bk ? [front] : [front, { ws: bk, key: 'back', more: [blockOf(bk, 'date', B.date ? [B.date] : [])] }], s, 'hkai', opts.sigs, warnings);
  return { name: reportOf(s.settings) + ' ' + dmyy(d).replace(/\//g, '.') + '.xlsx', data: await wb.save(), warnings, layout, sheet: frName };
}

// Οι δικές σου γραμμές (βαθμοί) που δεν έχει το έντυπο: νέα γραμμή κάτω από αυτήν που διάλεξες, με τη μορφή και τους
// τύπους της από πάνω (Σύνολο, κωλυόμενοι, απόντες, διαθέσιμοι), μέσα στο σύνολο της ομάδας. Ό,τι είναι από κάτω
// (σύνολα, υπογραφές, ημερομηνία) κατεβαίνει μία γραμμή, και οι αριθμημένες λίστες στο πλάι συνεχίζουν σωστά.
// need: η γραμμή έχει κάτι να γράψει (βασική γραμμή που λείπει από το έντυπο μπαίνει μόνο τότε· οι δικές σου πάντα)
function addHkRows(wb: Workbook, fr: Sheet, m: HkaiMap, R: HkRows, warnings: string[], need: (k: string) => boolean = () => true) {
  for (const group of [R.off, R.nco]) group.forEach((key, i) => {
    if (m.rows[key] > 0) return;
    if (!R.own.has(key) && !need(key)) return;
    // κάτω από την προηγούμενη της ομάδας· αν λείπουν όλες από πάνω (π.χ. Αρχιλοχίες), πάνω από την επόμενη: η νέα γραμμή
    // μπαίνει κάτω από αυτήν, με τους τύπους της, και οι δύο αλλάζουν θέση (τα ονόματα γράφονται από το hkRowLabels)
    const prev = group.slice(0, i).reverse().find(k => m.rows[k] > 0);
    const next = prev ? undefined : group.slice(i + 1).find(k => m.rows[k] > 0);
    if (!prev && !next) { warnings.push('Η γραμμή «' + key + '» δεν μπήκε στο έντυπο: δεν βρέθηκε άλλη γραμμή της ομάδας της'); return; }
    const rowsNow = group.map(k => m.rows[k]).filter(r => r > 0);
    const after = m.rows[(prev || next)!], first = Math.min(...rowsNow), last = Math.max(...rowsNow), r = after + 1;
    fr.insertRows(after, 1, after, wb);
    for (const k in m.rows) if (m.rows[k] > after) m.rows[k]++;
    const down = (ref: string) => ref.replace(/(\d+)$/, (_x, n: string) => String(Number(n) > after ? Number(n) + 1 : Number(n)));
    if (m.title) m.title = down(m.title); if (m.date) m.date = down(m.date);
    if (next) { m.rows[key] = after; m.rows[next] = r; } else m.rows[key] = r;
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
// Πού είναι κάθε λίστα: φύλλο (αυτό που διάλεξες, αλλιώς με το όνομα ή τον τίτλο της), και το κομμάτι του αν το φύλλο
// έχει και τις δύο. Χωρίς φύλλο παραμενόντων: αντίγραφο του φύλλου των εξοδούχων.
interface OutsLoc { sheet: string; from: number; to: number; rename?: boolean }
async function outsPlaces(wb: Workbook, want: { outs?: string; stay?: string }, place: string): Promise<[OutsLoc, OutsLoc]> {
  const names = wb.sheetNames(); const info = new Map<string, { vals: XlValue[][]; cs: ReturnType<typeof textCells>; list: boolean }>();
  for (const n of names) { const vals = await wb.values(n, 200, 40); const ws = await wb.sheet(n); info.set(n, { vals, cs: textCells(vals), list: !!mapOuts(vals, ws.merges(), place) }); }
  const titled = (re: RegExp) => names.find(n => re.test(tnorm(n))) || names.find(n => info.get(n)!.cs.some(x => re.test(x.t) && x.r < 40));
  const outs = (want.outs && wb.hasSheet(want.outs) ? want.outs : null) || titled(/^ΕΞΟΔΟΥΧ/) || names.find(n => info.get(n)!.list) || names[0];
  let stay = (want.stay && wb.hasSheet(want.stay) ? want.stay : null) || names.find(n => /^ΠΑΡΑΜΕΝ/.test(tnorm(n))) || names.find(n => n !== outs && info.get(n)!.cs.some(x => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t)));
  const end = 2000;
  if (!stay && info.get(outs)!.cs.some(x => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t))) stay = outs;
  if (!stay) stay = names.find(n => n !== outs && info.get(n)!.list && !/^ΕΞΟΔΟΥΧ/.test(tnorm(n)));
  if (!stay) { stay = sheetSafe('ΠΑΡΑΜΕΝΟΝΤΕΣ'); let i = 2; while (wb.hasSheet(stay)) stay = sheetSafe('ΠΑΡΑΜΕΝΟΝΤΕΣ ' + i++); await wb.cloneSheet(outs, stay); return [{ sheet: outs, from: 1, to: end }, { sheet: stay, from: 1, to: end, rename: true }]; }
  if (stay !== outs) return [{ sheet: outs, from: 1, to: end }, { sheet: stay, from: 1, to: end }];
  // και οι δύο λίστες στο ίδιο φύλλο: χωρίζονται στον τίτλο της δεύτερης
  const cs = info.get(outs)!.cs; const t1 = cs.find(x => /^ΕΞΟΔΟΥΧ/.test(x.t))?.r ?? 1, t2 = cs.find(x => /^ΠΑΡΑΜΕΝΟΝΤΕΣ/.test(x.t))!.r;
  return t1 < t2 ? [{ sheet: outs, from: 1, to: t2 - 1 }, { sheet: outs, from: t2, to: end }] : [{ sheet: outs, from: t1, to: end }, { sheet: outs, from: 1, to: t1 - 1 }];
}
// sheets: φύλλα εξοδούχων και παραμενόντων στο template (Αρχεία Excel)· κάθε στήλη από την επικεφαλίδα της (tplmap.ts)
export async function fillOuts(tpl: Buffer, s: AppState, d: ISODate, sheets: { outs?: string; stay?: string } = {}, sigs?: Sig[] | null): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); wb.widen = true; await unitWords(wb, s); const warnings: string[] = [];
  const marks: { ws: Sheet; key: string; refs: { head: string[]; date: string[] } }[] = [];
  const { outs, stay } = outsAndStay(s, d);
  const locs = await outsPlaces(wb, sheets, s.settings.place);
  const lists: { title: string; list: { p: Person; note: string }[]; at: OutsLoc; key: string }[] = [
    { title: 'ΕΞΟΔΟΥΧΟΙ', list: outs.map(x => ({ p: x.p, note: outsNote(s, d, x.p.id, x.st) })), at: locs[0], key: 'outs' },
    { title: 'ΠΑΡΑΜΕΝΟΝΤΕΣ', list: stay, at: locs[1], key: 'stay' }
  ];
  // από κάτω προς τα πάνω: οι γραμμές που μπαίνουν σε μια λίστα δεν μετακινούν όσα δεν έχουν γραφτεί ακόμα
  for (const { title, list, at: loc, key } of [...lists].sort((a, b) => (a.at.sheet === b.at.sheet ? b.at.from - a.at.from : 0))) {
    const ws = await wb.sheet(loc.sheet); const vals = await wb.values(loc.sheet, 2000, 40);
    const m = mapOuts(vals, ws.merges(), s.settings.place, loc.from, loc.to);
    if (!m) { warnings.push('Στο φύλλο «' + loc.sheet + '» δεν βρέθηκαν οι επικεφαλίδες της λίστας (ΒΑΘΜΟΣ, ΕΠΩΝΥΜΟ, ΟΝΟΜΑ…): οι ' + title + ' δεν γράφτηκαν'); continue; }
    const raw = (c: { r: number; c: number }) => String(vals[c.r - 1]?.[c.c - 1] ?? '');
    const head = headCells(m.head, m.title?.r ?? m.hr, (r, c) => vals[r - 1]?.[c - 1] != null);
    s.settings.unit.forEach((u, i) => { const h = head[i]; if (h && (i < m.head.length || u)) ws.set(refOf(h.c, h.r), u); });
    if (m.title) { const t = loc.rename ? raw(m.title).replace(/ΕΞΟΔΟΥΧΟΙ/i, title) : raw(m.title); ws.set(refOf(m.title.c, m.title.r), withDate(t, titleDate(d, false), 'ΤΗΣ')); }
    // έτοιμες γραμμές του πίνακα: όσες έχουν τη μορφή της πρώτης, ως πριν τον τόπο/ημερομηνία (μία κενή γραμμή πριν μένει)
    const cols = Object.values(m.cols); const c0 = Math.min(...cols); const s0 = ws.style(refOf(c0, m.first));
    const stop = m.place ? m.place.r - 1 : loc.to;
    let ready = 1;
    while (m.first + ready < stop && ws.style(refOf(c0, m.first + ready)) === s0 && s0 != null && !cols.some(c => { const x = ws.raw(refOf(c, m.first + ready)); return x && x.inner && !x.inner.includes('<f'); })) ready++;
    const n = list.length;
    if (n > ready) {
      ws.insertRows(m.first + ready - 1, n - ready, m.first + ready - 1, wb);
      // ό,τι σημειώθηκε πιο κάτω στο ίδιο φύλλο (κεφαλίδα, ημερομηνία της λίστας από κάτω) κατεβαίνει μαζί
      const mv = (x: string) => x.replace(/(\d+)$/, (_q, rr: string) => String(+rr > m.first + ready - 1 ? +rr + n - ready : +rr));
      for (const k of marks) if (k.ws === ws) { k.refs.head = k.refs.head.map(mv); k.refs.date = k.refs.date.map(mv); }
      // η αρίθμηση =ROW()-k της λίστας από κάτω (στο ίδιο φύλλο) μένει 1, 2, 3… αφού κατέβηκε
      if (loc.to < 2000) for (const x of [...ws.cells()].filter(y => y.r > loc.to + n - ready)) {
        const ref = refOf(x.c, x.r); const f = /^ROW\(\)\s*-\s*(\d+)$/.exec(unesc(ws.formula(ref) || '')); if (f) ws.setFormula(ref, 'ROW()-' + (+f[1] + n - ready));
      }
      if (m.cols.aa != null) ws.chainAa(m.cols.aa, m.first + ready - 1, n - ready);
    }
    const C = m.cols;
    list.forEach(({ p, note }, i) => {
      const r = m.first + i; const set = (k: string, v: string | number | null | undefined) => { const c = C[k]; if (c != null && !ws.hasFormula(refOf(c, r))) ws.set(refOf(c, r), v ?? ''); };
      set('aa', i + 1); set('rank', rankTxt(p)); set('spec', p.spec); set('last', p.last); set('first', p.first + (C.father != null ? '' : fatherTxt(p)));
      set('father', p.father); set('name', fullName(p)); set('who', who(p)); set('room', p.room ?? ''); set('phone', p.phone); set('asm', p.asm); set('si', p.si); set('note', note);
    });
    const extra = Math.max(0, n - ready);
    const dateRef = m.place ? refOf(m.place.c, m.place.r + extra) : null;
    if (dateRef) ws.set(dateRef, s.settings.place + ', ' + dmy(d).replace(/\//g, '-'));
    const headRefs = head.slice(0, Math.max(m.head.length, s.settings.unit.filter(Boolean).length)).map(h => refOf(h.c, h.r));
    const had = marks.find(x => x.ws === ws);
    if (had) { had.refs.head.push(...headRefs); if (dateRef) had.refs.date.push(dateRef); had.key = key; }
    else marks.push({ ws, key, refs: { head: headRefs, date: dateRef ? [dateRef] : [] } });
  }
  // ένα φύλλο με τις δύο λίστες: μία κεφαλίδα και μία ημερομηνία για τη μετακίνηση (της πρώτης λίστας / της τελευταίας)
  const done: SheetPart[] = marks.map(x => ({ ws: x.ws, key: x.key, more: [blockOf(x.ws, 'head', x.refs.head), blockOf(x.ws, 'date', x.refs.date.slice(0, 1))] }));
  const layout = await signSheets(wb, done, s, 'outs', sigs, warnings);
  return { name: 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings, layout, sheet: locs[0].sheet };
}
