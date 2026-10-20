// Υπογραφές στο Excel (Michael, 20/10): όσες είναι στη λίστα, από αριστερά προς τα δεξιά, η καθεμία με τη λέξη από πάνω
// («Ο», «-Ο-», «ΤΟ»), τη θέση, και το όνομα λίγο πιο κάτω (για να χωράει η υπογραφή και η σφραγίδα).
// Στα έντυπα της εφαρμογής (ΗΚΑΙ, ΦΡΟΥΡΑ, Εξοδούχοι) οι υπογραφές του εντύπου βρίσκονται από τα κείμενά τους: ίδιο
// πλήθος, στις ίδιες θέσεις· άλλο πλήθος, μοιράζονται ανάμεσα στην πρώτη και την τελευταία. Σε δικό σου πρότυπο, ένα
// κελί {ΥΠΟΓΡΑΦΕΣ} δείχνει τη γραμμή τους (απλώνονται στο πλάτος του κελιού αν είναι συγχωνευμένο, αλλιώς του πίνακα).
import { colName, type Sheet, type Workbook, type XlValue } from './xlsx';
import { normGreek } from '../shared/text';
import type { Sig } from '../shared/sigs';
import type { Block } from '../shared/layout';

export const SIG_TAG = '{ΥΠΟΓΡΑΦΕΣ}';
export const NAME_GAP = 4;   // το όνομα 4 γραμμές κάτω από τη θέση (3 κενές για την υπογραφή)
const ART = /^-?\s*(Ο|Η|ΤΟ|ΟΙ|ΤΑ)\s*-?$/;
const TAG = /^\{\s*ΥΠΟΓΡΑΦΕΣ\s*\}$/;
const str = (v: XlValue | undefined) => (typeof v === 'string' ? v : '');
type Span = { c1: number; c2: number };
interface Anchor { r: number; art: number; dash: boolean; tr: number; title: Span }

// Οι υπογραφές του εντύπου: κάθε «Ο» (ή «-Ο-», «ΤΟ») που έχει από κάτω τη θέση· μόνο της πιο κάτω γραμμής του φύλλου
function anchorsOf(ws: Sheet, rows: XlValue[][]): Anchor[] {
  const out: Anchor[] = [];
  rows.forEach((row, i) => (row || []).forEach((v, j) => {
    const t = normGreek(str(v)); if (!ART.test(t)) return;
    const r = i + 1, c = j + 1;
    const below = (rows[r] || []).map((x, k) => ({ c: k + 1, t: str(x).trim() })).filter(x => x.t && !ART.test(normGreek(x.t)) && !ws.hasFormula(colName(x.c) + (r + 1)));
    const spanOf = (k: number): Span => { const m = ws.mergeAt(colName(k) + (r + 1)); return m ? { c1: m.c1, c2: m.c2 } : { c1: k, c2: k }; };
    const hit = below.find(x => { const s = spanOf(x.c); return s.c1 <= c && c <= s.c2; }) || below.filter(x => Math.abs(x.c - c) <= 3).sort((a, b) => Math.abs(a.c - c) - Math.abs(b.c - c))[0];
    if (hit) out.push({ r, art: c, dash: t.startsWith('-'), tr: r + 1, title: spanOf(hit.c) });
  }));
  const last = Math.max(0, ...out.map(a => a.r));
  return out.filter(a => a.r === last).sort((a, b) => a.title.c1 - b.title.c1);
}

// Θέσεις σε πλάτος του Excel (χαρακτήρες): αρχή κάθε στήλης, κέντρο, και οι στήλες για κάθε υπογραφή
function widths(ws: Sheet, upto: number) {
  const left: number[] = [0, 0];
  for (let c = 1; c <= upto + 30; c++) left[c + 1] = left[c] + ws.colWidth(c);
  const center = (s: Span) => (left[s.c1] + left[s.c2 + 1]) / 2;
  const colAt = (x: number) => { let c = 1; while (c < left.length - 2 && left[c + 1] <= x) c++; return c; };
  // για κάθε κομμάτι [lo, hi): οι στήλες που έχουν το κέντρο τους μέσα (καμία: όπου πέφτει η μέση), από αριστερά προς τα
  // δεξιά χωρίς να πατά η μία την άλλη
  const slots = (segs: [number, number][]): Span[] => segs.reduce<Span[]>((out, [lo, hi]) => {
    let c1 = 0, c2 = 0;
    for (let c = 1; c < left.length - 1; c++) { const m = (left[c] + left[c + 1]) / 2; if (m >= lo && m < hi && left[c + 1] > left[c]) { c1 ||= c; c2 = c; } }
    if (!c1) c1 = c2 = colAt((lo + hi) / 2);
    const prev = out[out.length - 1]; if (prev && c1 <= prev.c2) { c1 = prev.c2 + 1; c2 = Math.max(c1, c2); }
    return [...out, { c1, c2 }];
  }, []);
  return { left, center, colAt, slots };
}

// Γράφει τις υπογραφές, μία σε κάθε κομμάτι (συγχωνευμένο αν πιάνει πολλές στήλες), στη γραμμή r (λέξη) και r+1
// (θέση), με το όνομα πιο κάτω
async function writeAt(wb: Workbook, ws: Sheet, rows: XlValue[][], list: Sig[], spans: Span[], r: number, st: { art: number | null; title: number | null; dash: boolean }, warnings: string[]): Promise<Block[]> {
  const nr = r + 1 + NAME_GAP;
  // κελιά με σκέτα κενά στις γραμμές των υπογραφών: στο Excel σταματούν το κείμενο που απλώνει δίπλα
  for (const row of [r, r + 1, nr]) (rows[row - 1] || []).forEach((v, j) => { if (typeof v === 'string' && !v.trim() && !ws.hasFormula(colName(j + 1) + row)) ws.set(colName(j + 1) + row, null); });
  const art = await wb.centered(st.art), title = await wb.centered(st.title);
  const merges = ws.merges();
  const put = (row: number, sp: Span, v: string, style: number) => {
    const L = colName(sp.c1); ws.set(L + row, v).setStyle(L + row, style);
    if (sp.c2 <= sp.c1 || merges.some(m => m.r1 <= row && row <= m.r2 && m.c1 <= sp.c2 && sp.c1 <= m.c2)) return;
    for (let c = sp.c1 + 1; c <= sp.c2; c++) { const ref = colName(c) + row; if (!str(rows[row - 1]?.[c - 1]).trim()) ws.set(ref, null); ws.setStyle(ref, style); }
    ws.addMerge(L + row + ':' + colName(sp.c2) + row);
  };
  return list.map((x, i) => {
    const sp = spans[i]; const b: Block = { id: 's' + i, r1: r, c1: sp.c1, r2: r + 1, c2: sp.c2 };
    if (x.art) put(r, sp, st.dash ? '-' + x.art + '-' : x.art, art);
    if (x.title) put(r + 1, sp, x.title, title);
    if (!x.name) return b;
    const busy = [...Array(sp.c2 - sp.c1 + 1).keys()].map(k => sp.c1 + k).find(c => ws.hasFormula(colName(c) + nr) || str(rows[nr - 1]?.[c - 1]).trim());
    if (busy) { warnings.push('Το όνομα «' + x.name + '» δεν μπήκε κάτω από την υπογραφή: το κελί ' + colName(busy) + nr + ' έχει ήδη κάτι'); return b; }
    put(nr, sp, x.name, title); wb.printDownTo(ws.name, nr);
    return { ...b, r2: nr };
  });
}
// Τα κελιά μιας υπογραφής του εντύπου: η λέξη από πάνω και η θέση (με τις συγχωνεύσεις τους), και το όνομα αν μπήκε
function anchorBlock(ws: Sheet, a: Anchor, i: number, r2 = a.tr): Block {
  const m = ws.mergeAt(colName(a.art) + a.r);
  return { id: 's' + i, r1: a.r, c1: Math.min(m?.c1 ?? a.art, a.title.c1), r2, c2: Math.max(m?.c2 ?? a.art, a.title.c2) };
}

// sigs: οι υπογραφές που θέλεις (null = όπως το έντυπο). Το {ΥΠΟΓΡΑΦΕΣ} γεμίζει πάντα, με τις sigs ή, αν δεν δόθηκαν, με τις def.
// Γυρνά πού βρίσκεται η καθεμία (για τη μετακίνηση πάνω στο χαρτί, layout.ts)
export async function placeSigs(wb: Workbook, ws: Sheet, sigs: Sig[] | null, def: Sig[], warnings: string[]): Promise<Block[]> {
  const rows = await wb.values(ws.name, 2000, 60);
  const tags: { r: number; c: number }[] = [];
  rows.forEach((row, i) => (row || []).forEach((v, j) => { if (TAG.test(normGreek(str(v)).trim())) tags.push({ r: i + 1, c: j + 1 }); }));
  if (tags.length) {
    const list = sigs ?? def; let out: Block[] = [];
    for (const t of tags) {
      const ref = colName(t.c) + t.r; const m = ws.mergeAt(ref); const s = ws.style(ref);
      const span: Span = m ? { c1: m.c1, c2: m.c2 } : { c1: 1, c2: Math.max(t.c, ws.lastCol()) };
      if (m) ws.removeMerge(m);
      ws.set(ref, null);
      if (!list.length) continue;
      const w = widths(ws, span.c2); const L = w.left[span.c1], R = w.left[span.c2 + 1], k = (R - L) / list.length;
      const got = await writeAt(wb, ws, rows, list, w.slots(list.map((_, i) => [L + i * k, L + (i + 1) * k])), t.r, { art: s, title: s, dash: false }, warnings);
      if (!out.length) out = got;
    }
    return out;
  }
  const an = anchorsOf(ws, rows);
  if (!sigs) return an.map((a, i) => anchorBlock(ws, a, i));
  if (!an.length) { if (sigs.length) warnings.push('Στο φύλλο «' + ws.name + '» δεν βρέθηκαν υπογραφές και έμειναν όπως είναι. Γράψε ' + SIG_TAG + ' σε ένα κελί για να μπουν εκεί.'); return []; }
  const st = { art: ws.style(colName(an[0].art) + an[0].r), title: ws.style(colName(an[0].title.c1) + an[0].tr), dash: an.some(a => a.dash) };
  const r = an[0].r;
  // ίδιο πλήθος: στις θέσεις του εντύπου (με τις συγχωνεύσεις του)
  if (sigs.length === an.length) {
    for (const a of an) { ws.set(colName(a.art) + a.r, null); ws.set(colName(a.title.c1) + a.tr, null); }
    const nr = r + 1 + NAME_GAP;
    return sigs.map((x, i) => {
      const a = an[i]; const T = colName(a.title.c1);
      ws.set(colName(a.art) + a.r, x.art ? (a.dash ? '-' + x.art + '-' : x.art) : null);
      ws.set(T + a.tr, x.title || null);
      if (!x.name) return anchorBlock(ws, a, i);
      if (ws.hasFormula(T + nr) || str(rows[nr - 1]?.[a.title.c1 - 1]).trim()) { warnings.push('Το όνομα «' + x.name + '» δεν μπήκε κάτω από την υπογραφή: το κελί ' + T + nr + ' έχει ήδη κάτι'); return anchorBlock(ws, a, i); }
      const s = ws.style(T + a.tr); ws.set(T + nr, x.name); if (s != null) ws.setStyle(T + nr, s); wb.printDownTo(ws.name, nr);
      if (a.title.c2 > a.title.c1 && !ws.merges().some(m => m.r1 <= nr && nr <= m.r2 && m.c1 <= a.title.c2 && a.title.c1 <= m.c2)) {
        for (let c = a.title.c1 + 1; c <= a.title.c2; c++) if (s != null) ws.setStyle(colName(c) + nr, s);
        ws.addMerge(T + nr + ':' + colName(a.title.c2) + nr);
      }
      return anchorBlock(ws, a, i, nr);
    });
  }
  // άλλο πλήθος: λιγότερες μοιράζονται ανάμεσα στην πρώτη και την τελευταία υπογραφή του εντύπου (μία μόνη: δεξιά),
  // περισσότερες σε όλο το πλάτος του φύλλου
  for (const a of an) {
    for (const ref of [colName(a.art) + a.r, colName(a.title.c1) + a.tr]) { const m = ws.mergeAt(ref); if (m) ws.removeMerge(m); ws.set(ref, null); }
  }
  if (!sigs.length) return [];
  const w = widths(ws, ws.lastCol()); const n = sigs.length;
  let spans: Span[];
  if (n === 1) spans = [an[an.length - 1].title];
  else if (an.length >= 2 && n < an.length) {
    // τα κέντρα από την πρώτη ως την τελευταία του εντύπου, και η καθεμία πιάνει ως τη μέση της απόστασης από τις διπλανές
    const a = w.center(an[0].title), b = w.center(an[an.length - 1].title), gap = (b - a) / (n - 1);
    spans = w.slots(sigs.map((_, i) => [a + (i - 0.5) * gap, a + (i + 0.5) * gap]));
  } else { const W = w.left[ws.lastCol() + 1], k = W / n; spans = w.slots(sigs.map((_, i) => [i * k, (i + 1) * k])); }
  return writeAt(wb, ws, rows, sigs, spans, r, st, warnings);
}
