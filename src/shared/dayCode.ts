// Κωδικός μέρας ενός στρατιώτη (Michael, 3/11): ένας σύντομος κωδικός για την κατάστασή του τη μέρα d, για το «Δυναμολόγιο αξιολόγησης»
// και (αργότερα) το Ημερολόγιο. Προτεραιότητα: άδεια/νοσοκομείο, ΣΤΕΠ, ιατρικό (Ε.Υ, Ε.Α…), ΑΟΠΛΟΣ· κενό = κανονικός.
// Οι κωδικοί είναι των TYPES (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, Ε.Α) ή το όνομα (δικά σου είδη άδειας/ιατρικού, ΤΙΜΗΤΙΚΗ, ΝΟΣ, ΣΤΕΠ).
import type { ISODate } from './dates';
import { TYPES, type AppState, type Person, type Status } from './domain';
import { statusesOn } from './rules';
import { statusLbl } from './ranks';
import { weaponInfo } from './weapons';
import { upper } from './text';

const NAMES: Partial<Record<string, string>> = { NOS: 'ΝΟΣ', HON: 'ΤΙΜΗΤΙΚΗ', STEP: 'ΣΤΕΠ' };
// ο κωδικός μιας κατάστασης: κωδικός του είδους, αλλιώς το όνομά του· δικό σου είδος άδειας/ιατρικού με το όνομά του
export function codeOfStatus(st: Pick<Status, 'type' | 'kind' | 'note'>, lists?: AppState['settings']['lists']): string {
  const lbl = statusLbl(st, lists); const t = TYPES[st.type];
  if (lbl !== t.label) return upper(lbl);
  return upper(NAMES[st.type] || t.code || lbl);
}
const UNARMED = new WeakMap<object, Map<string, Set<number>>>();
const unarmedOf = (s: AppState, d: ISODate): Set<number> => {
  let m = UNARMED.get(s.people); if (!m) { m = new Map(); UNARMED.set(s.people, m); }
  const k = d + '|' + (s.settings as unknown as { id?: string }).id; let u = m.get(k);
  if (!u) { u = weaponInfo(s, d).unarmed; m.set(k, u); }
  return u;
};
const RANK = (st: Status): number => (TYPES[st.type].cat === 'abs' || st.type === 'NOS' ? 0 : st.type === 'STEP' ? 1 : TYPES[st.type].cat === 'med' ? 2 : 9);
export function dayCode(s: AppState, p: Person, d: ISODate): string {
  const ss = statusesOn(s.statuses, p.id, d).filter(x => RANK(x) < 9).sort((a, b) => RANK(a) - RANK(b));
  if (ss.length) return codeOfStatus(ss[0], s.settings.lists);
  return unarmedOf(s, d).has(p.id) ? 'ΑΟΠΛΟΣ' : '';
}
