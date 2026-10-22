// Πού είναι το κάθε στοιχείο σε ένα template εντύπου (Michael, 22/10: «να μπορεί να κάνει adapt στα πάντα όσον αφορά τα
// elements που έχουν τα excel»). Τα έντυπα της εφαρμογής (ΦΡΟΥΡΑ, Εξοδούχοι, πίσω σελίδα της ΗΚΑΙ) δεν γράφουν σε
// σταθερά κελιά: κάθε στοιχείο βρίσκεται από το κείμενό του (τίτλος, «Λ/Υ:», «ΘΑΛΑΜΟΦΥΛΑΚΕΣ» με τα «1ο, 2ο…» από κάτω,
// «ΤΙΜΩΡΗΜΕΝΟΙ», «1. ΕΓΓΡΑΦΕΣ:»…), όπου κι αν το έβαλε το template, με όσες γραμμές και στήλες έχει. Ό,τι δεν υπάρχει
// στο template δεν γράφεται (με προειδοποίηση αν είχε κάτι να γράψει): ποτέ «στα τυφλά» σε κελί που μπορεί να είναι άλλο.
// Στα templates της εφαρμογής βρίσκει ακριβώς τα κελιά που είχαν πριν (τεστ: tplmap.test.ts).
import { normGreek } from '../shared/text';
import type { XlValue } from './xlsx';

export interface Rect { r1: number; c1: number; r2: number; c2: number }
export interface TCell { r: number; c: number; t: string }   // από 1· t: κανονικοποιημένο κείμενο (κεφαλαία, χωρίς τόνους)
export const tnorm = (v: unknown) => normGreek(String(v ?? '')).replace(/\s+/g, ' ').trim();
export function textCells(rows: XlValue[][]): TCell[] {
  const out: TCell[] = [];
  rows.forEach((row, i) => (row || []).forEach((v, j) => { if (typeof v === 'string' && v.trim()) out.push({ r: i + 1, c: j + 1, t: tnorm(v) }); }));
  return out;
}
const mergeOf = (merges: Rect[], r: number, c: number) => merges.find(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
// Το πρώτο κελί δεξιά από μια ετικέτα (μετά τη συγχώνευσή της)
const rightOf = (merges: Rect[], x: { r: number; c: number }) => ({ r: x.r, c: (mergeOf(merges, x.r, x.c)?.c2 ?? x.c) + 1 });
// Κελιά-ετικέτες μιας στήλης: «1ο», «2ος», «3η», «4.» ή σκέτος αριθμός
export const NUM_LABEL = /^(\d{1,2})\s*(Ο|ΟΣ|Η|ΗΣ|\.)?$/;

// ------------------------------------------------------------------ ΦΡΟΥΡΑ
// Ένας πίνακας υπηρεσίας: επικεφαλίδα (π.χ. ΘΑΛΑΜΟΦΥΛΑΚΕΣ) και τα νούμερά του, το καθένα με τη γραμμή και το ύψος του
export interface FNum { r: number; h: number; label: string }
export interface FTable { kind: string; title: string; hr: number; aa: number | null; name: number; hours: number | null; note: number | null; nums: FNum[] }
export interface FList { hr: number; first: number; ready: number; cols: { aa?: number; name?: number; kind?: number; from?: number; to?: number; note?: number } }
export interface FrouraMap {
  title: TCell | null; head: { r: number; c: number }[]; ly: TCell | null; dy: TCell | null;
  tables: FTable[]; single: { kind: string; title: string; r: number; c: number }[];   // single: ετικέτα μίας θέσης (π.χ. ΤΑΕ) με το όνομα δεξιά
  bottom: number;                                                                       // τελευταία γραμμή των πινάκων υπηρεσιών
  pun: FList | null; abs: FList | null;
}
// Είδη θέσεων από την επικεφαλίδα του πίνακα
export const TABLE_KINDS: [string, RegExp][] = [['th', /^ΘΑΛΑΜΟΦΥΛΑΚ(ΕΣ|ΑΣ)?(?![\p{L}\d])/u], ['op', /^ΟΠΛΟΦΥΛΑΚ(ΕΣ|ΑΣ)?(?![\p{L}\d])/u], ['mg', /^ΜΑΓΕΙΡ(Ε)?Ι(Α|ΟΙ)?(?![\p{L}\d])|^ΜΑΓΕΙΡΟΙ(?![\p{L}\d])/u], ['sk', /^ΣΚΟΠΟΙ(?![\p{L}\d])|^ΣΚΟΠΙΕΣ(?![\p{L}\d])/u]];
const AA = /^Α\s*\/?\s*Α\.?$|^Α\.Α\.?$|^ΑΑ$/;
const HOURS = /^ΩΡΕΣ?$|^ΩΡΑ$|^ΒΑΡΔΙΕΣ$/;
const NOTE = /^ΠΑΡ\s*\/?\s*ΣΕΙΣ$|^ΠΑΡΑΤΗΡΗΣΕΙΣ$/;
// own: ονόματα των δικών σου υπηρεσιών (κανονικοποιημένα) → είδος/κλειδί· ένας πίνακας με τέτοια επικεφαλίδα παίρνει τις θέσεις της
export function mapFroura(rows: XlValue[][], merges: Rect[], own: Record<string, string> = {}): FrouraMap {
  const cs = textCells(rows);
  const at = (r: number, c: number) => cs.find(x => x.r === r && x.c === c);
  const title = cs.find(x => /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ(?![\p{L}\d])/u.test(x.t)) || null;
  const ly = cs.find(x => /^Λ\s*\/\s*Υ(?![\p{L}\d])|^ΛΟΧΙΑΣ ΥΠΗΡΕΣΙΑΣ(?![\p{L}\d])/u.test(x.t)) || null;
  const dy = cs.find(x => /^Δ\s*\/\s*Υ(?![\p{L}\d])|^ΔΕΚΑΝΕΑΣ ΥΠΗΡΕΣΙΑΣ(?![\p{L}\d])/u.test(x.t)) || null;
  // πίνακες: επικεφαλίδα γνωστού είδους (ή δικής σου υπηρεσίας) με νούμερα από κάτω
  const kindOf = (t: string) => TABLE_KINDS.find(([, re]) => re.test(t))?.[0] || own[t] || null;
  const tables: FTable[] = [];
  for (const h of cs) {
    const kind = kindOf(h.t); if (!kind) continue;
    const row = cs.filter(x => x.r === h.r);
    const aaC = row.filter(x => x.c < h.c && h.c - x.c <= 3 && AA.test(x.t)).sort((a, b) => b.c - a.c)[0];
    const after = row.filter(x => x.c > (mergeOf(merges, h.r, h.c)?.c2 ?? h.c)).sort((a, b) => a.c - b.c);
    const stop = after.findIndex(x => !HOURS.test(x.t) && !NOTE.test(x.t));
    const own2 = stop < 0 ? after : after.slice(0, stop);
    const hours = own2.find(x => HOURS.test(x.t))?.c ?? null, note = own2.find(x => NOTE.test(x.t))?.c ?? null;
    const nums: FNum[] = [];
    const hEnd = mergeOf(merges, h.r, h.c)?.r2 ?? h.r;
    if (aaC) {
      for (let r = hEnd + 1; r <= rows.length; r++) {
        const x = at(r, aaC.c);
        // κενή γραμμή: μέσα στο ίδιο νούμερο αν από κάτω (ως 4 γραμμές) συνεχίζει η αρίθμηση
        if (!x) {
          if (!nums.length) continue;
          const next = [1, 2, 3, 4].map(k => at(r + k, aaC.c)).find(Boolean);
          const last = Number(NUM_LABEL.exec(nums[nums.length - 1].label)?.[1]);
          if (next && NUM_LABEL.test(next.t) && Number(NUM_LABEL.exec(next.t)![1]) === last + 1) continue;
          if (mergeOf(merges, r, aaC.c) || at(r, h.c) || (hours != null && at(r, hours))) continue;
          break;
        }
        if (!NUM_LABEL.test(x.t)) break;
        nums.push({ r, h: 1, label: x.t });
      }
    } else {
      // χωρίς Α/Α: κάθε συγχωνευμένο (ή απλό) κελί του ονόματος από κάτω είναι ένα νούμερο, ως την πρώτη κενή γραμμή
      for (let r = hEnd + 1; r <= rows.length;) {
        const m = mergeOf(merges, r, h.c); const end = m && m.c1 === h.c ? m.r2 : r;
        if (!m && !at(r, h.c) && (hours == null || !at(r, hours))) break;
        if (at(r, h.c)) break;   // κείμενο στη στήλη του ονόματος: άλλος πίνακας
        nums.push({ r, h: 1, label: String(nums.length + 1) }); r = end + 1;
      }
    }
    // ύψος κάθε νούμερου: ως το επόμενο· το τελευταίο όσο τα άλλα, ή όσο η συγχώνευση του Α/Α ή του ονόματος
    nums.forEach((n, i) => {
      if (i + 1 < nums.length) { n.h = nums[i + 1].r - n.r; return; }
      const m = (aaC && mergeOf(merges, n.r, aaC.c)) || mergeOf(merges, n.r, h.c);
      n.h = m && m.r1 === n.r && m.r2 > n.r ? m.r2 - n.r + 1 : i ? nums[i - 1].h : 1;
    });
    if (nums.length) tables.push({ kind, title: h.t, hr: h.r, aa: aaC?.c ?? null, name: h.c, hours, note, nums });
  }
  tables.sort((a, b) => a.hr - b.hr || a.name - b.name);
  // θέσεις μίας γραμμής: ετικέτα στη στήλη Α/Α ενός πίνακα (ΤΑΕ κάτω από τα μαγειρεία) ή οπουδήποτε, με το όνομα δεξιά
  const single = cs.filter(x => /^ΤΑΕ$/.test(x.t) || (own[x.t] && !tables.some(t => t.hr === x.r && t.name === x.c))).filter(x => !tables.some(t => t.hr === x.r))
    .map(x => { const k = x.t === 'ΤΑΕ' ? 'tae' : own[x.t]; const rc = rightOf(merges, x); return { kind: k, title: x.t, r: rc.r, c: rc.c }; });
  const ends = [...tables.map(t => t.nums[t.nums.length - 1]).map((n, i) => n.r + n.h - 1 + 0 * i), ...single.map(x => x.r)];
  const bottom = ends.length ? Math.max(...ends) : 0;
  // κεφαλίδα: κελιά πάνω από τον τίτλο (ή από τον πρώτο πίνακα), στη στήλη με τα περισσότερα
  const top = title ? title.r : ly ? ly.r : tables.length ? tables[0].hr : 0;
  const above = cs.filter(x => x.r < top && x !== ly && x !== dy);
  const byCol = new Map<number, TCell[]>(); for (const x of above) byCol.set(x.c, [...(byCol.get(x.c) || []), x]);
  const hc = [...byCol.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  const head = hc ? hc[1].sort((a, b) => a.r - b.r).slice(0, 3).map(x => ({ r: x.r, c: x.c })) : [];
  return { title, head, ly, dy, tables, single, bottom, pun: listOf(cs, merges, /^ΤΙΜΩΡΗΜΕΝΟΙ(?![\p{L}\d])/u, rows), abs: listOf(cs, merges, /^ΑΠΟΝΤΕΣ(?![\p{L}\d])/u, rows) };
}
// Λίστα τιμωρημένων/απόντων: ο τίτλος, οι επικεφαλίδες από κάτω (ΟΝΟΜΑΤΕΠΩΝΥΜΟ, ΕΙΔΟΣ, ΑΠΟ, ΕΩΣ, ΠΑΡ/ΣΕΙΣ) και πόσες
// έτοιμες γραμμές (με αρίθμηση) έχει
function listOf(cs: TCell[], merges: Rect[], re: RegExp, rows: XlValue[][]): FList | null {
  const t = cs.find(x => re.test(x.t)); if (!t) return null;
  const span = mergeOf(merges, t.r, t.c); const c1 = span?.c1 ?? t.c, c2 = Math.max(span?.c2 ?? t.c, c1 + 5);
  for (let r = t.r + 1; r <= t.r + 3; r++) {
    const row = cs.filter(x => x.r === r && x.c >= c1 && x.c <= c2);
    const f = (re2: RegExp) => row.find(x => re2.test(x.t))?.c;
    const name = f(/^(ΒΑΘΜΟΣ\s*-?\s*)?ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^ΟΝΟΜΑ(ΤΑ)?$/); if (name == null) continue;
    const cols = { aa: f(AA), name, kind: f(/^ΕΙΔΟΣ(?![\p{L}\d])|^ΠΟΙΝΗ$|^ΑΙΤΙΑ$/u), from: f(/^ΑΠΟ$/), to: f(/^ΕΩΣ$|^ΜΕΧΡΙ$/), note: f(NOTE) };
    const hEnd = Math.max(r, ...row.map(x => mergeOf(merges, x.r, x.c)?.r2 ?? r));
    const first = hEnd + 1; let ready = 0;
    if (cols.aa != null) while (typeof rows[first + ready - 1]?.[cols.aa - 1] === 'number' || NUM_LABEL.test(tnorm(rows[first + ready - 1]?.[cols.aa - 1]))) ready++;
    return { hr: r, first, ready: Math.max(ready, 1), cols };
  }
  return null;
}

// ------------------------------------------------------------------ Εξοδούχοι / Παραμένοντες
export const OUT_FIELDS: [string, RegExp][] = [
  ['aa', AA], ['rank', /^ΒΑΘΜ(ΟΣ|\.)?$/], ['spec', /^Ο\s*[-/]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$|^ΟΠΛΟ\s*\/\s*ΣΩΜΑ$/], ['last', /^ΕΠΙΘΕΤΟ$|^ΕΠΩΝΥΜΟ$/], ['first', /^ΟΝΟΜΑ$/],
  ['father', /^ΠΑΤΡΩΝΥΜΟ$|^ΟΝΟΜΑ ΠΑΤΡΟΣ$/], ['name', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$/], ['who', /^ΒΑΘΜΟΣ\s*-?\s*ΟΝΟΜΑΤΕΠΩΝΥΜΟ$/], ['room', /^ΘΑΛ(ΑΜΟΣ|\.)?$/],
  ['phone', /^ΤΗΛΕΦΩΝΟ$|^ΚΙΝΗΤΟ( ΤΗΛΕΦΩΝΟ)?$|^ΤΗΛ\.?$/], ['asm', /^ΑΣΜ$|^Α\.Σ\.Μ\.?$/], ['note', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΠΑΡ\s*\/?\s*ΣΕΙΣ$/], ['si', /^Σ\.?Ι\.?$/]
];
export interface OutsMap { head: { r: number; c: number }[]; title: TCell | null; hr: number; first: number; cols: Record<string, number>; place: TCell | null }
// Η λίστα ενός φύλλου (ή του κομματιού του από τη γραμμή from ως τη to, όταν έχει και τις δύο λίστες)
export function mapOuts(rows: XlValue[][], merges: Rect[], place: string, from = 1, to = rows.length): OutsMap | null {
  const cs = textCells(rows).filter(x => x.r >= from && x.r <= to);
  let best: { r: number; cols: Record<string, number> } | null = null;
  for (let r = from; r <= Math.min(to, from + 60); r++) {
    const cols: Record<string, number> = {};
    for (const x of cs.filter(y => y.r === r)) { const k = OUT_FIELDS.find(([, re]) => re.test(x.t))?.[0]; if (k && cols[k] == null) cols[k] = x.c; }
    const n = Object.keys(cols).filter(k => k !== 'aa').length;
    if (n >= 2 && (!best || n > Object.keys(best.cols).length - (best.cols.aa ? 1 : 0))) best = { r, cols };
  }
  if (!best) return null;
  const hr = best.r; const hEnd = Math.max(hr, ...Object.values(best.cols).map(c => mergeOf(merges, hr, c)?.r2 ?? hr));
  const title = cs.filter(x => x.r < hr && /^(ΕΞΟΔΟΥΧΟΙ|ΠΑΡΑΜΕΝΟΝΤΕΣ|ΚΑΤΑΣΤΑΣΗ)(?![\p{L}\d])/u.test(x.t)).sort((a, b) => b.r - a.r)[0] || null;
  const top = title ? title.r : hr;
  const above = cs.filter(x => x.r < top);
  const byCol = new Map<number, TCell[]>(); for (const x of above) byCol.set(x.c, [...(byCol.get(x.c) || []), x]);
  const hc = [...byCol.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  const head = hc ? hc[1].sort((a, b) => a.r - b.r).slice(0, 3).map(x => ({ r: x.r, c: x.c })) : [];
  const pl = tnorm(place).replace(/[^Α-ΩA-Z]/g, '');
  const placeC = cs.filter(x => x.r > hEnd && ((pl && x.t.replace(/[^Α-ΩA-Z,]/g, '').startsWith(pl + ',')) || /^[Α-ΩA-Z]+\s*,\s*$/.test(x.t))).sort((a, b) => a.r - b.r)[0] || null;
  return { head, title, hr, first: hEnd + 1, cols: best.cols, place: placeC };
}

// ------------------------------------------------------------------ ΗΚΑΙ: πίσω σελίδα
// Κάθε κελί που γράφει η εφαρμογή στην πίσω σελίδα, από την ετικέτα του: δεξιά της (1. ΕΓΓΡΑΦΕΣ… 6. ΛΟΙΠΑ), κάτω της
// (Αξιωματικοί, Υπαξιωματικοί), στη στήλη «Στρατιώτες» (φρουρές), κάτω από τις επικεφαλίδες (οχήματα, ατυχήματα)
export interface HkBack { egr?: string; dia?: string; leaves?: string; puns?: string; reqs?: string; loi?: string; off?: string; ly?: string; dy?: string; date?: string;
  night?: string; day24?: string; vType?: string; vProv?: string; vKin?: string; vMaint?: string; vDmg?: string; accT?: string; accP?: string; accM?: string }
const ref = (c: number, r: number) => { let s = ''; let n = c; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s + r; };
export function mapHkBack(rows: XlValue[][], merges: Rect[], place: string): HkBack {
  const cs = textCells(rows); const out: HkBack = {};
  const find = (re: RegExp) => cs.find(x => re.test(x.t));
  const right = (re: RegExp) => { const x = find(re); if (!x) return undefined; const p = rightOf(merges, x); return ref(p.c, p.r); };
  out.egr = right(/^1\s*\.?\s*ΕΓΓΡΑΦΕΣ(?![\p{L}\d])/u); out.dia = right(/^2\s*\.?\s*ΔΙΑΓΡΑΦΕΣ(?![\p{L}\d])/u); out.leaves = right(/^3\s*\.?\s*ΑΔΕΙΕΣ(?![\p{L}\d])/u);
  out.puns = right(/^4\s*\.?\s*ΠΟΙΝΕΣ(?![\p{L}\d])/u); out.reqs = right(/^5\s*\.?\s*ΑΙΤΗΣΕΙΣ(?![\p{L}\d])/u); out.loi = right(/^6\s*\.?\s*ΛΟΙΠΑ(?![\p{L}\d])/u);
  const below = (re: RegExp, k = 1) => { const x = find(re); if (!x) return undefined; const r = (mergeOf(merges, x.r, x.c)?.r2 ?? x.r) + k; return ref(x.c, r); };
  out.off = below(/^ΑΞΙΩΜΑΤΙΚΟΙ\s*:?$/); out.ly = below(/^ΥΠΑΞΙΩΜΑΤΙΚΟΙ\s*:?$/); out.dy = below(/^ΥΠΑΞΙΩΜΑΤΙΚΟΙ\s*:?$/, 2);
  const pl = tnorm(place).replace(/[^Α-ΩA-Z]/g, '');
  const d = pl ? cs.filter(x => x.t.replace(/[^Α-ΩA-Z,]/g, '').startsWith(pl + ',')).sort((a, b) => b.r - a.r)[0] : undefined;
  if (d) out.date = ref(d.c, d.r);
  // φρουρές: η στήλη «Στρατιώτες» της επικεφαλίδας, στις γραμμές «Νυκτοφρουρές» και «24ώρες»
  const night = find(/^ΝΥΚΤΟΦΡΟΥΡ/), day = find(/^24\s*ΩΡ/);
  const strat = (x: TCell | undefined) => x && cs.filter(y => y.r < x.r && /^ΣΤΡΑΤΙΩΤΕΣ$/.test(y.t)).sort((a, b) => b.r - a.r)[0];
  const sn = strat(night), sd = strat(day);
  if (night && sn) out.night = ref(sn.c, night.r);
  if (day && sd) out.day24 = ref(sd.c, day.r);
  // οχήματα: μία γραμμή κάτω από τις επικεφαλίδες (η πρώτη με είδος οχήματος, ή η πρώτη μετά τις επικεφαλίδες)
  const vh = find(/^ΕΙΔ(Η|ΟΣ) ΟΧΗΜΑΤ/);
  if (vh) {
    const zone = cs.filter(x => x.r >= vh.r && x.r <= vh.r + 4 && x.c > vh.c && x.c <= vh.c + 6);
    const col = (re: RegExp) => zone.find(x => re.test(x.t));
    const hs = [col(/^ΠΡΟΒΛΕΠΟΝΤΑΙ$/), col(/^ΣΕ ΚΙΝΗΣΗ$/), col(/ΣΥΝΤΗΡΗΣΗ/), col(/ΒΛΑΒΗΣ|ΑΤΥΧΗΜΑΤΟΣ/)];
    const hdrEnd = Math.max(vh.r, ...hs.filter((x): x is TCell => !!x).map(x => mergeOf(merges, x.r, x.c)?.r2 ?? x.r));
    const typed = cs.filter(x => x.c === vh.c && x.r > (mergeOf(merges, vh.r, vh.c)?.r2 ?? vh.r)).sort((a, b) => a.r - b.r)[0];
    const r = typed && typed.r <= hdrEnd + 3 ? typed.r : hdrEnd + 1;
    out.vType = ref(vh.c, r);
    [out.vProv, out.vKin, out.vMaint, out.vDmg] = hs.map(x => (x ? ref(x.c, r) : undefined));
  }
  // ατυχήματα: Ολικές, Μερικές (ζημιές σε οχήματα) και Σε άνδρες, στη γραμμή κάτω από τις επικεφαλίδες τους
  const ah = find(/^ΑΤΥΧΗΜΑΤΑ$/);
  if (ah) {
    const zone = cs.filter(x => x.r > ah.r && x.r <= ah.r + 4 && x.c >= ah.c - 1 && x.c <= ah.c + 6);
    const accs = [zone.find(x => /^ΟΛΙΚΕΣ$/.test(x.t)), zone.find(x => /^ΜΕΡΙΚΕΣ$/.test(x.t)), zone.find(x => /^ΣΕ ΑΝΔΡΕΣ$/.test(x.t))];
    const end = Math.max(ah.r, ...accs.filter((x): x is TCell => !!x).map(x => mergeOf(merges, x.r, x.c)?.r2 ?? x.r));
    [out.accT, out.accP, out.accM] = accs.map(x => (x ? ref(x.c, end + 1) : undefined));
  }
  return out;
}
