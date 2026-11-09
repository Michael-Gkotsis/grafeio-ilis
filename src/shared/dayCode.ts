// Κωδικός μέρας ενός στρατιώτη (Michael, 3/11): ένας σύντομος κωδικός για την κατάστασή του τη μέρα d, για το «Δυναμολόγιο αξιολόγησης»
// και (αργότερα) το Ημερολόγιο. Προτεραιότητα: άδεια/νοσοκομείο, ΣΤΕΠ, ιατρικό (Ε.Υ, Ε.Α…), ΑΟΠΛΟΣ· κενό = κανονικός.
// Οι κωδικοί είναι των TYPES (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, Ε.Α) ή το όνομα (δικά σου είδη άδειας/ιατρικού, Τ.Α = τιμητική, ΝΟΣ, ΣΤΕΠ).
import type { ISODate } from '../core/lib/dates';
import { TYPES, type Status } from '../core/model/status';
import type { AppState } from '../core/model/state';
import type { Person } from '../core/model/person';
import { statusesOn } from './rules';
import { live, statusLbl } from './ranks';
import { weaponInfo } from './weapons';
import { upper } from '../core/lib/text';

const NAMES: Partial<Record<string, string>> = { NOS: 'ΝΟΣ', HON: 'Τ.Α', STEP: 'ΣΤΕΠ' };
// ο κωδικός μιας κατάστασης: κωδικός του είδους, αλλιώς το όνομά του· δικό σου είδος άδειας/ιατρικού με το όνομά του
export function codeOfStatus(
  st: Pick<Status, 'type' | 'kind' | 'note'>,
  lists?: AppState['settings']['lists'],
): string {
  const lbl = statusLbl(st, lists);
  const t = TYPES[st.type];
  if (lbl !== t.label) return upper(lbl);
  return upper(NAMES[st.type] || t.code || lbl);
}
// οι άοπλοι εξαρτώνται μόνο από τα άτομα και τις Ρυθμίσεις (Σ.Ι. × υπηρεσίες): μία φορά ανά κατάσταση, όχι ανά γραμμή
const UNARMED = new WeakMap<object, WeakMap<object, Set<number>>>();
const unarmedOf = (s: AppState, d: ISODate): Set<number> => {
  let m = UNARMED.get(s.people);
  if (!m) {
    m = new WeakMap();
    UNARMED.set(s.people, m);
  }
  let u = m.get(s.settings);
  if (!u) {
    u = weaponInfo(s, d).unarmed;
    m.set(s.settings, u);
  }
  return u;
};
const RANK = (st: Status): number =>
  TYPES[st.type].cat === 'abs' || st.type === 'NOS' ? 0 : st.type === 'STEP' ? 1 : TYPES[st.type].cat === 'med' ? 2 : 9;
// η κατάσταση που κερδίζει τη μέρα d (άδεια/νοσοκομείο, ΣΤΕΠ, ιατρικό) ή undefined· το Ημερολόγιο κωλυομένων (imer.ts) τη χρησιμοποιεί χωρίς τον ΑΟΠΛΟΣ
export function dayStatus(s: AppState, p: Person, d: ISODate): Status | undefined {
  return statusesOn(live(s), p.id, d)
    .filter((x) => RANK(x) < 9)
    .sort((a, b) => RANK(a) - RANK(b))[0];
}
export function dayCode(s: AppState, p: Person, d: ISODate): string {
  const st = dayStatus(s, p, d);
  if (st) return codeOfStatus(st, s.settings.lists);
  return unarmedOf(s, d).has(p.id) ? 'ΑΟΠΛΟΣ' : '';
}
