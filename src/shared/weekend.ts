// Σαββατοκύριακο (Michael, 18/10, 24/10): «ΔΝ ΣΚ» το Σάββατο = ΔΝ και το Σάββατο και την Κυριακή (το πότε γυρίζουν είναι στο returns.ts).
// Οι παρατηρήσεις των εξοδούχων και των παραμενόντων γράφονται δίπλα στην κατάσταση, σε παρένθεση: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)».
import { TYPES, type AppState, type Status } from './domain';
import { postOf, postSpan } from './rules';
import { addDays, dm, parseD, DOW_FULL, type ISODate } from './dates';

// Το είδος («kind») της ΔΝ του Σαββάτου και της ΔΝ της Κυριακής που μπήκε μόνη της από αυτήν (πριν 24/10 ήταν έξοδος)
export const WK = 'ΣΚ';
export const isSat = (d: ISODate) => parseD(d).getDay() === 6;
export const isWk = (s: Pick<Status, 'type' | 'kind'>) => TYPES[s.type].cat === 'out' && s.kind === WK;
// «ΔΝ ΣΚ» στα κείμενα της εφαρμογής και στο Excel· αλλιώς ΔΝ / Εξοδούχος
export const outLbl = (s: Pick<Status, 'type' | 'kind'>) => (isWk(s) ? 'ΔΝ ΣΚ' : TYPES[s.type].label);

// Παρατήρηση της μέρας δίπλα σε ό,τι γράφει η εφαρμογή: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», ή σκέτη αν δεν υπάρχει κάτι άλλο
export const withNote = (auto: string, note?: string) => { const n = (note || '').trim(); return !n ? auto : auto ? auto + ' (' + n + ')' : n; };
export const outNoteOf = (s: Pick<AppState, 'outNotes'>, d: ISODate, pid: number) => s.outNotes?.[d]?.[pid] || '';

// Άδεια (ΚΑ, τιμητική, αναρρωτική) που ξεκινά τη μέρα d ή την επόμενη: γράφεται στις παρατηρήσεις της ΔΝ, όπως η υπηρεσία
// (Michael, 24/10). «ΑΔΕΙΑ ΑΠΟ ΚΥΡΙΑΚΗ 25/10 14:00»
export const leaveStart = (s: Pick<AppState, 'statuses'>, d: ISODate, pid: number): Status | undefined => {
  const nx = addDays(d, 1);
  return s.statuses.find(x => x.pid === pid && TYPES[x.type].cat === 'abs' && !x.pending && (x.from === d || x.from === nx));
};
export const leaveText = (x: Pick<Status, 'from' | 'fromTime'>) => 'ΑΔΕΙΑ ΑΠΟ ' + DOW_FULL[parseD(x.from).getDay()] + ' ' + dm(x.from) + (x.fromTime ? ' ' + x.fromTime : '');

// Η υπηρεσία του τη μέρα d και από τι ώρα (της θέσης· η μαγειρεία και η ΤΑΕ δεν έχουν ώρα: «πρωί»)
export function dutyAt(s: AppState, d: ISODate, pid: number): { label: string; time: string } | null {
  const post = postOf(s, d, pid); if (!post) return null;
  const st = postSpan(post).start;
  const time = st == null ? '' : String(Math.floor((st % 1440) / 60)).padStart(2, '0') + ':' + String(st % 60).padStart(2, '0');
  return { label: post.label, time };
}
