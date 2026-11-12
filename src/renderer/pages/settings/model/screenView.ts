// Pure rules of the «Ρυθμίσεις» screen: the sub-menu, the «Υπηρεσίες και αργίες» sub-tabs and which one is open.
// Purpose: `SET_SECTIONS`, `DUTY_SUBS` and the two functions that read the `tab` and `dsub` route parameters.
// Does NOT: render anything or navigate (ui/SettingsScreen.tsx and ui/sections/DutySection.tsx do).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision Michael 13/10: «Ρυθμίσεις σαν οθόνη»: a sub-menu on the left, one section at a time. The old `settings`
//   tab opens «Μονάδα».
// @decision UX Μ4: «Υπηρεσίες και αργίες» in four parts (before, one page of 3.000 px).
// Covering test: test/settings-screen-view.test.ts, test/screens-settings-guide.test.ts.

/** The sections of the left menu: [route key, label], in the order shown. */
export const SET_SECTIONS: [string, string][] = [
  ['unit', 'Μονάδα και έντυπα'],
  ['rooms', 'Θάλαμοι και ουλαμοί'],
  ['duty', 'Υπηρεσίες και αργίες'],
  ['lists', 'Λίστες'],
  ['import', 'Εισαγωγή Δυναμολογίου'],
  ['files', 'Αρχεία Excel'],
  ['templates', 'Πρότυπα εφαρμογής'],
  ['excel', 'Γράμματα Excel'],
  ['look', 'Εμφάνιση'],
  ['clock', 'Ώρα και ζώνη ώρας'],
  ['esso', 'ΕΣΣΟ'],
  ['backup', 'Αντίγραφα ασφαλείας'],
  ['update', 'Ενημερώσεις'],
];

/** The four parts of «Υπηρεσίες και αργίες»: [route key, label]. The two «μπαίνει ή όχι» tables sit side by side. */
export const DUTY_SUBS: [string, string][] = [
  ['blocks', 'Υπηρεσίες'],
  ['si', 'Σ.Ι.'],
  ['stat', 'Καταστάσεις'],
  ['hol', 'Αργίες'],
];

/**
 * @param tab - the `tab` route parameter (may be missing or unknown)
 * @returns the section to show: a known key, `unit` for the old `settings` value, a missing one or an unknown one
 */
export const sectionOf = (tab: string | undefined): string => {
  const want = tab === 'settings' ? 'unit' : tab;
  return SET_SECTIONS.some(([k]) => k === want) ? (want as string) : 'unit';
};

/**
 * @param dsub - the `dsub` route parameter (may be missing or unknown)
 * @returns the sub-tab to show: a known key, else `blocks`
 */
export const dutySubOf = (dsub: string | undefined): string =>
  DUTY_SUBS.some(([k]) => k === dsub) ? (dsub as string) : 'blocks';
