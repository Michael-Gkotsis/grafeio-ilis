// Έλεγχος υπηρεσιών ΑΛΛΗΣ μονάδας: το προφίλ (settings.tplProfiles, kind 'duties') λέει τι σημαίνει κάθε κωδικός του αρχείου της.
// Εδώ γίνεται ο «μεταφραστής» για την ανάγνωση και την εγγραφή: από το προφίλ βγαίνουν δύο πίνακες που μπαίνουν σε ΑΝΤΙΓΡΑΦΟ
// των ρυθμίσεων μόνο για τον υπολογισμό (Settings.unitCodes / unitOut, δεν αποθηκεύονται ποτέ). Έτσι διαβάζει και γράφει ο ίδιος
// κώδικας (planDuties, planDutiesWrite) που διαβάζει και γράφει το δικό μας αρχείο, και το δικό μας αρχείο δεν αλλάζει καθόλου:
// χωρίς b.unit επιστρέφονται τα ίδια αντικείμενα. Χωρίς imports από το lexicon (το sources.ts το φορτώνει).
import { codeKey, type AppState, type Settings } from './domain';
import { profilesOf, type DutyMeaning, type DutyProfile, type TplProfile } from './tplStore';

export const DUTY_PROFILE_ID = 'duties-1';
export const dutyProfileOf = (settings: Pick<Settings, 'tplProfiles'> | undefined): TplProfile | null => profilesOf(settings).find(p => p.kind === 'duties') ?? null;

// Η τιμή στο unitCodes: θέση | «kind:<είδος>» | «abs» (κατάσταση, όχι υπηρεσία) | «ignore»
export const aliasOf = (m: DutyMeaning): string => (m.t === 'seat' ? m.k : m.t === 'kind' ? 'kind:' + m.kind : m.t === 'status' ? 'abs' : 'ignore');
export const codesOf = (d: DutyProfile | undefined): Record<string, string> => Object.fromEntries(Object.entries(d?.codes || {}).map(([k, m]) => [k, aliasOf(m)]));
// Ανάποδα: ποιον κωδικό γράφει η μονάδα για κάθε θέση / είδος (ο πρώτος που έχει οριστεί)
export function outOf(d: DutyProfile | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of Object.values(d?.codes || {})) {
    if (m.t === 'seat' && !(m.k in out)) out[m.k] = m.text;
    else if (m.t === 'kind' && !(('kind:' + m.kind) in out)) out['kind:' + m.kind] = m.text;
  }
  return out;
}
// Οι ρυθμίσεις για τον υπολογισμό ενός πλέγματος άλλης μονάδας (ίδιο αντικείμενο όταν δεν είναι τέτοιο)
export function unitSettings(settings: Settings, b?: { unit?: boolean }): Settings {
  if (!b?.unit) return settings;
  const d = dutyProfileOf(settings)?.duty;
  return { ...settings, unitCodes: codesOf(d), unitOut: outOf(d) };
}
export function withUnit(s: AppState, b?: { unit?: boolean }): AppState {
  if (!b?.unit) return s;
  return { ...s, settings: unitSettings(s.settings, b) };
}
export { codeKey };
