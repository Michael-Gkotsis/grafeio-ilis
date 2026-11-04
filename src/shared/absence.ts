// ΑΠΩΝ, ΑΙΤΙΑ ΑΠΟΥΣΙΑΣ, ΗΜ/ΝΙΑ ΕΠΙΣΤΡΟΦΗΣ ενός στρατιώτη ή στελέχους για μια μέρα (Έντυπα, Δυναμολόγιο-Παρουσιολόγιο στελεχών).
// Απών = άδεια, νοσοκομείο, ΣΤΕΠ ή δηλωμένος κωλυόμενος (όπως οι απόντες και οι κωλυόμενοι της Δύναμης)· οι έξοδοι (εξοδούχος, ΔΝ) δεν μετρούν.
// Επιστροφή: η μέρα μετά το «Έως», ή το ίδιο το «Έως» αν η κατάσταση έχει ώρα επιστροφής· χωρίς λήξη = κενό.
import { addDays, type ISODate } from './dates';
import { TYPES, type AppState, type Cadre, type Person, type Status } from './domain';
import { cadreAbsOn, statusesOn } from './rules';
import { live, isAway, leaveMode, statusLbl } from './ranks';
import { cadreStatusOf } from './cadre';
import { upper } from './text';

export interface Absence { absent: boolean; reason: string; ret: ISODate | '' }
const NONE: Absence = { absent: false, reason: '', ret: '' };
const isAbsent = (st: Status, lists?: AppState['settings']['lists']): boolean => {
  const t = TYPES[st.type]; if (t.cat === 'out') return false;
  return isAway(st, lists) || st.type === 'KOL' || st.type === 'STEP' || (st.type === 'LEAVE' && leaveMode(st, lists) === 'kol');
};
// ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ, ΑΝΑΡΡΩΤΙΚΗ ΑΔΕΙΑ, ΕΙΣΑΓΩΓΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ… (δικό σου είδος άδειας: το όνομά του)
export function reasonOf(st: Pick<Status, 'type' | 'kind' | 'note'>, lists?: AppState['settings']['lists']): string {
  const lbl = statusLbl(st, lists); const t = TYPES[st.type];
  if (st.type === 'KOL') return upper(st.note?.trim() || t.long);
  return upper(lbl !== t.label ? lbl : t.long);
}
export function absenceOfPerson(s: AppState, p: Person, d: ISODate): Absence {
  const lists = s.settings.lists;
  const st = statusesOn(live(s), p.id, d).filter(x => isAbsent(x, lists)).sort((a, b) => Number(isAway(b, lists)) - Number(isAway(a, lists)))[0];
  if (!st) return NONE;
  const timed = !!st.toTime && !st.open;
  return { absent: true, reason: reasonOf(st, lists), ret: st.open ? '' : timed ? st.to : addDays(st.to, 1) };
}
export function absenceOfCadre(s: AppState, c: Cadre, d: ISODate): Absence {
  const a = cadreAbsOn(s, c.id, d); if (!a) return NONE;
  // μόνο ό,τι τον βγάζει απόντα ή κωλυόμενο στην ΗΚΑΙ· είδος χωρίς στήλη ΗΚΑΙ («Πουθενά») = παρών
  const st = cadreStatusOf(a, s.settings.lists); if (st.group === 'list') return NONE;
  return { absent: true, reason: upper(st.label), ret: addDays(a.to, 1) };
}
