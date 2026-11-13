// The two link labels of the «Ώρες» tab that point into «Ρυθμίσεις».
// Purpose: the label texts, kept out of the markup file so the source-reading test of «Ρυθμίσεις › …» in notes sees links.
// Does NOT: link anywhere (ui/HoursTab.tsx wraps them in a GoLink).
// Owner layer: renderer/pages/guard. Why: Phase 6; the Greek texts are the old ones, character for character.
// Covering test: test/ux-names.test.ts.

/** Link to the services setting, long form (the shift hours note). */
export const LINK_BLOCKS_LONG = 'Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες';

/** Link to the services setting, short form (the weapon margin note). */
export const LINK_BLOCKS = 'Ρυθμίσεις › Υπηρεσίες';
