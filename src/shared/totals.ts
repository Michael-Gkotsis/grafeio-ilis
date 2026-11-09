// Σύνολα κάτω από τον πίνακα του ΣΥΝΟΛΙΚΟ (Michael, 3/11): «ΣΤΕΠ :», «ΑΝΑΡΡΩΤΙΚΕΣ ΑΔΕΙΕΣ», « ΑΔΕΙΕΣ», «ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ».
// Η τιμή είναι το πρώτο μη κενό κελί δεξιά από την ετικέτα στην ίδια γραμμή (ως 3 στήλες). Γράφεται μόνο αν εκεί υπάρχει απλός αριθμός
// (ποτέ πάνω σε τύπο)· ετικέτα που δεν βρέθηκε δεν γράφει τίποτα.
import { norm } from './text';
import type { RawSheet } from './roster';
import type { SheetTotals } from './strengthView';
import type { Status, TypeKey } from './domain';

const LABELS: [keyof SheetTotals, RegExp][] = [
  ['step', /^ΣΤΕΠ$/],
  ['sick', /^ΑΝΑΡ+\S*ΑΔΕΙΕΣ$/],
  ['leave', /^ΑΔΕΙΕΣ$/],
  ['hosp', /^(ΕΙΣΑΓΩΓΕΣ)?ΝΟΣΟΚΟΜΕΙΟ$/],
];
const key = (v: unknown) => norm(v).replace(/[^A-ZΑ-Ω]/g, '');
// from: πρώτη γραμμή που εξετάζεται (κάτω από τα άτομα του πίνακα)· isFx: το κελί έχει τύπο
export function planTotals(
  sheet: RawSheet,
  t: SheetTotals,
  from: number,
  isFx: (r: number, c: number) => boolean,
): { r: number; c: number; v: number }[] {
  const out: { r: number; c: number; v: number }[] = [];
  const done = new Set<keyof SheetTotals>();
  for (let r = Math.max(0, from); r < sheet.rows.length; r++) {
    const row = sheet.rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] !== 'string') continue;
      const hit = LABELS.find(([k, re]) => !done.has(k) && re.test(key(row[c])));
      if (!hit) continue;
      done.add(hit[0]);
      let vc = -1;
      for (let x = c + 1; x <= c + 3 && vc < 0; x++) if (row[x] != null && row[x] !== '') vc = x;
      if (vc < 0 || isFx(r, vc)) continue;
      const cur = row[vc];
      if (!(typeof cur === 'number' || (typeof cur === 'string' && /^\s*\d+\s*$/.test(cur)))) continue;
      if (Number(cur) !== t[hit[0]]) out.push({ r, c: vc, v: t[hit[0]] });
    }
  }
  return out;
}

// Άλλαξε κάτι που μετρά στα σύνολα (ΣΤΕΠ, αναρρωτική, άδεια, νοσοκομείο); Τότε ξαναγράφεται και το Δυναμολόγιο, όχι μόνο το φύλλο
// της κατάστασης: αλλιώς τα σύνολα κάτω από το ΣΥΝΟΛΙΚΟ έμεναν παλιά ως την επόμενη αλλαγή σε άτομο (4/11).
// Όχι για εξοδούχους/ΔΝ/ποινές: αυτά αλλάζουν συχνά και δεν μετρούν εδώ.
const TOTAL_TYPES = new Set<TypeKey>(['STEP', 'SICK', 'LEAVE', 'HON', 'NOS']);
export function totalsTouched(prev: Status[], next: Status[]): boolean {
  if (prev === next) return false;
  const a = new Set(prev),
    b = new Set(next);
  return (
    next.some((x) => !a.has(x) && TOTAL_TYPES.has(x.type)) || prev.some((x) => !b.has(x) && TOTAL_TYPES.has(x.type))
  );
}
