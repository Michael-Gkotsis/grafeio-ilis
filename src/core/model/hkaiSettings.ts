// «ΗΚΑΙ» settings: switchable sections, vehicles, and the hand-written back-page numbers.
//
// Purpose: HK_SECTIONS and the on/off logic (`hkToggle`), `HkaiSettings`, `HkVehicle`, `HkaiManual`.
// Does NOT: read Settings (settingsAccess.ts hkOn) or draw the «ΗΚΑΙ» (src/main/exports.ts, core/hkai).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: a closed section is not shown in the app and not written into the form; the lists of on/off stay in settings.
// @decision Michael 17/10: sections of the «ΗΚΑΙ» can be switched off. @decision Michael 22/10: the leaves in
//   «3. ΑΔΕΙΕΣ» are off by default (not written, but the option stays).
// Covering tests: test/hkai.test.ts, test/hkai-auto.test.ts.

/**
 * Sections of the «ΗΚΑΙ» that can be switched: [key, name, description]. Closed = not shown in the app and not written
 * in the form.
 */
export const HK_SECTIONS: [HkSection, string, string][] = [
  ['veh', 'Κατάσταση οχημάτων', 'Είδος, προβλέπονται, σε κίνηση, προς επισκευή'],
  ['acc', 'Ατυχήματα', 'Ζημιές σε οχήματα και σε άνδρες (αλλιώς μένει το Ø του εντύπου)'],
  ['grd', 'Χορηγούμενες φρουρές', 'Νυκτοφρουρές και 24ωρες από τις υπηρεσίες της μέρας'],
  ['prov', 'Προβλέπονται από τη σύνθεση', 'Ένας αριθμός ανά βαθμό, ίδιος κάθε μέρα'],
  [
    'lv',
    'Άδειες στο «3. Άδειες»: προεπιλογή για νέες μέρες',
    'Άδειες που δηλώνεις απευθείας (στρατιωτών και στελεχών), τη μέρα που ξεκινούν. Κάθε μέρα αλλάζει χωριστά από τον διακόπτη πάνω από την προεπισκόπηση· όσες μέρες έχουν βγει στο Excel κρατούν ό,τι είχαν. Οι αιτήσεις που εγκρίθηκαν μένουν μόνο στο «5. Αιτήσεις».',
  ],
];
export type HkSection = 'veh' | 'acc' | 'grd' | 'prov' | 'lv';
/**
 * Off unless switched on (hkai.on): the leaves in 3. ΑΔΕΙΕΣ (Michael, 22/10: not to be written, but the option stays).
 */
export const HK_DEFAULT_OFF: HkSection[] = ['lv'];
/** One line of the vehicle table: type, provided, in motion, in repair, damaged. */
export interface HkVehicle {
  type: string;
  prov?: number;
  kin?: number;
  maint?: number;
  dmg?: number;
}
/**
 * Settings.hkai. off/on: sections switched off/on by the user. head: the «ΗΚΑΙ» header (2 lines, top left, e.g. ΚΕΤΘ /
 * 2Η ΕΠΧΙΑ); empty = what the form has.
 */
export interface HkaiSettings {
  off?: HkSection[];
  on?: HkSection[];
  veh?: HkVehicle;
  prov?: Record<string, number>;
  head?: string[];
}
/**
 * Switches one section on or off, in the list that belongs to it (off for sections open by default, on for the others).
 */
export function hkToggle(h: HkaiSettings, k: HkSection, on: boolean): HkaiSettings {
  const key = HK_DEFAULT_OFF.includes(k) ? 'on' : 'off';
  const add = key === 'on' ? on : !on;
  const ls = (h[key] || []).filter((x) => x !== k);
  if (add) ls.push(k);
  return { ...h, [key]: ls };
}
/**
 * What the «ΗΚΑΙ» does not get from the app: numbers per rank and column, and the texts of the back page.
 * lv: 3. ΑΔΕΙΕΣ yes/no for the day (missing = the default of the Sections); set by the day's switch or when the Excel
 * is made.
 */
export interface HkaiManual {
  cells: Record<string, Record<string, number>>;
  text: Record<string, string>;
  lv?: boolean;
}
