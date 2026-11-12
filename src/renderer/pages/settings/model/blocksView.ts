// Pure rules of the «Υπηρεσίες» card: the form being shown, the texts of each service row and its tooltips.
// Purpose: `blocksView` helpers for `useBlocks`, `BlocksCard` and their test.
// Does NOT: render anything, touch React or call `run` (model/useBlocks.ts and the card do).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision Michael 20/10: a service is active or not; Michael 22/10: services per form (ΣΒΕΝ, ΣΠΕΝ, own forms from a
//   list); Κ-Υ1: armed or unarmed.
// Covering test: test/settings-blocks-view.test.ts.
import { blockShape, phaseList, type BlockDef, type Phase, type Settings } from '../../../../shared/domain';

/** The form the card shows: the picked one, or the first when the picked one was deleted. */
export function currentPhase(settings: Settings, pick: Phase) {
  const phases = phaseList(settings);
  return phases.find((x) => x.id === pick) || phases[0];
}

/** The posts the row counts (the hidden ones are not shown). */
export const shownPosts = (b: BlockDef): BlockDef['posts'] => b.posts.filter((x) => !x.hidden);

/** «θέση» or «θέσεις» for the count. */
export const postsWord = (n: number): string => (n === 1 ? 'θέση' : 'θέσεις');

/** « (3 νούμερα × 2)» for a post with several numbers, else nothing. */
export const shapeText = (b: BlockDef): string =>
  blockShape(b).per > 1 ? ' (' + blockShape(b).nums + ' νούμερα × ' + blockShape(b).per + ')' : '';

/** «ανενεργή», «ένοπλη» or «άοπλη». */
export const stateWord = (b: BlockDef): string => (b.hidden ? 'ανενεργή' : b.armed ? 'ένοπλη' : 'άοπλη');

/** The codes of the shown posts; «?» for a post without one. */
export const codesText = (ps: BlockDef['posts']): string => ps.map((x) => x.code || '?').join(', ');

/** Whether the service is a Λ/Υ or Δ/Υ block, which is always active (the ΗΚΑΙ needs them). */
export const isLy = (b: BlockDef): boolean => b.kind === 'ly';

/** The tooltip of the «Ενεργή» checkbox. */
export const activeTip = (b: BlockDef): string =>
  isLy(b)
    ? 'Ο Λ/Υ και ο Δ/Υ μένουν πάντα ενεργοί (χρειάζονται στην ΗΚΑΙ)'
    : b.hidden
      ? 'Ανενεργή: δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο. Οι υπηρεσίες που έγιναν ' +
        'μένουν στον έλεγχο υπηρεσιών. Τσέκαρε για να ξαναμπεί.'
      : 'Ξετσέκαρε για να μη μπαίνει πια στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο, χωρίς να σβηστεί. ' +
        'Οι υπηρεσίες που έγιναν μένουν στον έλεγχο υπηρεσιών.';

/** The tooltip of the «Ένοπλη» checkbox (none for a Λ/Υ block). */
export const armedTip = (b: BlockDef): string | undefined =>
  isLy(b) ? undefined : 'Σε ένοπλη θέση δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ, ούτε οι άοπλοι (Σ.Ι.)';

/** The tooltip of the weapon select. */
export const WEAPON_TIP =
  'Δικό του: κάθε άτομο βγάζει το δικό του όπλο στο νούμερό του. Της θέσης: βγαίνει το όπλο του 1ου νούμερου και ' +
  'περνά από χέρι σε χέρι στις αλλαγές· τα όπλα των άλλων μένουν ΕΝΤΟΣ.';
