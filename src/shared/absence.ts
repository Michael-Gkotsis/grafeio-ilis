// ΑΠΩΝ, ΑΙΤΙΑ ΑΠΟΥΣΙΑΣ, ΗΜ/ΝΙΑ ΕΠΙΣΤΡΟΦΗΣ ενός στρατιώτη ή στελέχους για μια μέρα (Έντυπα, Δυναμολόγιο-Παρουσιολόγιο στελεχών).
// Απών = άδεια, νοσοκομείο, ΣΤΕΠ ή δηλωμένος κωλυόμενος (όπως οι απόντες και οι κωλυόμενοι της Δύναμης)· οι έξοδοι (εξοδούχος, ΔΝ) δεν μετρούν.
// Επιστροφή: η μέρα μετά το «Έως», ή το ίδιο το «Έως» αν η κατάσταση έχει ώρα επιστροφής· χωρίς λήξη = κενό.
import { addDays, type ISODate } from './dates';
import { TYPES, type AppState, type Cadre, type Person, type Status } from './domain';
import { dutyColsOn, hasSvcAway, hkMin, statusesAt, statusesOn, svcAwayOf, SVC_AWAY_LBL } from './rules';
import { live, isAway, leaveMode, statusLbl } from './ranks';
import { cadreStateOn } from './cadre';
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
// υπηρεσία εκτός στρατοπέδου (BlockDef.hkCol σε στήλη απόντων): η Δύναμη τον μετρά απόντα, άρα και η στήλη ΑΠΩΝ (ίδιο svcAwayOf με το strengthOf)
const dmapIdx = new WeakMap<object, { st: AppState['settings']; m: Map<ISODate, ReturnType<typeof dutyColsOn>> }>();
function svcDutyCols(s: AppState, d: ISODate) {
  let e = dmapIdx.get(s.guards); if (!e || e.st !== s.settings) { e = { st: s.settings, m: new Map() }; dmapIdx.set(s.guards, e); }
  let m = e.m.get(d); if (!m) { m = dutyColsOn(s, d); e.m.set(d, m); }
  return m;
}
export function absenceOfPerson(s: AppState, p: Person, d: ISODate): Absence {
  const lists = s.settings.lists;
  const st = statusesOn(live(s), p.id, d).filter(x => isAbsent(x, lists)).sort((a, b) => Number(isAway(b, lists)) - Number(isAway(a, lists)))[0];
  if (!st) {
    if (!hasSvcAway(s.settings)) return NONE;
    const at = hkMin(s.rules);
    return svcAwayOf(s, statusesAt(s, p.id, d, at), svcDutyCols(s, d).get(p.id), d, at) ? { absent: true, reason: upper(SVC_AWAY_LBL), ret: '' } : NONE;
  }
  const timed = !!st.toTime && !st.open;
  return { absent: true, reason: reasonOf(st, lists), ret: st.open ? '' : timed ? st.to : addDays(st.to, 1) };
}
export function absenceOfCadre(s: AppState, c: Cadre, d: ISODate): Absence {
  // μόνο ό,τι τον βγάζει απόντα ή κωλυόμενο στην ΗΚΑΙ· είδος χωρίς στήλη ΗΚΑΙ («Πουθενά») = παρών· και η υπηρεσία του προγράμματος στελεχών με στήλη
  const st = cadreStateOn(s, c.id, d); if (!st || st.group === 'list') return NONE;
  return { absent: true, reason: upper(st.label), ret: st.roster ? '' : addDays(st.abs.to, 1) };
}
