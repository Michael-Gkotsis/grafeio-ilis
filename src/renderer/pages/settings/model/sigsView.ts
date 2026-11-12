// Pure rules of the «Υπογραφές» card and its «Σελίδα 2 (ΔΥΝΑΜΗ)» part: labels, notes, layout patches and save plans.
// Purpose: `sigsView` helpers for `useSigs`, `useOutsSig2` and their test; every save is a `{ patch, text }` pair, so
//   the hooks only run it.
// Does NOT: render anything, touch React or call `run` (the hooks do).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision Michael 20/10: any number of signatures per form, left to right; they also change at the moment the form is
//   made («Υπογραφές…» next to «Βγάλε το Excel»). @decision Michael 22/10: on all forms and the app's own Excel files.
// @decision Michael 31/10: Εξοδούχοι «Όλη η δύναμη», page 2 (ΔΥΝΑΜΗ) has the same signatures as page 1, none, or its
//   own.
// Covering test: test/settings-sigs-view.test.ts.
import type { Settings } from '../../../../shared/domain';
import { dropSigMoves, moved, type Layout, type LayoutForm } from '../../../../shared/layout';
import {
  MADE_FORMS,
  OUTS_SIG2,
  SIG_FORMS,
  sameSigs,
  sigLabel,
  sigsClean,
  sigsSaved,
  type OutsSig2,
  type Sig,
  type SigForm,
} from '../../../../shared/sigs';
import { HK } from '../../../../shared/unit';

/** The unsaved signature lists, per form; a form that was not touched has no key. */
export type SigEdits = Partial<Record<SigForm, Sig[]>>;

/** What a save writes: the `settings` patch and the history text. */
export interface SavePlan {
  patch: Partial<Settings>;
  text: string;
}

/** The name of a form in the select and in the texts («ΗΚΑΙ», «ΦΡΟΥΡΑ ΣΒΕΝ»...). */
export const sigLabelOf = (f: SigForm): string => sigLabel(f, HK());

/** The form whose paper layout can be moved; the «Έντυπα» (reports) have none, they are made from templates. */
export const layoutFormOf = (form: SigForm): LayoutForm | null => (form === 'reports' ? null : (form as LayoutForm));

/** The tail of the card's note, which depends on where the signatures go. */
export const sigsNoteTail = (form: SigForm): string =>
  form === 'reports'
    ? ' Στα Έντυπα μπαίνουν όπου έχει {ΥΠΟΓΡΑΦΕΣ} ή υπογραφές του προτύπου (αλλιώς κάτω από τον πίνακα), ' +
      'εκτός αν το έντυπο έχει δικές του.'
    : MADE_FORMS.includes(form)
      ? ' Αρχικά καμία. Μπαίνουν μία γραμμή κάτω από κάθε φύλλο, μοιρασμένες στο πλάτος του. Για μία φορά μόνο: ' +
        '«Υπογραφές…» δίπλα στο «Βγάλε το Excel».'
      : ' Για μία φορά μόνο: «Υπογραφές…» δίπλα στο «Βγάλε το Excel».';

/** The sentence about page 2, by mode. */
export const page2Sentence = (mode: OutsSig2): string =>
  mode === 'same'
    ? 'Η σελίδα 2 έχει τις ίδιες.'
    : mode === 'none'
      ? 'Η σελίδα 2 βγαίνει χωρίς υπογραφές.'
      : 'Η σελίδα 2 έχει τη δική της λίστα, εδώ κάτω.';

/** The history text of a page-2 mode change. */
export const page2PickText = (v: OutsSig2): string =>
  'υπογραφές εξοδούχων, σελίδα 2: ' + OUTS_SIG2.find((x) => x[0] === v)![1];

/**
 * A different number of signatures: the places the user dragged them to no longer fit, so they are dropped.
 * @param savedCount - how many signatures the form has now
 * @returns `{ layout }` for the `settings` patch, or `{}` when nothing changes
 */
export const layoutFor = (
  settings: Settings,
  lf: LayoutForm | null,
  n: number,
  savedCount: number,
): { layout?: Settings['layout'] } =>
  lf && n !== savedCount && settings.layout?.[lf]
    ? { layout: { ...settings.layout, [lf]: dropSigMoves(settings.layout[lf]) } }
    : {};

/** The layout map with `l` stored for `lf` (or the form's entry removed when `l` is `undefined`). */
export const layoutWith = (
  settings: Settings,
  lf: LayoutForm,
  l: Layout | undefined,
): NonNullable<Settings['layout']> => {
  const all = { ...(settings.layout || {}) };
  if (l) all[lf] = l;
  else delete all[lf];
  return all;
};

/** True when the user has moved something on the paper of this form (the «•» of «Θέσεις στο χαρτί…»). */
export const movedAny = (settings: Settings, lf: LayoutForm | null): boolean =>
  !!lf && Object.values(settings.layout?.[lf] || {}).some((ms) => Object.values(ms).some(moved));

/** True when `edit` has an unsaved list for `f` that differs from the saved one. */
export const isEdited = (edit: SigEdits, settings: Settings, f: SigForm): boolean =>
  !!edit[f] && !sameSigs(edit[f]!, sigsSaved(settings, f));

/** The forms with unsaved changes, also those not shown now: the «Δεν αποθηκεύτηκαν» bar and the leave question. */
export const dirtyFormsOf = (edit: SigEdits, settings: Settings): SigForm[] =>
  SIG_FORMS.filter((f) => isEdited(edit, settings, f));

/** The option text of the form select: the name, and «•» when it has unsaved changes. */
export const formOptionText = (edit: SigEdits, settings: Settings, f: SigForm): string =>
  sigLabelOf(f) + (isEdited(edit, settings, f) ? ' •' : '');

/** Save every dirty form at once; a form whose signature count changed loses its dragged places. */
export function saveFormsPlan(edit: SigEdits, dirty: SigForm[], settings: Settings): SavePlan {
  const sigs = { ...(settings.sigs || {}) };
  let layout = settings.layout;
  for (const f of dirty) {
    const v = sigsClean(edit[f]!);
    sigs[f] = v;
    const l = layoutFormOf(f);
    if (l && layout?.[l] && v.length !== sigsSaved(settings, f).length)
      layout = { ...layout, [l]: dropSigMoves(layout[l]!) };
  }
  return {
    patch: { sigs, ...(layout !== settings.layout ? { layout } : {}) },
    text: 'υπογραφές ' + dirty.map(sigLabelOf).join(', '),
  };
}
