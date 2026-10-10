// Συμπλήρωση των εντύπων της Ίλης από την κατάσταση της εφαρμογής (06, 11).
// Κάθε συνάρτηση παίρνει το κενό template και επιστρέφει το συμπληρωμένο αρχείο.
import { dm, dmy, dmyy, milDate, parseD, MON_SHORT, type ISODate } from '../shared/dates';
import { collator, norm } from '../shared/text';
import { TYPES, type AppState, type Person, type Status } from '../shared/domain';
import { activePeople, personMap, statusesOn, hkaiCounts, postBy, postOf, HK_OFFICERS, HK_NCO } from '../shared/rules';
import { Workbook } from './xlsx';

export const who = (p: Person) => [p.rank, p.spec ? '(' + p.spec + ')' : '', p.last, p.first].filter(Boolean).join(' ');
const withPhone = (p: Person) => who(p) + (p.phone ? ', ΤΗΛ: ' + p.phone : '');
// θαλαμοφύλακες: όνομα και τηλέφωνο σε δύο γραμμές μέσα στο συγχωνευμένο κελί
const twoLines = (p: Person) => who(p) + (p.phone ? '\nΤΗΛ: ' + p.phone : '');
const brief = (p: Person) => [p.rank, p.last, p.first].filter(Boolean).join(' ');
const titleDate = (d: ISODate, longYear: boolean) => { const x = parseD(d); return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + (longYear ? x.getFullYear() : String(x.getFullYear()).slice(2)); };
const byName = (a: Person, b: Person) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);

export interface ExportResult { name: string; data: Buffer; warnings: string[] }

// ------------------------------------------------------------------ ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01)
const FROURA_POS: Record<string, string> = {
  th1: 'C13', th2: 'C16', th3: 'C19', th4: 'C22', th5: 'J13', th6: 'J16', th7: 'J19', th8: 'J22',
  mg1: 'F27', mg2: 'F28', mg3: 'F29', mg4: 'F30', mg5: 'F31'
};
const FROURA_ROWS = 6; // γραμμές 36–41 για τιμωρημένους και απόντες
export function punishedOn(s: AppState, d: ISODate): Status[] {
  return s.statuses.filter(x => x.type === 'PUN' && !x.pending && x.from <= d && d <= x.to);
}
export function absentOn(s: AppState, d: ISODate): Status[] {
  // απόντες του εντύπου υπηρεσιών: άδειες, αναρρωτικές, νοσοκομείο (όχι οι εξοδούχοι)
  return s.statuses.filter(x => TYPES[x.type].away && TYPES[x.type].cat !== 'out' && x.from <= d && d <= x.to);
}

export async function fillFroura(tpl: Buffer, s: AppState, d: ISODate): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); const ws = await wb.sheet(0); const pm = personMap(s.people);
  const warnings: string[] = [];
  const g = s.guards[d] || {};
  ws.set('L1', s.settings.unit[0]).set('L2', s.settings.unit[1]).set('L3', s.settings.unit[2]);
  ws.set('A5', 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ ' + titleDate(d, true));
  const p = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  ws.set('A9', 'Λ/Υ: ' + (p('ly') ? withPhone(p('ly')!) : ''));
  ws.set('A10', 'Δ/Υ: ' + (p('dy') ? withPhone(p('dy')!) : ''));
  for (const k in g) {
    if (k === 'ly' || k === 'dy') continue;
    const at = FROURA_POS[k]; const person = pm.get(g[k]);
    if (!person) continue;
    if (!at) { warnings.push('Η θέση ' + (postBy(s, k)?.label || k) + ' δεν έχει κελί στο έντυπο ΦΡΟΥΡΑ'); continue; }
    ws.set(at, k.startsWith('mg') ? who(person) : twoLines(person));
  }
  const pun = punishedOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const abs = absentOn(s, d).map(x => ({ x, p: pm.get(x.pid)! })).filter(y => y.p).sort((a, b) => byName(a.p, b.p));
  const rows = Math.max(pun.length, abs.length);
  if (rows > FROURA_ROWS) ws.insertRows(41, rows - FROURA_ROWS, 41, wb);
  for (let i = 0; i < Math.max(rows, FROURA_ROWS); i++) {
    const r = 36 + i;
    ws.set('A' + r, i + 1).set('H' + r, i + 1);
    const a = pun[i], b = abs[i];
    if (a) ws.set('B' + r, brief(a.p)).set('C' + r, norm(a.x.kind || 'Ποινή')).set('D' + r, dm(a.x.from)).set('E' + r, dm(a.x.to)).set('F' + r, a.x.note || '');
    if (b) ws.set('I' + r, brief(b.p)).set('J' + r, norm((b.x.kind ? b.x.kind + ' ' : '') + TYPES[b.x.type].long)).set('K' + r, dm(b.x.from)).set('L' + r, dm(b.x.to)).set('M' + r, b.x.note || '');
  }
  return { name: 'ΦΡΟΥΡΑ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings };
}

// ------------------------------------------------------------------ ΗΚΑΙ (δείγμα 15)
const HK_COL: Record<string, string> = {
  yp: 'F', ey: 'G', tim: 'H', bl: 'I', os: 'J', mag: 'K', sid: 'L', kin: 'M',
  ka: 'O', an: 'P', eid: 'Q', nos: 'R', prat: 'S', adik: 'T', fp: 'U', fyl: 'V', apal: 'W', ekp: 'X', allh: 'Y'
};
export class TemplateError extends Error {}
export async function fillHkai(tpl: Buffer, s: AppState, d: ISODate): Promise<ExportResult> {
  const wb = await Workbook.open(tpl); const fr = await wb.sheet(0); const bk = await wb.sheet(1);
  const pm = personMap(s.people); const warnings: string[] = [];
  const hk = hkaiCounts(s, d);
  fr.set('A4', 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + dmyy(d));
  fr.set('V34', s.settings.place + ', ' + dmyy(d));
  const rowsOf: [string, number][] = [...HK_OFFICERS.map((r, i) => [r, 17 + i] as [string, number]), ...HK_NCO.map((r, i) => [r, 23 + i] as [string, number])];
  // Προέλεγχος template (έρευνα §3.6): τα αθροίσματα πρέπει να είναι τύποι, όχι γραμμένοι αριθμοί
  const lost = rowsOf.flatMap(([, r]) => ['E', 'N', 'Z', 'AA'].map(c => c + r)).filter(ref => !fr.hasFormula(ref));
  if (lost.length) throw new TemplateError('Το template της ΗΚΑΙ έχει χάσει τύπους στα κελιά ' + lost.slice(0, 6).join(', ') + (lost.length > 6 ? ' κ.ά.' : '') + '. Τα αθροίσματα δεν θα ήταν σωστά. Βάλε ξανά τους τύπους ή σβήσε το δικό σου hkai.xlsx από τον φάκελο templates.');
  for (const [rank, r] of rowsOf) {
    const x = hk.rank[rank];
    fr.set('C' + r, x.n - x.attached).set('D' + r, x.attached);
    for (const [k, col] of Object.entries(HK_COL)) fr.set(col + r, x.c[k] || null);
  }
  // Πίσω όψη: φρουρές της ημέρας, αποφάσεις Διοικητή, όργανα υπηρεσίας
  const g = s.guards[d] || {};
  let night = 0, day24 = 0;
  for (const k in g) { const p = postBy(s, k); if (!p) continue; if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++; else day24++; }
  bk.set('D5', night || null).set('D8', day24 || null);
  const line = (x: Status) => who(pm.get(x.pid)!) + ': ' + (x.kind || TYPES[x.type].long) + ' ' + dm(x.from) + (x.to !== x.from ? '–' + dm(x.to) : '');
  const leaves = s.statuses.filter(x => (x.type === 'LEAVE' || x.type === 'SICK') && x.from === d && pm.has(x.pid));
  const puns = s.statuses.filter(x => x.type === 'PUN' && x.pending && pm.has(x.pid));
  if (leaves.length) bk.set('G10', leaves.map(line).join('· '));
  if (puns.length) bk.set('G11', puns.map(x => who(pm.get(x.pid)!) + ': αιτείται ' + (x.kind || 'ποινή').toLowerCase() + ' ' + dm(x.from) + '–' + dm(x.to) + (x.note ? ' (' + x.note + ')' : '')).join('· '));
  const ly = g.ly && pm.get(g.ly), dy = g.dy && pm.get(g.dy);
  if (ly) bk.set('A22', 'Λ/Υ: ' + who(ly));
  if (dy) bk.set('A23', 'Δ/Υ: ' + who(dy));
  bk.set('L23', s.settings.place + ', ' + milDate(d));
  if (puns.length > 3) warnings.push('Πολλές ποινές προς αίτηση (' + puns.length + '): έλεγξε ότι χωράνε στο κελί 4. ΠΟΙΝΕΣ');
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
    const note = [...ss.map(x => (x.type === 'PUN' ? (x.kind || 'ΠΟΙΝΗ') : TYPES[x.type].label)), post ? post.label : '', p.post || ''].filter(Boolean).join(', ');
    stay.push({ p, note: norm(note) });
  }
  outs.sort((a, b) => byName(a.p, b.p)); stay.sort((a, b) => byName(a.p, b.p));
  return { outs, stay };
}
export async function fillOuts(tpl: Buffer, s: AppState, d: ISODate): Promise<ExportResult> {
  const wb = await Workbook.open(tpl);
  const { outs, stay } = outsAndStay(s, d);
  const lists: [string, { p: Person; note: string }[]][] = [
    ['ΕΞΟΔΟΥΧΟΙ', outs.map(x => ({ p: x.p, note: x.st.type === 'DN' ? 'ΔΝ' : '' }))],
    ['ΠΑΡΑΜΕΝΟΝΤΕΣ', stay]
  ];
  for (const [title, list] of lists) {
    const ws = await wb.sheet(title);
    ws.set('H1', s.settings.unit[0]).set('H2', s.settings.unit[1]).set('H3', s.settings.unit[2]);
    ws.set('A5', title + ' ΤΗΣ ' + titleDate(d, false));
    if (list.length > 1) ws.insertRows(7, list.length - 1, 7, wb);
    list.forEach(({ p, note }, i) => {
      const r = 7 + i;
      ws.set('B' + r, p.rank).set('C' + r, p.spec).set('D' + r, p.last).set('E' + r, p.first)
        .set('F' + r, p.room ?? '').set('G' + r, p.phone).set('H' + r, note);
    });
    const foot = 9 + Math.max(list.length - 1, 0);
    ws.set('G' + foot, s.settings.place + ', ' + dmy(d).replace(/\//g, '-'));
  }
  return { name: 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ' + dmy(d).replace(/\//g, '-') + '.xlsx', data: await wb.save(), warnings: [] };
}
