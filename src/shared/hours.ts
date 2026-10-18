// Ώρες στις άδειες (Michael, 13/10): ώρα αναχώρησης την πρώτη μέρα και ώρα επιστροφής την τελευταία. Προαιρετικές:
// χωρίς ώρα όλα μένουν όπως πριν (η άδεια πιάνει ολόκληρες τις μέρες από–έως).
import type { CellValue } from './roster';
import type { Status, TypeKey } from './domain';

// Ποια είδη έχουν ώρες: οι άδειες (κανονική, τιμητική, αναρρωτική), το νοσοκομείο και ο ΣΤΕΠ (Michael, 18/10: «και για
// τις υπόλοιπες καταστάσεις όπου έχει σημασία»). Τα ιατρικά (ΕΥ, ΕΑ…), οι ποινές και οι έξοδοι είναι ολόκληρες μέρες.
export const TIMED: TypeKey[] = ['LEAVE', 'HON', 'SICK', 'NOS', 'STEP'];
export const hasTimes = (t: TypeKey) => TIMED.includes(t);
// Πώς λέγονται οι δύο ώρες: στις άδειες αναχώρηση/επιστροφή, στο νοσοκομείο και στον ΣΤΕΠ εισαγωγή/έξοδος
const IN_OUT: TypeKey[] = ['NOS', 'STEP'];
export const timeNames = (t?: TypeKey) => (t && IN_OUT.includes(t)
  ? { from: 'εισαγωγή', to: 'έξοδος', fromG: 'εισαγωγής', toG: 'εξόδου' }
  : { from: 'αναχώρηση', to: 'επιστροφή', fromG: 'αναχώρησης', toG: 'επιστροφής' });

// «14», «1400», «14.00», «14:00», «9:30» → «14:00», «09:30». Κενό → ''. Άκυρο → null.
export function normTime(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const m = /^(\d{1,2})(?:\s*[:.,]\s*(\d{2})|(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +(m[2] ?? m[3] ?? 0);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return String(h === 24 ? 0 : h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
// Λεπτά από τα μεσάνυχτα
export const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

// Ώρα από κελί του Excel: ώρα του Excel (κλάσμα της μέρας, ή ημερομηνία με ώρα), ή κείμενο «14:00»
export function cellTime(v: CellValue): string | null {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (v instanceof Date) { if (isNaN(+v)) return null; return hm(v.getUTCHours() * 60 + v.getUTCMinutes() + Math.round(v.getUTCSeconds() / 60)); }
  if (typeof v === 'number') {
    if (v < 0) return null;
    // 14 ή 1400 γραμμένα ως αριθμός· αλλιώς κλάσμα της μέρας (14:00 = 0,5833)
    if (Number.isInteger(v) && v <= 2400) return normTime(String(v)) || null;
    return hm(Math.round((v - Math.floor(v)) * 1440));
  }
  return normTime(v) || null;
}
const hm = (m: number) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

// Οι ώρες μιας άδειας σε κείμενο: «αναχώρηση 14:00, επιστροφή 22:00» (νοσοκομείο: «εισαγωγή 10:00, έξοδος 18:00»)
export function timesTxt(s: Pick<Status, 'fromTime' | 'toTime' | 'open'> & { type?: TypeKey }): string {
  const n = timeNames(s.type);
  return [s.fromTime && n.from + ' ' + s.fromTime, s.toTime && !s.open && n.to + ' ' + s.toTime].filter(Boolean).join(', ');
}
// Γύρισε ως τις m (λεπτά από τα μεσάνυχτα της μέρας d); Μόνο την τελευταία μέρα και μόνο με ώρα επιστροφής: από εκεί και
// πέρα η μέρα είναι δική του (π.χ. επιστροφή Τετάρτη 06:00 → την Τετάρτη βγαίνει κανονικά έξοδο, Michael 18/10).
// Χωρίς ώρα η τελευταία μέρα μετρά ολόκληρη, όπως πριν.
export const backBy = (s: Pick<Status, 'type' | 'to' | 'toTime' | 'open'>, d: string, m: number) =>
  !!s.toTime && !s.open && s.to === d && hasTimes(s.type) && mins(s.toTime) <= m;
// «14/10–17/10», με ώρες «14/10 14:00–17/10 22:00» (την ίδια μέρα «14/10 08:00–12:00»)
export function rangeHm(s: Pick<Status, 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>, dm: (d: string) => string): string {
  const back = s.toTime && !s.open ? s.toTime : '';
  const a = dm(s.from) + (s.fromTime ? ' ' + s.fromTime : '');
  if (s.to === s.from) return a + (back ? '–' + back : '');
  return a + '–' + dm(s.to) + (back ? ' ' + back : '');
}
