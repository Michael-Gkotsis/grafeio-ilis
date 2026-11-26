// Κατάσταση υπηρεσιών ΑΛΛΗΣ μονάδας (26/11, Michael): μπλοκ με 2 άτομα ανά νούμερο δεν γέμιζαν το 2ο άτομο και δεν ακολουθούσαν τα Νούμερα × Άτομα / Ώρες της εφαρμογής.
// Η φόρμα εδώ έχει τη μορφή του αρχείου που έστειλε ο Michael (ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ με νούμερα σε 2 γραμμές, ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ «1ο 2ο 1ο 2ο», ΔΑΣΟΠΕΡΙΠΟΛΟ «1ο 2ο»).
//  Α. νούμερο σε συγχωνευμένο κελί (2 γραμμές): και οι 2 γραμμές είναι θέσεις· Β. δύο μπλοκ με την ίδια λέξη = 1ο και 2ο άτομο· Γ. άτομα χωρίς γραμμή παίρνουν τις γραμμές που περισσεύουν
//  Δ. με την επιλογή «ακολουθούν την εφαρμογή» (lst.fit): το μπλοκ παίρνει όσες γραμμές έχει η υπηρεσία· Ε. οι ώρες που έβαλε ο χρήστης γράφονται, οι προεπιλεγμένες όχι.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { fullName, type AppState } from '../src/shared/domain';
import { postsOf } from '../src/shared/rules';
import { upper } from '../src/shared/text';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill } from '../src/main/tplLists';
import { detectSvc, svcKeyOf, svcTargets } from '../src/shared/unitLists';
import type { ListProfile, TplProfile } from '../src/shared/tplStore';
import { fakeState } from './fixtures';

const D = '2026-11-16';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'g' + ++seq };
const prof = (lst: ListProfile): TplProfile => ({ v: 1, id: 'services-1', kind: 'services', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst });
const SHEET = 'ΥΠΗΡΕΣΙΕΣ';

// ------------------------------------------------------------------ η εφαρμογή: οι υπηρεσίες του αρχείου
interface Svc { name: string; n: number; per: number }
function appWith(svcs: Svc[], more: (s: AppState, id: (name: string) => string) => AppState = s => s): AppState {
  let s = fakeState(80);
  for (const x of svcs) s = apply(s, { t: 'addBlock', phase: s.settings.phase, name: x.name, kind: 'other', armed: false, n: x.n, per: x.per, hrs: '' }, ctx).state;
  const idOf = (name: string) => 'blk:' + postsOf(s.settings).find(p => p.label.includes(name))!.block;
  s = more(s, idOf);
  return apply(s, { t: 'autofill', date: D }, ctx).state;
}
const idOf = (s: AppState, name: string) => svcTargets(s, postsOf(s.settings)).find(t => t.label === name)!.value;
// τα άτομα της εφαρμογής ανά (νούμερο, θέση στο νούμερο)
function seats(s: AppState, name: string): (string | null)[][] {
  const t = svcTargets(s, postsOf(s.settings)).find(x => x.label === name)!; const g = s.guards[D] || {};
  return t.groups.map(gp => gp.map(p => { const x = g[p.k] != null ? s.people.find(q => q.id === g[p.k]) : undefined; return x ? upper(fullName(x)) : null; }));
}

// ------------------------------------------------------------------ το έντυπο της μονάδας (ExcelJS): στήλες Α λέξη · Β νούμερο · Γ ώρες · Δ βαθμός · Ε βάρδια · ΣΤ όνομα
type Layout = 'stack' | 'pairs' | 'rows' | 'shifts';
interface Def { label: string; layout: Layout; nums: number; per: number }
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
async function form(defs: Def[], logo = false): Promise<{ buf: Buffer; top: Record<string, number>; sigRow: number }> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(SHEET);
  if (logo) { const id = wb.addImage({ base64: PNG, extension: 'png' }); ws.addImage(id, { tl: { col: 6.2, row: 0.2 }, ext: { width: 40, height: 40 } }); }
  ws.getCell('A1').value = 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 3 ΝΟΕΜΒΡΙΟΥ 2026'; ws.mergeCells('A1:F1');
  ws.getCell('B3').value = 'Νο'; ws.getCell('D3').value = 'ΒΑΘΜΟΣ'; ws.getCell('F3').value = 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ';
  const line = { style: 'thin' as const, color: { argb: 'FF444444' } };
  let r = 4; const top: Record<string, number> = {};
  for (const d of defs) {
    top[d.label] = r; const k = d.nums * d.per;
    for (let i = 0; i < k; i++) {
      for (let c = 1; c <= 6; c++) ws.getCell(r + i, c).border = { top: line, left: line, bottom: line, right: line };
      ws.getCell(r + i, 4).value = 'ΣΤΡ';
    }
    ws.getCell(r, 1).value = d.label; if (k > 1) ws.mergeCells(r, 1, r + k - 1, 1);
    for (let g = 0; g < d.nums; g++) {
      if (d.layout === 'stack') { ws.getCell(r + g * d.per, 2).value = (g + 1) + 'ο'; ws.mergeCells(r + g * d.per, 2, r + g * d.per + d.per - 1, 2); ws.mergeCells(r + g * d.per, 3, r + g * d.per + d.per - 1, 3); ws.getCell(r + g * d.per, 3).value = '06:00-09:00/15:00-18:00'; }
      if (d.layout === 'rows') ws.getCell(r + g, 2).value = (g + 1) + 'ο';
      if (d.layout === 'pairs') for (let p = 0; p < d.per; p++) ws.getCell(r + p * d.nums + g, 2).value = (g + 1) + 'ο';
      if (d.layout === 'shifts') { ws.getCell(r + g * 2, 2).value = (g + 1) + 'ο'; ws.getCell(r + g * 2, 5).value = 'Φ'; ws.getCell(r + g * 2 + 1, 5).value = 'Κ'; }
    }
    r += k + 1;                                  // κενή γραμμή ανάμεσα στα μπλοκ
  }
  const sigRow = r + 1; ws.getCell(sigRow, 1).value = 'Ο'; ws.getCell(sigRow, 6).value = 'Ο'; ws.getCell(sigRow + 1, 1).value = 'ΑΛΧΙΑΣ ΙΛΗΣ'; ws.getCell(sigRow + 1, 6).value = 'ΔΚΤΗΣ ΕΠΧΙΑΣ';
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), top, sigRow };
}
const DEFS: Def[] = [
  { label: 'ΣΚΟΠΟΙ ΚΕΝΤΡΙΚΗ ΠΥΛΗ', layout: 'shifts', nums: 3, per: 2 },
  { label: 'ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ', layout: 'pairs', nums: 2, per: 2 },
  { label: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', layout: 'stack', nums: 3, per: 2 },
  { label: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', layout: 'rows', nums: 2, per: 1 }
];
const names = async (buf: Buffer) => { const sh = (await modelOfBuffer(buf)).find(x => x.name === SHEET)!; return sh; };
const cell = (sh: Awaited<ReturnType<typeof names>>, r: number, c: number) => { const v = sh.rows[r - 1]?.[c - 1]; return v == null ? '' : String(v).trim(); };
// τα σωστά κλειδιά των μπλοκ της φόρμας → υπηρεσία της εφαρμογής (όπως τα διάλεξε ο χρήστης στην Αντιστοίχιση)
async function mapping(buf: Buffer, s: AppState, which: Record<string, string>): Promise<ListProfile> {
  const det = detectSvc((await modelOfBuffer(buf))[0])!; const posts: Record<string, string> = {};
  for (const b of det.blocks) { const label = Object.keys(which).find(l => b.label.toUpperCase().startsWith(l.toUpperCase())); if (label) posts[svcKeyOf(b)] = idOf(s, which[label]); }
  return { sheet: SHEET, posts };
}

describe('μπλοκ με 2 άτομα ανά νούμερο στο έντυπο άλλης μονάδας', () => {
  it('Α/Β/Γ: νούμερο σε 2 γραμμές, «1ο 2ο 1ο 2ο» και «1ο 2ο» με 1 νούμερο × 2 άτομα: γράφονται όλα τα άτομα, στη σωστή γραμμή', async () => {
    const s = appWith([{ name: 'ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ', n: 2, per: 2 }, { name: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', n: 3, per: 2 }, { name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', n: 1, per: 2 }]);
    const f = await form(DEFS);
    const lst = await mapping(f.buf, s, { 'ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ': 'ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ', 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ': 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', 'ΔΑΣΟΠΕΡΙΠΟΛΟ': 'ΔΑΣΟΠΕΡΙΠΟΛΟ' });
    const out = (await listsFill(f.buf, s, D, { kind: 'services', profile: prof(lst) }))!; const sh = await names(out.data);
    const want: [string, (g: number, p: number) => number][] = [
      ['ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', (g, p) => f.top['ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ'] + g * 2 + p],
      ['ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ', (g, p) => f.top['ΠΕΡΙΠ. ΠΡΟΚΑΛΥΨΗΣ'] + p * 2 + g],
      ['ΔΑΣΟΠΕΡΙΠΟΛΟ', (g, p) => f.top['ΔΑΣΟΠΕΡΙΠΟΛΟ'] + p]
    ];
    let checked = 0;
    for (const [name, rowOf] of want) seats(s, name).forEach((gp, g) => gp.forEach((who, p) => { if (!who) return; checked++; expect(cell(sh, rowOf(g, p), 6), name + ' νούμερο ' + (g + 1) + ' άτομο ' + (p + 1)).toBe(who); }));
    expect(checked).toBeGreaterThanOrEqual(10);
    expect(out.report.unplaced.filter(x => /ΠΕΡΙΠ|ΔΑΣΟ/.test(x))).toEqual([]);
  });

  it('Δ: με «ακολουθούν την εφαρμογή» το μπλοκ παίρνει τα Νούμερα × Άτομα της υπηρεσίας· χωρίς την επιλογή το αρχείο μένει όπως είναι και το λέει', async () => {
    const s = appWith([{ name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', n: 4, per: 1 }, { name: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', n: 2, per: 2 }]);
    const f = await form(DEFS);
    const base = await mapping(f.buf, s, { 'ΔΑΣΟΠΕΡΙΠΟΛΟ': 'ΔΑΣΟΠΕΡΙΠΟΛΟ', 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ': 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ' });
    const off = (await listsFill(f.buf, s, D, { kind: 'services', profile: prof(base) }))!;
    expect(off.report.unplaced.some(x => /ΔΑΣΟΠΕΡΙΠΟΛΟ/.test(x)), 'χωρίς επιλογή: 4 άτομα, 2 γραμμές').toBe(true);
    const shOff = await names(off.data); expect(cell(shOff, f.sigRow, 1)).toBe('Ο');
    const on = (await listsFill(f.buf, s, D, { kind: 'services', profile: prof({ ...base, fit: true }) }))!; const sh = await names(on.data);
    const det = detectSvc(sh)!; const daso = det.blocks.find(b => b.label === 'ΔΑΣΟΠΕΡΙΠΟΛΟ')!; const stra = det.blocks.find(b => b.label === 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ')!;
    expect(daso.groups.length).toBe(4); expect(stra.groups.length).toBe(2); expect(stra.groups.every(g => g.length === 2)).toBe(true);
    seats(s, 'ΔΑΣΟΠΕΡΙΠΟΛΟ').forEach((gp, g) => { if (gp[0]) expect(cell(sh, daso.rows[daso.groups[g][0]].r + 1, 6)).toBe(gp[0]); });
    seats(s, 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ').forEach((gp, g) => gp.forEach((who, p) => { if (who) expect(cell(sh, stra.rows[stra.groups[g][p]].r + 1, 6)).toBe(who); }));
    // ο αριθμός των γραμμών της φόρμας άλλαξε (+2 στη ΔΑΣΟΠΕΡΙΠΟΛΟ, −2 στη ΣΤΡΑΤΟΠΕΔΟΥ): οι υπογραφές κατέβηκαν ανάλογα, τίποτα άλλο δεν χάθηκε
    const sigAt = sh.rows.findIndex(row => (row || []).some(v => String(v ?? '').trim() === 'ΑΛΧΙΑΣ ΙΛΗΣ')); expect(sigAt).toBeGreaterThan(0);
    expect(on.report.unplaced.filter(x => /ΔΑΣΟΠΕΡΙΠΟΛΟ|ΣΤΡΑΤΟΠΕΔΟΥ/.test(x))).toEqual([]);
    expect(cell(sh, 1, 1)).toContain('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ');
  });

  it('Ε: ώρες που έβαλε ο χρήστης γράφονται στη στήλη ώρες· προεπιλεγμένες ώρες και υπηρεσία χωρίς δικές της ώρες αφήνουν το αρχείο όπως είναι', async () => {
    const s = appWith([{ name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', n: 2, per: 1 }, { name: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', n: 3, per: 2 }], (st, id) => apply(st, { t: 'editBlock', phase: st.settings.phase, id: id('ΔΑΣΟΠΕΡΙΠΟΛΟ').slice(4), name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', hrs: {}, hrsNum: ['06:00 → 12:00', '12:00 → 18:00'] }, ctx).state);
    const f = await form(DEFS);
    const lst = { ...(await mapping(f.buf, s, { 'ΔΑΣΟΠΕΡΙΠΟΛΟ': 'ΔΑΣΟΠΕΡΙΠΟΛΟ', 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ': 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ' })), fit: true as const };
    const sh = await names((await listsFill(f.buf, s, D, { kind: 'services', profile: prof(lst) }))!.data);
    expect(cell(sh, f.top['ΔΑΣΟΠΕΡΙΠΟΛΟ'], 3).replace(/\D/g, '')).toBe('06001200');
    expect(cell(sh, f.top['ΔΑΣΟΠΕΡΙΠΟΛΟ'] + 1, 3).replace(/\D/g, '')).toBe('12001800');
    expect(cell(sh, f.top['ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ'], 3), 'ΣΤΡΑΤΟΠΕΔΟΥ δεν έχει δικές της ώρες: μένουν του αρχείου').toBe('06:00-09:00/15:00-18:00');
    const off = await names((await listsFill(f.buf, s, D, { kind: 'services', profile: prof({ ...lst, fit: undefined }) }))!.data);
    expect(cell(off, f.top['ΔΑΣΟΠΕΡΙΠΟΛΟ'], 3), 'χωρίς την επιλογή οι ώρες δεν γράφονται').toBe('');
  });

  it('Δ: 1 νούμερο × 2 άτομα σε μπλοκ «1ο 2ο» (χωρίς συγχωνεύσεις): το μπλοκ μένει με 2 γραμμές που διαβάζονται ως 2 άτομα του ίδιου νούμερου', async () => {
    const s = appWith([{ name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', n: 1, per: 2 }, { name: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', n: 3, per: 2 }]);
    const f = await form(DEFS);
    const lst = { ...(await mapping(f.buf, s, { 'ΔΑΣΟΠΕΡΙΠΟΛΟ': 'ΔΑΣΟΠΕΡΙΠΟΛΟ' })), fit: true as const };
    const out = (await listsFill(f.buf, s, D, { kind: 'services', profile: prof(lst) }))!; const sh = await names(out.data);
    const daso = detectSvc(sh)!.blocks.find(b => b.label === 'ΔΑΣΟΠΕΡΙΠΟΛΟ')!;
    expect(daso.groups.length).toBe(1); expect(daso.groups[0].length).toBe(2);
    seats(s, 'ΔΑΣΟΠΕΡΙΠΟΛΟ')[0].forEach((who, p) => { if (who) expect(cell(sh, daso.rows[daso.groups[0][p]].r + 1, 6)).toBe(who); });
    expect(out.report.unplaced.filter(x => /ΔΑΣΟ/.test(x))).toEqual([]);
    // δεύτερο πέρασμα πάνω στο αποτέλεσμα (με το προφίλ που βγήκε): δεν αλλάζει τη δομή ξανά
    const det2 = detectSvc(sh)!; const again = (await listsFill(out.data, s, D, { kind: 'services', profile: prof({ sheet: SHEET, fit: true, posts: Object.fromEntries(det2.blocks.filter(b => b.label === 'ΔΑΣΟΠΕΡΙΠΟΛΟ').map(b => [svcKeyOf(b), idOf(s, 'ΔΑΣΟΠΕΡΙΠΟΛΟ')])) }) }))!;
    expect(detectSvc(await names(again.data))!.blocks.length).toBe(det2.blocks.length);
  });

  it('Φύλλο με λογότυπο (εικόνα): βγαίνει και προσαρμόζεται μπλοκ, ο λογότυπος μένει όπου ήταν (πριν: «το φύλλο έχει σχέδια, δεν αλλάζει η δομή»)', async () => {
    const s = appWith([{ name: 'ΔΑΣΟΠΕΡΙΠΟΛΟ', n: 3, per: 1 }, { name: 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ', n: 3, per: 2 }]);
    const f = await form(DEFS, true);
    const base = await mapping(f.buf, s, { 'ΔΑΣΟΠΕΡΙΠΟΛΟ': 'ΔΑΣΟΠΕΡΙΠΟΛΟ', 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ': 'ΠΕΡΙΠ. ΣΤΡΑΤΟΠΕΔΟΥ' });
    const det = detectSvc((await modelOfBuffer(f.buf))[0])!; const prok = det.blocks.filter(b => b.label.startsWith('ΠΕΡΙΠ. ΠΡΟΚ'));
    const out = (await listsFill(f.buf, s, D, { kind: 'services', profile: prof({ ...base, fit: true, show: Object.fromEntries(prok.map(b => [svcKeyOf(b), 'remove' as const])) }) }))!;
    expect(out.warnings.filter(w => /σχέδια|πίνακες/.test(w))).toEqual([]);
    const d2 = detectSvc(await names(out.data))!; expect(d2.blocks.some(b => b.label.startsWith('ΠΕΡΙΠ. ΠΡΟΚ'))).toBe(false);
    expect(d2.blocks.find(b => b.label === 'ΔΑΣΟΠΕΡΙΠΟΛΟ')!.groups.length).toBe(3);
    const z = await (await import('jszip')).default.loadAsync(out.data); const draw = Object.keys(z.files).find(n => /xl\/drawings\/drawing\d*\.xml$/.test(n));
    expect(draw, 'το σχέδιο υπάρχει ακόμα').toBeTruthy();
    expect(await z.file(draw!)!.async('string')).toMatch(/<xdr:row>0<\/xdr:row>/);       // ο λογότυπος μένει στην κορυφή
  });
});
