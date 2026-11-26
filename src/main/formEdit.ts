// Αλλαγή της ΔΟΜΗΣ ενός εντύπου υπηρεσιών ΑΛΛΗΣ μονάδας (κατάσταση υπηρεσιών σε λίστα) στο αντίγραφο που βγαίνει: μπλοκ που δεν υπάρχουν πια στο έντυπο
// σβήνονται (γραμμές και συγχωνεύσεις), υπηρεσίες της εφαρμογής που λείπουν από το αρχείο προστίθενται όπου ζητήθηκε με τη μορφή (πλαίσια, χρώματα, γράμματα,
// συγχωνεύσεις) ενός υπάρχοντος μπλοκ. Το αρχείο της μονάδας δεν αλλάζει ποτέ στον δίσκο· οι αλλαγές γίνονται μόνο στο αντίγραφο.
// Δεν υπάρχει τίποτα ειδικό για κάποιο έντυπο: τα μπλοκ έρχονται από την ανίχνευση (detectSvc), η μορφή αντιγράφεται από γραμμές του ίδιου φύλλου.
//   restructureSvc   εκτελεί το σχέδιο και ξαναδιαβάζει το αποτέλεσμα· δίνει και τη μετάφραση των κλειδιών «λέξη#Ν» (αφού αλλάζει ο αριθμός εμφάνισης)
//   όταν δεν γίνεται με ασφάλεια (φύλλο με πίνακες/σχέδια, τύποι μέσα στις γραμμές που φεύγουν) δεν αλλάζει τίποτα και γράφεται προειδοποίηση.
import { Workbook, colName, type Sheet } from './xlsx';
import { modelOfBuffer } from './bookModel';
import { Grid, type SheetModel } from '../shared/sheetModel';
import { svcKeyOf, type SvcBlock, type SvcSheet } from '../shared/unitLists';
import { normGreek } from '../shared/text';

// Υπηρεσία της εφαρμογής που μπαίνει στο έντυπο: nums νούμερα × per άτομα το καθένα· after / like = κλειδιά «λέξη#Ν» (after: '' στο τέλος, '^' στην αρχή)
export interface AddSvc { value: string; label: string; nums: number; per: number; hours: string[]; after: string; like: string; state?: boolean; stack?: boolean; shifts?: boolean }   // state: λίστα ατόμων σε κατάσταση (nums = γραμμές), χωρίς νούμερα/βάρδιες/ώρες· stack: τα per άτομα κάθε νούμερου είναι γραμμές το ένα κάτω από το άλλο ακόμα κι αν το αρχείο δεν έχει στήλη βάρδιας (αντικατάσταση υπάρχοντος μπλοκ)· shifts:false = χωρίς γράμματα βάρδιας
export interface RestructureIn { remove: string[]; add: AddSvc[] }
export interface Restructured {
  ok: true; data: Buffer; sheets: SheetModel[]; sheet: SheetModel; det: SvcSheet;
  keys: Record<string, string>;            // παλιό κλειδί μπλοκ → νέο κλειδί (όσα έμειναν)
  added: Record<string, string>;           // τιμή υπηρεσίας (blk:…) → κλειδί του νέου μπλοκ
  rowMap: (r: number) => number | null;    // γραμμή του αρχικού αρχείου (από 0) → γραμμή του νέου (null: σβήστηκε)
  warnings: string[];
}
export interface RestructureFail { ok: false; warnings: string[] }
const nk = (s: string) => normGreek(s).replace(/[^\p{L}\d/ ]/gu, ' ').replace(/\s+/g, ' ').trim();
const SHIFTS = ['Φ', 'Κ', 'Ν', 'Π'];
type M = { c1: number; r1: number; c2: number; r2: number };
const rowMerges = (ws: Sheet, r1: number): M[] => ws.merges().filter(m => m.r1 === r1 && m.r2 === r1);
// Η μορφή της γραμμής src1 (από 1) στη γραμμή dst1, με τις συγχωνεύσεις της μέσα στη γραμμή (ms) αντί για όσες ήρθαν από άλλο πρότυπο
function cloneRow(ws: Sheet, src1: number, dst1: number, ms: M[]): void {
  ws.copyLook(src1, dst1);
  for (const m of rowMerges(ws, dst1)) ws.removeMerge(m);
  for (const m of ms) ws.addMerge(colName(m.c1) + dst1 + (m.c2 > m.c1 ? ':' + colName(m.c2) + dst1 : ''));
}

interface Ext { top: number; last: number; bottom: number }   // 0-based: πρώτη γραμμή, τελευταία γραμμή με περιεχόμενο, τελευταία γραμμή που ανήκει στο μπλοκ (μαζί με τη διαχωριστική από κάτω)
function extents(det: SvcSheet, g: Grid): Ext[] {
  const n = det.blocks.length; const top = (b: SvcBlock) => (b.rows.length ? b.rows[0].r : b.r);
  const L = det.cols.label.c;
  return det.blocks.map((b, i) => {
    const t = top(b); let last = b.rows.length ? b.rows[b.rows.length - 1].r : b.r;
    const m = L != null ? g.mergeOf(b.r, L) : null; if (m && m.r1 === b.r) last = Math.max(last, Math.min(m.r2, det.end - 1));
    const bottom = i + 1 < n ? Math.max(last, top(det.blocks[i + 1]) - 1) : last;
    return { top: t, last, bottom };
  });
}

export async function restructureSvc(tpl: Buffer, sheet: SheetModel, det: SvcSheet, o: RestructureIn, redetect: (sh: SheetModel) => SvcSheet | null): Promise<Restructured | RestructureFail> {
  const warnings: string[] = []; const fail = (w: string): RestructureFail => ({ ok: false, warnings: [...warnings, w] });
  const n = det.blocks.length; const g = new Grid(sheet); const ex = extents(det, g); const L = det.cols.label.c;
  if (L == null || !n) return fail('Δεν αλλάζει η δομή του εντύπου: δεν βρέθηκε η στήλη με τις λέξεις των θέσεων.');
  const idx = new Map(det.blocks.map((b, i) => [svcKeyOf(b), i] as const));
  const removeIdx = [...new Set(o.remove.map(k => idx.get(k)).filter((i): i is number => i != null))];
  type Ins = { add: AddSvc; at: number; k: number; like: number; pos: number; order: number }
  // διαχωριστικές γραμμές: υπάρχουν όταν κάποιο μπλοκ έχει κενή γραμμή από κάτω (οι γραμμές μπαίνουν/βγαίνουν χωρίς αυτές και τακτοποιούνται μετά)
  const gapOf = (i: number) => i + 1 < n && ex[i].bottom > ex[i].last;
  const anyGap = det.blocks.some((_, i) => gapOf(i));
  const perOf = (a: AddSvc): number => (a.state ? 1 : a.stack ? Math.max(1, a.per) : a.per > 1 && det.cols.shift.c != null ? a.per : 1);
  const ins: Ins[] = [];
  o.add.forEach((a, order) => {
    const like = idx.get(a.like) ?? 0; const k = Math.max(1, a.nums * perOf(a));
    if (a.after === '^') ins.push({ add: a, at: ex[0].top, k, like, pos: -1, order });
    else { const ai = a.after === '' ? n - 1 : idx.get(a.after); if (ai == null) { warnings.push('Η υπηρεσία «' + a.label + '» δεν μπήκε: δεν βρέθηκε το μπλοκ μετά το οποίο ζητήθηκε.'); return; }
      ins.push({ add: a, at: ex[ai].last + 1, k, like, pos: ai + 0.5, order }); }
  });
  for (const x of ins) if (x.add.nums < 1 || !x.add.label.trim()) return fail('Η υπηρεσία «' + x.add.label + '» δεν έχει νούμερα: δεν μπορεί να μπει στο έντυπο.');

  const wb = await Workbook.open(tpl); wb.widen = false; const ws: Sheet = await wb.sheet(sheet.name);
  // οι γραμμές που φεύγουν: ολόκληρο το μπλοκ (με τη διαχωριστική από κάτω)· το τελευταίο μπλοκ παίρνει μαζί και τη διαχωριστική από πάνω
  const gone = new Set<number>(); const goneBlocks = new Set<number>();
  for (const i of removeIdx) {
    const a = ex[i].top; const b = ex[i].last;
    let hasF = false; for (let r = a; r <= b; r++) if (ws.rowHasFormula(r + 1)) hasF = true;
    if (hasF) { warnings.push('Το μπλοκ «' + det.blocks[i].label + '» δεν βγήκε από το έντυπο: έχει τύπους μέσα στις γραμμές του.'); continue; }
    for (let r = a; r <= b; r++) gone.add(r);
    goneBlocks.add(i);
  }
  // οι προσθήκες από κάτω προς τα πάνω (ίδιο σημείο: η τελευταία της λίστας πρώτη, ώστε στο τέλος να έχουν τη σειρά της λίστας)
  const done: { at: number; k: number }[] = [];            // at: 1-based «μετά από ποια γραμμή»
  const cur = (r0: number) => r0 + done.reduce((s, d) => s + (d.at < r0 + 1 ? d.k : 0), 0);   // γραμμή του αρχικού αρχείου (από 0) → σημερινή θέση (από 0) μέσα στη διαδικασία
  const addedAt: { ins: Ins; top: number }[] = [];
  const sorted = [...ins].sort((a, b) => (b.at - a.at) || (b.order - a.order));
  const L1 = colName(L + 1);
  for (const x of sorted) {
    const after1 = x.at;                                   // 1-based: οι νέες γραμμές μπαίνουν μετά από αυτή
    const like = det.blocks[x.like]; const lx = ex[x.like];
    const likeFirst = lx.top, likeSecond = like.rows.length > 1 ? like.rows[1].r : lx.top;
    const total = x.k;
    const shiftIf = (r0: number) => (cur(r0) + 1 > after1 ? cur(r0) + 1 + total : cur(r0) + 1);   // 1-based θέση μετά την εισαγωγή
    const lf1 = shiftIf(likeFirst);
    // οι συγχωνεύσεις της γραμμής-πρότυπο (πριν την εισαγωγή) για να μπουν στη νέα πρώτη γραμμή
    const firstMerges = rowMerges(ws, cur(likeFirst) + 1);
    ws.insertRows(after1, total, cur(likeSecond) + 1, wb);
    const newTop1 = after1 + 1;
    cloneRow(ws, lf1, newTop1, firstMerges);
    // αντικατάσταση: κάθε γραμμή παίρνει τη μορφή της αντίστοιχης γραμμής του νούμερου του μπλοκ-προτύπου (1η γραμμή νούμερου, 2η…)
    const perLike = like.groups.length > 1 ? like.rows[like.groups[1][0]].r - like.rows[like.groups[0][0]].r : lx.last - lx.top + 1;
    if (x.add.stack) for (let j = 1; j < total; j++) { const src0 = Math.min(lx.top + (j % Math.max(1, perLike)), lx.last); cloneRow(ws, shiftIf(src0), newTop1 + j, rowMerges(ws, shiftIf(src0))); }
    // μορφή της συγχώνευσης της λέξης (κάθετη) και κάθε άλλης κάθετης συγχώνευσης του μπλοκ-προτύπου
    for (const m of sheet.merges) {
      if (m.r1 < lx.top || m.r2 > lx.last || m.r2 <= m.r1) continue;
      const off = m.r1 - lx.top; const len = m.r2 - m.r1;
      if (m.c1 === L) { if (x.k > 1) ws.addMerge(L1 + newTop1 + ':' + colName(m.c2 + 1) + (newTop1 + x.k - 1)); continue; }
      if (x.add.stack) { const per = perOf(x.add); if (off < perLike && len < per) for (let gi = 0; gi < x.add.nums; gi++) ws.addMerge(colName(m.c1 + 1) + (newTop1 + gi * per + off) + ':' + colName(m.c2 + 1) + (newTop1 + gi * per + off + len)); continue; }
      if (off + len < x.k && x.add.per > 1) ws.addMerge(colName(m.c1 + 1) + (newTop1 + off) + ':' + colName(m.c2 + 1) + (newTop1 + off + len));
    }
    // λίστα κατάστασης: οι άδειες γραμμές της φαίνονται στην ανίχνευση μόνο μέσα από τη συγχωνευμένη λέξη, άρα η λέξη καλύπτει όλες τις γραμμές της
    if (x.add.state && x.k > 1) {
      const covered = ws.merges().some(m => m.c1 === L + 1 && m.r1 === newTop1 && m.r2 >= newTop1 + x.k - 1);
      if (!covered) {
        const c2 = ws.merges().find(m => m.r1 === newTop1 && m.r2 === newTop1 && m.c1 === L + 1)?.c2 ?? L + 1;
        for (const m of ws.merges().filter(y => y.r1 >= newTop1 && y.r2 <= newTop1 + x.k - 1 && y.c1 <= c2 && y.c2 >= L + 1)) ws.removeMerge(m);
        ws.addMerge(L1 + newTop1 + ':' + colName(c2) + (newTop1 + x.k - 1));
      }
    }
    // αντικατάσταση με 2+ γραμμές ανά νούμερο: το κελί του νούμερου καλύπτει όλες τις γραμμές του (όπως στα έντυπα που έχουν 2ο άτομο σε άδεια γραμμή), ώστε να διαβάζονται ξανά ως θέσεις
    if (x.add.stack && !x.add.state && det.cols.num.c != null && perOf(x.add) > 1) {
      const per = perOf(x.add); const nc1 = det.cols.num.c + 1;
      for (let gi = 0; gi < x.add.nums; gi++) { const r = newTop1 + gi * per; if (!ws.merges().some(m => m.c1 <= nc1 && m.c2 >= nc1 && m.r1 <= r && m.r2 >= r)) ws.addMerge(colName(nc1) + r + ':' + colName(nc1) + (r + per - 1)); }
    }
    // οι τιμές: λέξη, νούμερα, βάρδιες, ώρες
    ws.set(L1 + newTop1, x.add.label);
    const numC = det.cols.num.c, shC = det.cols.shift.c, hrC = det.cols.hours.c; const per = perOf(x.add);
    for (let gi = 0; gi < (x.add.state ? 0 : x.add.nums); gi++) {
      const r = newTop1 + gi * per;
      if (numC != null) ws.set(colName(numC + 1) + r, (gi + 1) + 'ο');
      if (shC != null && per > 1 && x.add.shifts !== false) for (let j = 0; j < per; j++) ws.set(colName(shC + 1) + (r + j), SHIFTS[j % SHIFTS.length]);
      const h = x.add.hours[gi]; if (hrC != null && h) ws.set(colName(hrC + 1) + r, h, true);
    }
    // τύποι που μετρούν τη λίστα (COUNTA(F5:F30)): ό,τι μπαίνει στην αρχή ή στο τέλος της ανήκει στην περιοχή τους
    if (x.at === ex[0].top && x.pos === -1) ws.pullStarts(sheet.name, after1 + 1 + total, after1 + 1);
    if (x.pos === n - 1 + 0.5) ws.growFormulas(sheet.name, cur(ex[0].top) + 1, after1, after1 + total);
    done.push({ at: after1, k: total });
    addedAt.push({ ins: x, top: newTop1 });
  }
  // οι αφαιρέσεις (μετά τις προσθήκες), από κάτω προς τα πάνω
  // αν φεύγει το πρώτο μπλοκ, οι περιοχές που ξεκινούσαν από αυτό ξεκινούν από το επόμενο (αλλιώς θα έπαιρναν την επικεφαλίδα)
  if (goneBlocks.has(0) && n > 1) ws.pullStarts(sheet.name, cur(ex[0].top) + 1, cur(ex[0].last) + 2);
  const rowsGone = [...gone].map(r0 => cur(r0) + 1).sort((a, b) => b - a);
  for (const r1 of rowsGone) { if (!ws.deleteRow(r1, wb, true)) return fail('Το φύλλο έχει πίνακες, σχέδια ή σχόλια του Excel: δεν αλλάζει η δομή του εντύπου (μόνο γεμίζει).'); }
  let data = await wb.save();
  let sheets = await modelOfBuffer(data); let sh2 = sheets.find(x => x.name === sheet.name); let det2 = sh2 ? redetect(sh2) : null;
  // η σειρά των μπλοκ στο νέο αρχείο: όσα έμειναν και τα νέα, με τη θέση τους
  type Item = { src: 'old'; i: number; pos: number; order: number } | { src: 'add'; x: Ins; pos: number; order: number }
  const seq: Item[] = [
    ...det.blocks.map((_, i) => i).filter(i => !goneBlocks.has(i)).map((i): Item => ({ src: 'old', i, pos: i, order: 0 })),
    ...ins.map((x): Item => ({ src: 'add', x, pos: x.pos, order: x.order + 1 }))
  ].sort((a, b) => (a.pos - b.pos) || (a.order - b.order));
  if (!sh2 || !det2 || det2.blocks.length !== seq.length) return fail('Το έντυπο μετά την αλλαγή δεν διαβάστηκε όπως περιμέναμε: η δομή του δεν αλλάζει.');
  // διαχωριστικές γραμμές: ανάμεσα σε δύο μπλοκ που δεν ήταν γειτονικά πριν (ή είναι νέα) μένει ακριβώς όση απόσταση είχε το έντυπο (μία γραμμή ή καμία)
  const touched = seq.slice(1).map((it, j) => { const pv = seq[j]; return it.src === 'add' || pv.src === 'add' || it.i !== pv.i + 1; });
  const del2: number[] = []; const ins2: number[] = [];
  if (touched.some(Boolean)) {
    const g2 = new Grid(sh2); const ex2 = extents(det2, g2); const want = anyGap ? 1 : 0;
    const gapN = ex2.slice(1).map((e, j) => e.top - ex2[j].last - 1);
    const j0 = gapN.findIndex(x => x >= 1); let src1 = j0 >= 0 ? ex2[j0].last + 2 : -1;
    const wb2 = await Workbook.open(data); wb2.widen = false; const w2 = await wb2.sheet(sheet.name);
    const sm: M[] = src1 > 0 ? rowMerges(w2, src1) : [];
    const jobs = touched.map((t, j) => ({ t, j })).filter(x => x.t && gapN[x.j] !== want).sort((a, b) => b.j - a.j);
    for (const { j } of jobs) {
      if (gapN[j] > want) {
        for (let r1 = ex2[j + 1].top; r1 >= ex2[j].last + 2 + want; r1--) { if (w2.rowHasFormula(r1)) continue; if (!w2.deleteRow(r1, wb2, true)) return fail('Το φύλλο έχει πίνακες, σχέδια ή σχόλια του Excel: δεν αλλάζει η δομή του εντύπου (μόνο γεμίζει).'); del2.push(r1); }
      } else if (src1 > 0) {
        const at = ex2[j].last + 1; w2.insertRows(at, 1, src1, wb2); const sr = src1 > at ? src1 + 1 : src1;
        cloneRow(w2, sr, at + 1, sm); ins2.push(at); if (src1 > at) src1++;
      }
    }
    if (del2.length || ins2.length) {
      data = await wb2.save(); sheets = await modelOfBuffer(data); sh2 = sheets.find(x => x.name === sheet.name); det2 = sh2 ? redetect(sh2) : null;
      if (!sh2 || !det2 || det2.blocks.length !== seq.length) return fail('Το έντυπο μετά την αλλαγή δεν διαβάστηκε όπως περιμέναμε: η δομή του δεν αλλάζει.');
    }
  }
  const keys: Record<string, string> = {}; const added: Record<string, string> = {};
  for (let j = 0; j < seq.length; j++) {
    const it = seq[j]; const nb = det2.blocks[j];
    if (it.src === 'old') keys[svcKeyOf(det.blocks[it.i])] = svcKeyOf(nb);
    else { if (nk(nb.label) !== nk(it.x.add.label)) return fail('Η νέα υπηρεσία «' + it.x.add.label + '» δεν αναγνωρίστηκε στη θέση της: η δομή του εντύπου δεν αλλάζει.'); added[it.x.add.value] = svcKeyOf(nb); }
  }
  const gl = [...gone].sort((a, b) => a - b);
  const rowMap1 = (r: number): number | null => {
    if (gone.has(r)) return null;
    const goneBefore = gl.filter(x => x < r).length;
    const insBefore = ins.reduce((s, x) => s + (x.at < r + 1 ? x.k : 0), 0);
    return r + insBefore - goneBefore;
  };
  const rowMap = (r: number): number | null => { const a = rowMap1(r); if (a == null) return null; if (del2.includes(a + 1)) return null; return a - del2.filter(d => d < a + 1).length + ins2.filter(x => x < a + 1).length; };
  return { ok: true, data, sheets, sheet: sh2, det: det2, keys, added, rowMap, warnings };
}
