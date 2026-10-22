// Γεννήτρια τυχαίων templates για τα τεστ (Michael, 22/10: «να τεσταρεις με πολλά random templates… να μπορεί να κάνει
// adapt στα πάντα»). Κάθε seed δίνει ένα άλλο έντυπο με τα ίδια στοιχεία: άλλες θέσεις, κενές γραμμές και στήλες,
// συγχωνεύσεις, άλλη σειρά στηλών, άλλες λέξεις στις επικεφαλίδες, άλλο πλήθος έτοιμων γραμμών, άλλα φύλλα.
// Οι έλεγχοι (template-fuzz.test.ts) βρίσκουν τα στοιχεία από τα κείμενά τους στο αποτέλεσμα, όχι από θέσεις.
import ExcelJS from 'exceljs';

export type Rnd = () => number;
export function rng(seed: number): Rnd {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const int = (r: Rnd, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
export const pick = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const chance = (r: Rnd, p: number) => r() < p;
export function shuffle<T>(r: Rnd, xs: T[]): T[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const col = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const THIN: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

// Ένα φύλλο με βοηθούς: κελί (κείμενο, τύπος, έντονα, πλαίσιο) και συγχώνευση
class G {
  constructor(public ws: ExcelJS.Worksheet) {}
  put(r: number, c: number, v: string | number | null, o: { b?: boolean; box?: boolean; f?: string; sz?: number } = {}) {
    const x = this.ws.getCell(r, c);
    x.value = o.f ? { formula: o.f, result: undefined as unknown as number } : v;
    x.font = { name: 'Arial', size: o.sz || 11, bold: !!o.b };
    if (o.box) x.border = THIN;
    x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    return this;
  }
  box(r: number, c: number) { const x = this.ws.getCell(r, c); x.border = THIN; x.font = { name: 'Arial', size: 11 }; return this; }
  merge(r1: number, c1: number, r2: number, c2: number) { if (r2 > r1 || c2 > c1) this.ws.mergeCells(r1, c1, r2, c2); return this; }
}
export const save = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());

// Υπογραφές στο τέλος: «Ο» από πάνω και η θέση, k στο πλάτος
const SIGS = [['Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'], ['Ο', 'ΔΚΤΗΣ ΙΛΗΣ'], ['ΤΟ', '2ο ΓΡΑΦΕΙΟ'], ['Ο', 'ΔΚΤΗΣ ΕΠΧΙΑΣ']];
function sigs(g: G, r: Rnd, row: number, c1: number, c2: number): string[] {
  const k = int(r, 1, 4); const list = SIGS.slice(0, k); const step = (c2 - c1) / k;
  list.forEach(([a, t], i) => { const c = Math.round(c1 + step * i + step / 2); g.put(row, c, a, { b: true }).put(row + 1, c, t, { b: true }); });
  return list.map(x => x[1]);
}

// ------------------------------------------------------------------ ΦΡΟΥΡΑ (ΣΒΕΝ / ΣΠΕΝ)
export interface FrouraGen { buf: Buffer; sheet: string; head: string[]; note: string; sigs: string[]; desc: string[] }
export async function genFroura(seed: number, phase: 'sven' | 'spen'): Promise<FrouraGen> {
  const r = rng(seed); const wb = new ExcelJS.Workbook(); const desc: string[] = [];
  if (chance(r, 0.25)) { wb.addWorksheet('ΟΔΗΓΙΕΣ').getCell('A1').value = 'Το φύλλο συμπληρώνεται από την εφαρμογή'; desc.push('φύλλο οδηγιών πρώτο'); }
  const sheet = pick(r, ['ΦΡΟΥΡΑ', 'ΚΑΤΑΣΤΑΣΗ', 'Φύλλο1', 'ΥΠΗΡΕΣΙΕΣ ' + seed]);
  const g = new G(wb.addWorksheet(sheet));
  const L = int(r, 0, 2); const C = (c: number) => c + L; if (L) desc.push(L + ' κενές στήλες αριστερά');
  let row = 1 + int(r, 0, 2);
  // κεφαλίδα: δεξιά (όπως το δικό μας) ή αριστερά, 2 ή 3 γραμμές
  const hc = chance(r, 0.5) ? C(12) : C(1); const hn = pick(r, [2, 3, 3]); const head: string[] = [];
  ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ'].slice(0, hn).forEach((t, i) => { g.put(row + i, hc, t); head.push(col(hc) + (row + i)); });
  desc.push('κεφαλίδα ' + head.join(','));
  row += hn + int(r, 1, 2);
  g.put(row, C(1), pick(r, ['ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ', 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ', 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ']), { b: true, sz: 14 });
  if (chance(r, 0.6)) g.merge(row, C(1), row, C(12));
  row += int(r, 2, 4);
  const ly = pick(r, ['Λ/Υ: ', 'Λ/Υ:', 'Λ/Υ :']), dy = pick(r, ['Δ/Υ: ', 'Δ/Υ:', 'Δ/Υ :']);
  if (chance(r, 0.3)) { g.put(row, C(1), ly).put(row, C(8), dy); row += 2; desc.push('Λ/Υ και Δ/Υ στην ίδια γραμμή'); }
  else { g.put(row, C(1), ly).put(row + 1, C(1), dy); if (chance(r, 0.5)) g.merge(row, C(1), row, C(4)).merge(row + 1, C(1), row + 1, C(5)); row += 3; }
  // πίνακες σκοπών: Α/Α, όνομα, ΩΡΕΣ (όχι πάντα), ΠΑΡ/ΣΕΙΣ· κάθε νούμερο 3 γραμμές
  const hours = chance(r, 0.85); if (!hours) desc.push('χωρίς ΩΡΕΣ');
  const vmerge = chance(r, 0.7);
  const HRS = ['14:00-16:00', '22:00-00:00', '06:00-08:00'];
  const sentry = (top: number, c0: number, title: string, nums: string[]) => {
    const cs = hours ? [c0, c0 + 1, c0 + 2, c0 + 3] : [c0, c0 + 1, -1, c0 + 2];
    g.put(top, cs[0], 'Α/Α', { b: true, box: true }).put(top, cs[1], title, { b: true, box: true }).put(top, cs[3], 'ΠΑΡ/ΣΕΙΣ', { b: true, box: true });
    if (hours) g.put(top, cs[2], 'ΩΡΕΣ', { b: true, box: true });
    nums.forEach((n, i) => {
      const r1 = top + 1 + 3 * i;
      for (let k = 0; k < 3; k++) for (const c of cs) if (c > 0) g.box(r1 + k, c);
      g.put(r1, cs[0], n, { box: true });
      if (hours) for (let k = 0; k < 3; k++) g.put(r1 + k, cs[2], HRS[k], { box: true });
      if (vmerge) { g.merge(r1, cs[0], r1 + 2, cs[0]).merge(r1, cs[1], r1 + 2, cs[1]).merge(r1, cs[3], r1 + 2, cs[3]); }
    });
    return top + 3 * nums.length;
  };
  const lc = C(pick(r, [1, 2, 2])); const w = hours ? 4 : 3;
  const stacked = chance(r, 0.25); if (stacked) desc.push('πίνακες σκοπών ο ένας κάτω από τον άλλο');
  const restart = phase === 'spen' || chance(r, 0.6);
  const right = phase === 'spen' ? 'ΟΠΛΟΦΥΛΑΚΕΣ' : 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ';
  const nums = ['1ο', '2ο', '3ο', '4ο'], nums2 = restart ? nums : ['5ο', '6ο', '7ο', '8ο'];
  let rc: number;
  if (stacked) { const b = sentry(row, lc, 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', nums); rc = lc; row = sentry(b + 1 + int(r, 0, 1), rc, right, nums2) + 2; }
  else { rc = lc + w + int(r, 1, 3); sentry(row, lc, 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', nums); row = sentry(row, rc, right, nums2) + 2; }
  // μαγειρεία (και ΣΚΟΠΟΙ, ΤΑΕ στη ΣΠΕΝ)
  const kc = phase === 'sven' && !stacked ? lc + 3 : lc; const kw = int(r, 1, 3); const kn = pick(r, [5, 5, 6]);
  g.put(row, kc, 'Α/Α', { b: true, box: true }).put(row, kc + 1, pick(r, ['ΜΑΓΕΙΡΕΙΑ', 'ΜΑΓΕΙΡΕΙΑ ', 'ΜΑΓΕΙΡΙΑ']), { b: true, box: true }).put(row, kc + 1 + kw, 'ΠΑΡ/ΣΕΙΣ', { b: true, box: true });
  g.merge(row, kc + 1, row, kc + kw);
  for (let i = 0; i < kn; i++) { g.put(row + 1 + i, kc, (i + 1) + 'ο', { box: true }).box(row + 1 + i, kc + 1).box(row + 1 + i, kc + 1 + kw); g.merge(row + 1 + i, kc + 1, row + 1 + i, kc + kw); }
  let bottom = row + kn;
  if (phase === 'spen') {
    const sc = stacked ? lc + w + 3 : rc;
    g.put(row, sc, 'Α/Α', { b: true, box: true }).put(row, sc + 1, 'ΣΚΟΠΟΙ', { b: true, box: true }).put(row, sc + 2, 'ΩΡΕΣ', { b: true, box: true }).put(row, sc + 3, 'ΠΑΡ/ΣΕΙΣ', { b: true, box: true });
    ['3η', '4η'].forEach((n, i) => {
      const r1 = row + 1 + 3 * i; g.put(r1, sc, n, { box: true }); for (let k = 0; k < 3; k++) g.put(r1 + k, sc + 2, HRS[k], { box: true }).box(r1 + k, sc + 1);
      g.merge(r1, sc, r1 + 2, sc).merge(r1, sc + 1, r1 + 2, sc + 1);
    });
    bottom = Math.max(bottom, row + 6);
    const tr = row + kn + 1 + int(r, 0, 1); g.put(tr, kc, 'ΤΑΕ', { box: true }).box(tr, kc + 1); g.merge(tr, kc + 1, tr, kc + kw);
    bottom = Math.max(bottom, tr);
  }
  row = bottom + int(r, 2, 3);
  // τιμωρημένοι και απόντες: δίπλα δίπλα ή ο ένας κάτω από τον άλλο, με n έτοιμες γραμμές
  const n = int(r, 2, 8); const side = chance(r, 0.7); desc.push(n + ' γραμμές τιμωρημένων/απόντων' + (side ? '' : ', η μία λίστα κάτω από την άλλη'));
  const list = (top: number, c0: number, title: string, kind: string) => {
    const mid = shuffle(r, [kind, 'ΑΠΌ', 'ΕΩΣ']).sort((a, b) => (a === 'ΕΩΣ' && b === 'ΑΠΌ' ? 1 : a === 'ΑΠΌ' && b === 'ΕΩΣ' ? -1 : 0));
    const heads = ['Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', ...mid, 'ΠΑΡ/ΣΕΙΣ'];
    g.put(top, c0, title, { b: true }).merge(top, c0, top, c0 + heads.length - 1);
    heads.forEach((h, i) => g.put(top + 1, c0 + i, h, { b: true, box: true }));
    for (let i = 0; i < n; i++) heads.forEach((_, j) => (j ? g.box(top + 2 + i, c0 + j) : g.put(top + 2 + i, c0, i + 1, { box: true })));
    return top + 1 + n;
  };
  const pFirst = chance(r, 0.75);
  if (side) { list(row, C(1), pFirst ? 'ΤΙΜΩΡΗΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ', pFirst ? 'ΕΙΔΟΣ ΠΟΙΝΗΣ' : 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ'); row = list(row, C(8), pFirst ? 'ΑΠΟΝΤΕΣ' : 'ΤΙΜΩΡΗΜΕΝΟΙ', pFirst ? 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ' : 'ΕΙΔΟΣ ΠΟΙΝΗΣ') + 2; }
  else { const b = list(row, C(1), pFirst ? 'ΤΙΜΩΡΗΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ', pFirst ? 'ΕΙΔΟΣ ΠΟΙΝΗΣ' : 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ'); row = list(b + 2, C(1), pFirst ? 'ΑΠΟΝΤΕΣ' : 'ΤΙΜΩΡΗΜΕΝΟΙ', pFirst ? 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ' : 'ΕΙΔΟΣ ΠΟΙΝΗΣ') + 2; }
  // μια σημείωση του γραφέα με λέξεις του εντύπου μέσα: δεν πρέπει να αλλάξει
  const note = 'ΣΗΜΕΙΩΣΗ: ΟΙ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΚΑΙ ΟΙ ΑΠΟΝΤΕΣ ΕΛΕΓΧΟΝΤΑΙ ΑΠΟ ΤΟΝ Λ/Υ';
  g.put(row, C(1), note); row += 2;
  const sg = sigs(g, r, row, C(1), C(13));
  g.ws.columns.forEach((c, i) => { c.width = i < L ? 3 : 12; });
  return { buf: await save(wb), sheet, head, note, sigs: sg, desc };
}

// ------------------------------------------------------------------ Εξοδούχοι / Παραμένοντες
export const OUT_COLS: [string, string[]][] = [
  ['aa', ['Α/Α', 'ΑΑ', 'Α.Α.']], ['rank', ['ΒΑΘΜΟΣ', 'ΒΑΘΜ.']], ['spec', ['Ο-Σ', 'Ο/Σ', 'ΕΙΔΙΚΟΤΗΤΑ']], ['last', ['ΕΠΙΘΕΤΟ', 'ΕΠΩΝΥΜΟ']],
  ['first', ['ΟΝΟΜΑ']], ['room', ['ΘΑΛΑΜΟΣ', 'ΘΑΛ.']], ['phone', ['ΤΗΛΕΦΩΝΟ', 'ΚΙΝΗΤΟ', 'ΤΗΛ.']], ['note', ['ΠΑΡΑΤΗΡΗΣΕΙΣ', 'ΠΑΡ/ΣΕΙΣ']],
  ['asm', ['ΑΣΜ']], ['name', ['ΟΝΟΜΑΤΕΠΩΝΥΜΟ']], ['sign', ['ΥΠΟΓΡΑΦΗ']]
];
export interface OutsSheet { name: string; title: string; head: string[]; cols: string[]; aa: 'formula' | 'number' | 'none'; ready: number }
export interface OutsGen { buf: Buffer; sheets: OutsSheet[]; one: boolean; same: boolean; desc: string[] }
export async function genOuts(seed: number): Promise<OutsGen> {
  const r = rng(seed); const wb = new ExcelJS.Workbook(); const desc: string[] = [];
  const named = chance(r, 0.6); const one = chance(r, 0.15); if (one) desc.push('μόνο φύλλο εξοδούχων');
  if (chance(r, 0.15)) { wb.addWorksheet('ΣΗΜΕΙΩΣΕΙΣ').getCell('B2').value = 'Πρόχειρο'; desc.push('φύλλο σημειώσεων πρώτο'); }
  // ίδια διάταξη στα δύο φύλλα (όπως συνήθως), με άλλες στήλες σε κάθε seed
  const L = int(r, 0, 1); const top = 1 + int(r, 0, 2);
  const core = ['rank', 'last', 'first']; const opt = ['spec', 'room', 'phone', 'note', 'asm', 'sign'].filter(() => chance(r, 0.7));
  let cols = shuffle(r, [...core, ...opt]);
  if (chance(r, 0.25)) cols = ['name', ...cols.filter(c => c !== 'last' && c !== 'first')];
  const aa: OutsSheet['aa'] = pick(r, ['formula', 'formula', 'number', 'none']);
  if (aa !== 'none') cols = ['aa', ...cols];
  const words = Object.fromEntries(OUT_COLS.map(([k, ws]) => [k, pick(r, ws)]));
  const hc = chance(r, 0.5) ? L + cols.length : L + 1; const hn = pick(r, [2, 3]);
  const gap = int(r, 1, 2), ready = int(r, 1, 6), twoRow = chance(r, 0.2);
  const titles: [string, string][] = [['ΕΞΟΔΟΥΧΟΙ ΤΗΣ', 'ΕΞΟΔΟΥΧΟΙ'], ['ΠΑΡΑΜΕΝΟΝΤΕΣ ΤΗΣ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ']];
  // same: και οι δύο λίστες στο ίδιο φύλλο, η μία κάτω από την άλλη (τόπος, ημερομηνία και υπογραφές μόνο στο τέλος)
  const same = !one && chance(r, 0.2); if (same) desc.push('και οι δύο λίστες σε ένα φύλλο');
  const out: OutsSheet[] = [];
  let g: G | null = null; let row = top; let name = '';
  for (const [i, [title, nm]] of (one ? titles.slice(0, 1) : titles).entries()) {
    const last = one || same ? i === (one ? 0 : 1) : true;
    if (!same || !g) { name = named ? (same ? 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ' : nm) : 'Φύλλο' + (out.length + 1); g = new G(wb.addWorksheet(name)); row = top; }
    const head: string[] = [];
    if (!same || i === 0) { ['ΚΕΝ ΑΥΛΩΝΑ', '2η ΕΠΧΙΑ', '4η ΙΛΗ'].slice(0, hn).forEach((t, k) => { g!.put(row + k, hc, t); head.push(col(hc) + (row + k)); }); row += hn + gap; }
    const tt = chance(r, 0.3) ? title.replace(' ΤΗΣ', '') : title;
    g.put(row, L + 1, tt, { b: true, sz: 14 }).merge(row, L + 1, row, L + cols.length);
    row += chance(r, 0.4) ? 2 : 1;
    // επικεφαλίδες· σε δύο γραμμές: μια γενική από πάνω (ΣΤΟΙΧΕΙΑ) συγχωνευμένη, και οι στήλες από κάτω
    if (twoRow) { g.put(row, L + 1, 'ΣΤΟΙΧΕΙΑ ' + nm, { b: true, box: true }).merge(row, L + 1, row, L + cols.length); row++; }
    cols.forEach((k, j) => g!.put(row, L + 1 + j, words[k], { b: true, box: true }));
    const data = row + 1;
    for (let k = 0; k < ready; k++) cols.forEach((c, j) => (c === 'aa' ? g!.put(data + k, L + 1 + j, aa === 'number' ? k + 1 : null, { box: true, f: aa === 'formula' ? 'ROW()-' + (data - 1) : undefined }) : g!.box(data + k, L + 1 + j)));
    row = data + ready + 1;
    if (last || !same) { g.put(row, L + Math.max(1, cols.length - 1), 'Αυλώνας, '); sigs(g, r, row + 1, L + 1, L + cols.length); }
    else row += 1;
    g.ws.columns.forEach(c => { c.width = 14; });
    out.push({ name, title: tt, head: head.length ? head : out[0]?.head || [], cols, aa, ready });
  }
  desc.push('στήλες ' + cols.join(','), 'Α/Α ' + aa, ready + ' έτοιμες γραμμές', named ? 'φύλλα με όνομα' : 'φύλλα Φύλλο1/2', twoRow ? 'επικεφαλίδα σε 2 γραμμές' : '');
  return { buf: await save(wb), sheets: out, one, same, desc: desc.filter(Boolean) };
}

// ------------------------------------------------------------------ ΗΚΑΙ / ΗΚΑΛ
// Στήλες: [κλειδί, επικεφαλίδες που μπορεί να έχει]· τα αθροίσματα είναι τύποι
const HK_HEADS: Record<string, string[]> = {
  prov: ['Προβλέπονται από τη σύνθεση', 'Προβλέπονται'], placed: ['Τοποθετημένοι'], attached: ['Προσκολλημένοι', 'Προσκολημένοι'], sum: ['Σύνολο'],
  yp: ['Υπηρεσία εντός στρατοπέδου'], ey: ['Ελεύθεροι υπηρεσίας'], tim: ['Τιμωρημένοι'], os: ['Ο/Σ'], mag: ['ΜΑΓΕΙΡΙΑ', 'Μαγειρεία'], sid: ['ΣΙΔΗΡΟΥΡΓΕΙΟ'], kin: ['Σε κίνηση'],
  sumK: ['Σύνολο κωλυομένων'], ka: ['Κανονικές Άδειες / ΑΜΔ / ΥΕΘΑ', 'Κανονικές Άδειες'], an: ['Αναρρωτικές Άδειες'], eid: ['Ειδικές Άδειες'], nos: ['Νοσοκομείο / .401 ΓΣΝΑ', 'Νοσοκομείο'],
  prat: ['Πρατήριο'], adik: ['Αγνοούμενοι/Αδικαιολογήτως Απών', 'Αδικαιολογήτως απόντες'], fp: ['Φύλλα Πορείας - Μεταβάσεως'], fyl: ['Φυλάκια'], apal: ['Απαλλαγή'],
  ekp: ['Σε εκπαίδευση'], allh: ['Σε άλλη Μονάδα'], sumA: ['Σύνολο απόντων'], avail: ['Διαθέσιμοι για εκπαίδευση', 'Διαθέσιμοι'], ab: ['Μισθοτροφοδοτηθέντες την προηγούμενη']
};
export const HK_OFF = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'ΔΕΑ'];
export const HK_OFF_L = ['Ταγματάρχες', 'Λοχαγοί', 'Υπολοχαγοί-Ανθυπολοχαγοί', 'Ανθυπασπιστές', 'ΔΕΑ'];
export const HK_NCO = ['Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες', 'Δεκανείς', 'ΕΠΟΠ Στρατιώτης', 'ΟΒΑ Στρατιώτης', 'Στρατιώτες'];
export interface HkaiGen { buf: Buffer; front: string; back: string; cols: string[]; dropped: string[]; lochos: boolean; same: boolean; desc: string[] }
export async function genHkai(seed: number, lochos: boolean): Promise<HkaiGen> {
  const r = rng(seed); const wb = new ExcelJS.Workbook(); const desc: string[] = [];
  const kol = shuffle(r, ['yp', 'ey', 'tim', 'os', 'mag', 'sid', 'kin'].filter(k => ['yp', 'ey', 'tim'].includes(k) || chance(r, 0.6)));
  const apo = shuffle(r, ['ka', 'an', 'eid', 'nos', 'prat', 'adik', 'fp', 'fyl', 'apal', 'ekp', 'allh'].filter(k => ['ka', 'an', 'nos'].includes(k) || chance(r, 0.6)));
  const cols = [...(chance(r, 0.5) ? ['prov'] : []), 'placed', 'attached', 'sum', ...kol, 'sumK', ...apo, 'sumA', 'avail', ...(chance(r, 0.5) ? ['ab'] : [])];
  const same = chance(r, 0.2); if (same) desc.push('μπροστινή και πίσω σε ένα φύλλο');
  if (chance(r, 0.2)) { wb.addWorksheet('Οδηγίες').getCell('A1').value = 'Η ΗΚΑΙ βγαίνει από την εφαρμογή'; desc.push('φύλλο οδηγιών πρώτο'); }
  const front = pick(r, ['μπροστινο', 'ΗΚΑΙ', 'Σελίδα 1', 'ΕΜΠΡΟΣ']); const g = new G(wb.addWorksheet(front));
  const lab = chance(r, 0.3) ? 2 : 1; if (lab === 2) desc.push('στήλη Α/Α πριν από τους βαθμούς');
  const c0 = lab + 1; let row = 1 + int(r, 0, 2);
  g.put(row, lab, 'ΚΕΤΘ').put(row + 1, lab, '2Η ΕΠΧΙΑ').put(row + 2, lab, 'ΚΑΤΑΣΤΑΣΗ', { b: true });
  g.put(row + 3, lab, lochos ? 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ου ΛΟΧΟΥ ΤΗΣ' : 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ 4ης ΙΛΗΣ ΤΗΣ', { b: true });
  row += 4 + int(r, 1, 2);
  // επικεφαλίδες: ομάδες (ΔΥΝΑΜΗ, ΚΩΛΥΟΜΕΝΟΙ, ΑΠΟΝΤΕΣ) από πάνω και οι στήλες από κάτω
  const hr = row + 1; const colAt: Record<string, number> = {};
  g.put(row, lab, 'ΒΑΘΜΟΙ', { b: true, box: true }).merge(row, lab, hr, lab);
  cols.forEach((k, i) => { colAt[k] = c0 + i; g.put(hr, c0 + i, pick(r, HK_HEADS[k]), { b: true, box: true, sz: 8 }); });
  g.put(row, colAt.placed, 'ΔΥΝΑΜΗ', { b: true }).put(row, colAt[kol[0]], 'ΚΩΛΥΟΜΕΝΟΙ', { b: true }).put(row, colAt[apo[0]], 'ΑΠΟΝΤΕΣ', { b: true });
  // γραμμές βαθμών· λείπουν κάποιες βασικές (μπαίνουν από την εφαρμογή όταν έχουν άτομα)
  const off = lochos ? HK_OFF_L : HK_OFF;
  const dropped = [...off, ...HK_NCO].filter(x => !['Στρατιώτες', 'Δεκανείς', off[0]].includes(x) && chance(r, 0.12));
  if (dropped.length) desc.push('χωρίς γραμμές ' + dropped.join(', '));
  row = hr + 1 + int(r, 0, 1);
  const L = (k: string, rr: number) => col(colAt[k]) + rr;
  const sumOf = (ks: string[], rr: number) => ks.map(k => L(k, rr)).join('+') || '0';
  const rankRow = (name: string) => {
    g.put(row, lab, name, { box: true }); if (lab === 2) g.put(row, 1, row - hr, { box: true });
    for (const k of cols) g.box(row, colAt[k]);
    g.put(row, colAt.sum, null, { box: true, f: L('placed', row) + '+' + L('attached', row) });
    g.put(row, colAt.sumK, null, { box: true, f: sumOf(kol, row) });
    g.put(row, colAt.sumA, null, { box: true, f: sumOf(apo, row) });
    g.put(row, colAt.avail, null, { box: true, f: L('sum', row) + '-' + L('sumA', row) });
    return row++;
  };
  const total = (name: string, from: number, to: number) => { g.put(row, lab, name, { b: true, box: true }); for (const k of cols) if (k !== 'prov') g.put(row, colAt[k], null, { box: true, f: 'SUM(' + L(k, from) + ':' + L(k, to) + ')' }); return row++; };
  const o1 = row; for (const x of off) if (!dropped.includes(x)) rankRow(x); const t1 = total('ΣΥΝΟΛΟ ΑΞΚΩΝ', o1, row - 1);
  const n1 = row; for (const x of HK_NCO) if (!dropped.includes(x)) rankRow(x === 'ΟΒΑ Στρατιώτης' && chance(r, 0.5) ? 'OBΑ Στρατιώτης' : x); const t2 = total('ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', n1, row - 1);
  g.put(row, lab, 'ΓΕΝΙΚΟ ΣΥΝΟΛΟ', { b: true, box: true }); for (const k of cols) if (k !== 'prov') g.put(row, colAt[k], null, { box: true, f: L(k, t1) + '+' + L(k, t2) }); row++;
  row += int(r, 1, 3);
  g.put(row, colAt[apo[Math.min(2, apo.length - 1)]], 'Αυλώνας, '); row += 2;
  sigs(g, r, row, c0, c0 + cols.length - 1); row += 6;
  // πίσω σελίδα: φρουρές, οχήματα, ατυχήματα, αριθμημένα κείμενα, όργανα υπηρεσίας
  const b = same ? g : new G(wb.addWorksheet(pick(r, ['πισω', 'ΠΙΣΩ', 'Σελίδα 2'])));
  const back = b.ws.name; let br = same ? row + 2 : 1 + int(r, 0, 2);
  const T = br;
  b.put(T, 1, 'ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ', { b: true }).merge(T, 1, T, 5);
  ['Είδος φρουράς', 'Αξκοί', 'Υπξκοι', 'Στρατιώτες ', 'Σύνολο'].forEach((t, i) => b.put(T + 1, 1 + i, t, { b: true, box: true }));
  const gap = int(r, 1, 3); let gr = T + 2;
  for (const t of ['Νυκτοφρουρές', '24ώρες', 'Πέραν 24ώρου', 'Σύνολο']) { b.put(gr, 1, t, { box: true }); for (let c = 2; c <= 5; c++) b.box(gr, c); gr += gap; }
  const vc = 7;
  b.put(T, vc, 'ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ', { b: true }).merge(T, vc, T, vc + 4);
  b.put(T + 1, vc, 'Είδη οχημάτων', { box: true }).put(T + 1, vc + 1, 'Προβλέπονται', { box: true }).put(T + 1, vc + 2, 'Σε κίνηση', { box: true }).put(T + 1, vc + 3, 'Προς επισκευή', { box: true }).merge(T + 1, vc + 3, T + 1, vc + 4);
  b.put(T + 2, vc + 3, 'Για συντήρηση', { box: true }).put(T + 2, vc + 4, 'Λόγω βλάβης ή ατυχήματος', { box: true });
  b.merge(T + 1, vc, T + 2, vc).merge(T + 1, vc + 1, T + 2, vc + 1).merge(T + 1, vc + 2, T + 2, vc + 2);
  if (chance(r, 0.6)) b.put(T + 3, vc, '1/4 τόνων', { box: true });
  const ac = vc + 6;
  b.put(T, ac, 'ΑΤΥΧΗΜΑΤΑ', { b: true }).merge(T, ac, T, ac + 2);
  b.put(T + 1, ac, 'Ολικές', { box: true }).put(T + 1, ac + 1, 'Μερικές', { box: true }).put(T + 1, ac + 2, 'Σε άνδρες', { box: true }).merge(T + 1, ac + 2, T + 2, ac + 2);
  b.put(T + 3, ac, 'Ø').put(T + 3, ac + 1, 'Ø').put(T + 3, ac + 2, 'Ø');
  br = Math.max(gr, T + 5) + 1;
  const tc = chance(r, 0.5) ? 7 : 1; const tw = int(r, 0, 1);
  const lines = ['1. ΕΓΓΡΑΦΕΣ: ', '2. ΔΙΑΓΡΑΦΕΣ: ', '3. ΑΔΕΙΕΣ: ', '4. ΠΟΙΝΕΣ: ', pick(r, ['5.ΑΙΤΗΣΕΙΣ:    ', '5. ΑΙΤΗΣΕΙΣ:']), '6. ΛΟΙΠΑ:'];
  lines.forEach((t, i) => { b.put(br + i, tc, t, { b: true }); if (tw) b.merge(br + i, tc, br + i, tc + 1); });
  br += lines.length + 1;
  b.put(br, 1, 'Όργανα Υπηρεσίας', { b: true }); b.put(br + 1, 1, 'Αξιωματικοί:'); b.put(br + 4, 1, 'Υπαξιωματικοί:');
  b.put(br + 6, 10, 'Αυλώνας, ');
  sigs(b, r, br + 8, 1, 12);
  for (const x of [g, b]) x.ws.columns.forEach(c => { c.width = 11; });
  desc.push('στήλες ' + cols.join(','), 'πίσω: κείμενα στη στήλη ' + col(tc) + (tw ? ' (συγχωνευμένα)' : ''));
  return { buf: await save(wb), front, back, cols, dropped, lochos, same, desc };
}

// ------------------------------------------------------------------ Έντυπα (δικά σου πρότυπα)
// Στήλες με όσες λέξεις γράφει κανείς στην επικεφαλίδα· null: στήλη που η εφαρμογή δεν ξέρει (μένει όπως είναι)
export const REP_COLS: [string | null, string[]][] = [
  ['rank', ['ΒΑΘΜΟΣ', 'Βαθμός', 'ΒΑΘ.']], ['name', ['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'Επώνυμο και Όνομα', 'ΕΠΩΝΥΜΟ ΟΝΟΜΑ']],
  ['last', ['ΕΠΩΝΥΜΟ', 'Επώνυμο']], ['first', ['ΟΝΟΜΑ', 'Όνομα']], ['father', ['ΠΑΤΡΩΝΥΜΟ', 'Όνομα Πατρός']],
  ['asm', ['ΑΣΜ', 'Α.Σ.Μ.', 'Αριθμός Μητρώου']], ['phone', ['ΤΗΛΕΦΩΝΟ', 'Τηλ.', 'Κινητό']], ['room', ['ΘΑΛΑΜΟΣ', 'ΘΑΛ.']],
  ['unit', ['ΟΥΛΑΜΟΣ']], ['si', ['Σ.Ι.']], ['status', ['ΚΑΤΑΣΤΑΣΗ']], ['notes', ['ΠΑΡΑΤΗΡΗΣΕΙΣ']], ['blank', ['ΥΠΟΓΡΑΦΗ', 'Υπογραφή']],
  [null, ['ΣΧΟΛΙΑ ΔΙΟΙΚΗΣΗΣ', 'ΩΡΑ ΑΦΙΞΗΣ']]
];
export interface RepGenCol { c: number; f: string | null; label: string }
export interface RepGen {
  buf: Buffer; sheet: string; head: number; data: number; cols: RepGenCol[];
  aa: 'formula' | 'number' | 'numbered' | 'none'; aaCol: number; ready: number;
  total?: { r: number; c: number; of: number };   // =COUNTA() της στήλης of κάτω από τον πίνακα
  note?: { r: number; c: number; t: string };     // κείμενο κάτω από τον πίνακα που πρέπει να μείνει
  tags: string[]; tagRow: boolean; twoRows: boolean; desc: string[];
}
export async function genReport(seed: number): Promise<RepGen> {
  const r = rng(seed); const wb = new ExcelJS.Workbook(); const desc: string[] = [];
  if (chance(r, 0.25)) { wb.addWorksheet('ΟΔΗΓΙΕΣ').getCell('A1').value = 'Δεν τυπώνεται'; desc.push('φύλλο οδηγιών πρώτο'); }
  const sheet = pick(r, ['ΚΑΤΑΣΤΑΣΗ', 'Φύλλο1', 'ΑΓΓΑΡΕΙΑ ' + seed]);
  const g = new G(wb.addWorksheet(sheet));
  const L = int(r, 0, 2); const C = (c: number) => c + L; if (L) desc.push(L + ' κενές στήλες αριστερά');
  const tags: string[] = [];
  // στήλες: Α/Α (τύπος, αριθμός, ήδη αριθμημένες γραμμές ή καθόλου) και τυχαίες από τις γνωστές
  const aa = pick(r, ['formula', 'number', 'numbered', 'none'] as const);
  const pool = shuffle(r, REP_COLS.filter(x => x[0] !== 'name' && x[0] !== 'last')).slice(0, int(r, 2, 6));
  const nameCols = chance(r, 0.7) ? [REP_COLS[1]] : [REP_COLS[2], REP_COLS[3]];
  const list = shuffle(r, [...pool, ...nameCols]);
  const cols: RepGenCol[] = []; let c = C(1);
  if (aa !== 'none') cols.push({ c: c++, f: 'aa', label: pick(r, ['Α/Α', 'Α.Α.', 'ΑΡ.', 'α/α']) });
  for (const [f, words] of list) cols.push({ c: c++, f, label: pick(r, words) });
  const last = c - 1;
  desc.push('στήλες ' + cols.map(x => x.f || '?').join(','), 'Α/Α ' + aa);
  // πάνω μέρος: κεφαλίδα (ετικέτα, 3 ετικέτες ή κείμενο), τόπος/ημερομηνία, τίτλος
  let row = 1 + int(r, 0, 2);
  const hk = pick(r, ['tag', 'tags', 'text', 'none'] as const);
  if (hk === 'tag') { g.put(row, C(1), '{ΚΕΦΑΛΙΔΑ}'); tags.push('head'); row += 3; }
  else if (hk === 'tags') { ['{ΚΕΦΑΛΙΔΑ 1}', '{ΚΕΦΑΛΙΔΑ 2}', '{ΚΕΦΑΛΙΔΑ 3}'].forEach((t, i) => g.put(row + i, C(1), t)); tags.push('head1'); row += 3; }
  else if (hk === 'text') { g.put(row, C(1), 'ΚΕΤΘ').put(row + 1, C(1), '4η ΙΛΗ'); row += 2; }
  const dk = pick(r, ['tag', 'date', 'none'] as const);
  if (dk === 'tag') { g.put(1, last, '{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}'); tags.push('placeDate'); }
  else if (dk === 'date') { g.put(1, last, 'ΑΥΛΩΝΑΣ {ΗΜΕΡΟΜΗΝΙΑ}'); tags.push('date'); }
  row = Math.max(row + int(r, 0, 1), dk === 'none' ? 1 : 2);
  const tk = pick(r, ['tag', 'mixed', 'text'] as const);
  g.put(row, C(1), tk === 'tag' ? '{ΤΙΤΛΟΣ}' : tk === 'mixed' ? 'ΚΑΤΑΣΤΑΣΗ ΑΓΓΑΡΕΙΑΣ {ΗΜΕΡΟΜΗΝΙΑ}' : 'ΚΑΤΑΣΤΑΣΗ ΑΓΓΑΡΕΙΑΣ', { b: true, sz: 13 });
  if (tk !== 'text') tags.push(tk === 'tag' ? 'title' : 'date');
  if (chance(r, 0.6)) g.merge(row, C(1), row, last);
  row += int(r, 2, 3);
  // επικεφαλίδες: μία γραμμή, ή δύο (μια ομάδα στηλών με κοινό τίτλο από πάνω, οι άλλες συγχωνευμένες κάθετα)
  const twoRows = cols.length >= 4 && chance(r, 0.35);
  let head = row;
  if (twoRows) {
    const g1 = int(r, 1, cols.length - 3), g2 = g1 + int(r, 1, 2);
    g.put(row, cols[g1].c, 'ΣΤΟΙΧΕΙΑ', { b: true, box: true }).merge(row, cols[g1].c, row, cols[g2].c);
    for (let i = g1 + 1; i <= g2; i++) g.box(row, cols[i].c);
    cols.forEach((x, i) => {
      if (i >= g1 && i <= g2) g.put(row + 1, x.c, x.label, { b: true, box: true });
      else { g.put(row, x.c, x.label, { b: true, box: true }).box(row + 1, x.c).merge(row, x.c, row + 1, x.c); }
    });
    head = row; row += 2; desc.push('επικεφαλίδες σε δύο γραμμές');
  } else { cols.forEach(x => g.put(row, x.c, x.label, { b: true, box: true })); row++; }
  const data = row;
  // ετικέτες στη γραμμή-πρότυπο αντί για επικεφαλίδες που δεν ξέρει (π.χ. {ΟΝΟΜΑΤΕΠΩΝΥΜΟ} κάτω από «ΣΤΟΙΧΕΙΑ»)
  const tagRow = !twoRows && chance(r, 0.2);
  // έτοιμες γραμμές με πλαίσιο
  const ready = pick(r, [1, 1, 3, 8, 15, 25]);
  for (let i = 0; i < ready; i++) for (const x of cols) {
    if (x.f === 'aa' && aa === 'formula') g.put(data + i, x.c, null, { box: true, f: 'ROW()-' + (data - 1) });
    else if (x.f === 'aa' && (aa === 'numbered' || (aa === 'number' && i === 0))) g.put(data + i, x.c, i + 1, { box: true });
    else g.put(data + i, x.c, null, { box: true });
  }
  if (tagRow) { const x = cols.find(y => y.f === 'name' || y.f === 'last')!; g.put(data, x.c, x.f === 'name' ? '{ΟΝΟΜΑΤΕΠΩΝΥΜΟ}' : '{ΕΠΩΝΥΜΟ}', { box: true }).put(head, x.c, 'ΣΤΟΙΧΕΙΑ ΣΤΡΑΤΙΩΤΗ', { b: true, box: true }); x.label = 'ΣΤΟΙΧΕΙΑ ΣΤΡΑΤΙΩΤΗ'; desc.push('ετικέτα στη γραμμή-πρότυπο'); }
  desc.push(ready + ' έτοιμες γραμμές');
  row = data + ready;
  const out: RepGen = { buf: Buffer.alloc(0), sheet, head, data, cols, aa, aaCol: aa === 'none' ? 0 : cols[0].c, ready, tags, tagRow, twoRows, desc };
  // κάτω από τον πίνακα: σύνολο (τύπος ή ετικέτα), κείμενο, υπογραφές
  if (chance(r, 0.5)) {
    const of = cols.find(x => x.f === 'name' || x.f === 'last')!.c;
    if (chance(r, 0.5)) { g.put(row, C(1), 'ΣΥΝΟΛΟ', { b: true }).put(row, of, null, { f: 'COUNTA(' + col(of) + data + ':' + col(of) + (data + ready - 1) + ')' }); out.total = { r: row, c: of, of }; desc.push('σύνολο με τύπο'); }
    else { g.put(row, C(1), 'ΣΥΝΟΛΟ: {ΣΥΝΟΛΟ}'); tags.push('count'); }
    row++;
  }
  if (chance(r, 0.5)) { row += int(r, 0, 1); const t = 'ΟΙ ΑΝΩΤΕΡΩ ΝΑ ΒΡΙΣΚΟΝΤΑΙ ΣΤΗΝ ΠΥΛΗ ' + seed; g.put(row, C(1), t); out.note = { r: row, c: C(1), t }; row++; }
  row += int(r, 1, 2);
  const sk = pick(r, ['tag', 'names', 'none'] as const);
  if (sk === 'tag') { g.put(row, C(1), '{ΥΠΟΓΡΑΦΕΣ}'); tags.push('sigs'); }
  else if (sk === 'names') { g.put(row, last, 'Ο ΛΟΧΙΑΣ', { b: true }).put(row + 3, last, '{ΛΟΧΙΑΣ}'); tags.push('sgtName'); }
  out.buf = await save(wb);
  return out;
}
