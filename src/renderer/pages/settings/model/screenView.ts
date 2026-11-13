// Pure rules of the «Ρυθμίσεις» screen: the 7 groups, their sections, the «Υπηρεσίες και αργίες» sub-tabs, what is open.
// Purpose: `SET_GROUPS`, `SET_SECTIONS`, `DUTY_SUBS` and the functions that read the `tab` and `dsub` route parameters.
// Does NOT: render anything or navigate (ui/SettingsScreen.tsx and ui/sections/DutySection.tsx do).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision Michael 13/10: «Ρυθμίσεις σαν οθόνη»: a sub-menu on the left, one section at a time. The old `settings`
//   tab opens «Μονάδα».
// @decision Michael 12/11 (U11c): the overview `home` is the section of a missing `tab`.
// @decision UX Μ4: «Υπηρεσίες και αργίες» in four parts (before, one page of 3.000 px).
// Covering test: test/settings-screen-view.test.ts, test/screens-settings-guide.test.ts.

/** One group of the left menu: its office name and the sections shown as tabs inside it (route keys, in order). */
export interface SetGroup {
  key: string;
  label: string;
  sections: string[];
}

/**
 * The seven groups of the left menu, in the order shown (brief U11a, checklist §16).
 * @decision Michael 12/11: «Ρυθμίσεις σε 7 ομάδες»: the route keeps `tab` = a section key, the group is derived.
 */
export const SET_GROUPS: SetGroup[] = [
  { key: 'me', label: 'Η μονάδα μου', sections: ['unit', 'brand', 'rooms', 'esso'] },
  { key: 'duty', label: 'Υπηρεσίες', sections: ['duty'] },
  { key: 'outs', label: 'Έξοδοι και ΗΚΑΙ', sections: ['hkrows'] },
  { key: 'lists', label: 'Λίστες και κωδικοί', sections: ['lists'] },
  { key: 'files', label: 'Αρχεία Excel', sections: ['import', 'files', 'templates', 'excel'] },
  { key: 'paper', label: 'Χαρτιά: υπογραφές και θέσεις', sections: ['sigs'] },
  { key: 'pc', label: 'Αυτό το PC', sections: ['look', 'clock', 'backup', 'update'] },
];

/** The overview page: the section shown when no `tab` is given. It belongs to no group and is not in `SET_SECTIONS`. */
export const HOME_SECTION = 'home';

const SECTION_LABELS: Record<string, string> = {
  [HOME_SECTION]: 'Όλες οι ρυθμίσεις',
  unit: 'Μονάδα και έντυπα',
  brand: 'Τίτλος και λογότυπο',
  rooms: 'Θάλαμοι και ουλαμοί',
  esso: 'ΕΣΣΟ',
  duty: 'Υπηρεσίες και αργίες',
  hkrows: 'Γραμμές και ονόματα ΗΚΑΙ',
  lists: 'Λίστες',
  import: 'Εισαγωγή Δυναμολογίου',
  files: 'Αρχεία Excel',
  templates: 'Πρότυπα εφαρμογής',
  excel: 'Γράμματα Excel',
  sigs: 'Υπογραφές',
  look: 'Εμφάνιση',
  clock: 'Ώρα και ζώνη ώρας',
  backup: 'Αντίγραφα ασφαλείας',
  update: 'Ενημερώσεις',
};

/** Every section of the screen: [route key, label], group by group (the old keys keep their labels). */
export const SET_SECTIONS: [string, string][] = SET_GROUPS.flatMap((group) =>
  group.sections.map((key): [string, string] => [key, SECTION_LABELS[key] as string]),
);

/** The four parts of «Υπηρεσίες και αργίες»: [route key, label]. The two «μπαίνει ή όχι» tables sit side by side. */
export const DUTY_SUBS: [string, string][] = [
  ['blocks', 'Υπηρεσίες'],
  ['si', 'Σ.Ι.'],
  ['stat', 'Καταστάσεις'],
  ['hol', 'Αργίες'],
];

/**
 * @param tab - the `tab` route parameter (may be missing or unknown)
 * @returns the section to show: a known key (or `home`), `unit` for the old `settings` value, and `home` (the
 *   overview) for a missing or an unknown one
 * @decision Michael 12/11 (U11c): a fresh open of «Ρυθμίσεις» lands on the overview (before: «Μονάδα»).
 */
export const sectionOf = (tab: string | undefined): string => {
  const want = tab === 'settings' ? 'unit' : tab;
  return want === HOME_SECTION || SET_SECTIONS.some(([k]) => k === want) ? (want as string) : HOME_SECTION;
};

/** One line of what is inside each group, in office words, for the card of the overview (key = `SetGroup.key`). */
const GROUP_SUMMARIES: Record<string, string> = {
  me: 'Ίλη ή λόχος, κεφαλίδα, τόπος, τίτλος και λογότυπο, ΕΣΣΟ, θάλαμοι και ουλαμοί, στελέχη ανά βαθμό',
  duty: 'Έντυπα υπηρεσιών (ΣΒΕΝ/ΣΠΕΝ), θέσεις και ώρες, κανόνες και σειρά, μόνιμοι Λ/Υ-Δ/Υ, Σ.Ι., αργίες',
  outs: 'Ώρες εξόδου ανά μέρα, θάλαμοι ΣΚ, ώρα ΗΚΑΙ, ενότητες και γραμμές ΗΚΑΙ, μορφή Εξοδούχων',
  lists: 'Βαθμοί, Ο/Σ, είδη άδειας και ιατρικών (κείμενο στην ΗΚΑΙ, μόνο σημείωση), κωδικοί ημερολογίου',
  files: 'Εισαγωγή Δυναμολογίου, ποια Excel κρατά ενημερωμένα, φάκελοι, templates, γράμματα Excel',
  paper: 'Ποιος υπογράφει κάθε χαρτί, πού μπαίνουν στη σελίδα, πρότυπο Word Ημερήσιας Διαταγής',
  pc: 'Εμφάνιση, μέγεθος, μενού, ώρα και ζώνη ώρας, αντίγραφα ασφαλείας, ενημερώσεις, διάγνωση',
};

/** @returns the one-line text of a group card (empty for an unknown key); the count is `groupCount` in settingsIndex */
export const groupSummary = (group: string): string => GROUP_SUMMARIES[group] ?? '';

/** @returns the label of a section key (empty for an unknown key) */
export const sectionLabel = (section: string): string => SECTION_LABELS[section] ?? '';

/**
 * @param section - a section key as `sectionOf` returns it
 * @returns the group that holds the section (the first group for a key that is in none)
 */
export const groupOf = (section: string): SetGroup =>
  SET_GROUPS.find((group) => group.sections.includes(section)) ?? (SET_GROUPS[0] as SetGroup);

/**
 * @param dsub - the `dsub` route parameter (may be missing or unknown)
 * @returns the sub-tab to show: a known key, else `blocks`
 */
export const dutySubOf = (dsub: string | undefined): string =>
  DUTY_SUBS.some(([k]) => k === dsub) ? (dsub as string) : 'blocks';
