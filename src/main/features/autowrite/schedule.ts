// What a change makes dirty, when the auto-write is armed, and when a kind must not be written by itself.
//
// Purpose: `kindsOf` (which Excel list kinds a change touches), `scheduleAuto` (mark them and the forms dirty, arm the
//   1.2 s timer), `hold` / `holdAll` (stop writing a kind until the next read) with their two reason texts.
// Does NOT: write anything (run.ts, sync.ts), know the commands (the commands feature calls these through hooks, see
//   `onCommandApplied`), or read the files.
// Owner layer: main (architecture), `features/autowrite`. Imports app/*, shared/*, `sources`, `run.ts`.
// Why: moved verbatim from main.ts (Phase 4.3a). The 1.2 s debounce and the order of the marks are what users rely on
//   to get their last change into Excel; the 4.2a hooks still call these from outside.
// Covering test: test/sources*.test.ts (`kindsForPeople`, `holdPatch`); the Electron auto-write comparison in the PR
//   description; `npm run bench:golden`.
import { totalsTouched } from '../../../shared/totals';
import type { AppState } from '../../../shared/domain';
import { KINDS, STATUS_KINDS, capExtras, kindsForPeople, type ListKind } from '../../../shared/sources';
import { holdPatch } from '../../sources';
import { bindingOf, srcMeta } from '../../app/bindings';
import { autoTimer, dirty, formsDirty, setAutoTimer, setFormsDirty, setRepDirty } from '../../app/state';
import { autoReps, runAuto } from './run';

// Which kinds a change concerns: whatever changes in the people (rank, room, post...) is written to the sheets that
// have a column for it
const capSig = (st: AppState['settings']) =>
  capExtras(st)
    .map((x) => x.key + '=' + x.head)
    .join('|');

/**
 * The Excel list kinds whose data differs between two states.
 * @returns a new set; empty when nothing that is written to Excel changed.
 */
export function kindsOf(prev: AppState, next: AppState): Set<ListKind> {
  const out = new Set<ListKind>();
  if (prev.people !== next.people)
    for (const k of kindsForPeople(prev.people, next.people, next.settings.sources || {})) out.add(k);
  if (prev.statuses !== next.statuses) for (const k of STATUS_KINDS) out.add(k);
  // totals under the ΣΥΝΟΛΙΚΟ (ΣΤΕΠ, sick leave, leave, hospital): written with the Δυναμολόγιο
  if (totalsTouched(prev.statuses, next.statuses)) out.add('people');
  // and a new (or active again) own duty: it gets its own column in the capabilities sheet (capExtraCols)
  if (prev.caps !== next.caps || (prev.settings !== next.settings && capSig(prev.settings) !== capSig(next.settings)))
    out.add('caps');
  if (prev.guards !== next.guards || prev.dutyLog !== next.dutyLog) out.add('duties');
  // cadres: their data and their statuses (which also hold their names) are written to their own Excel
  if (prev.cadreList !== next.cadreList) {
    out.add('cadres');
    out.add('cadreAbs');
  }
  if (prev.cadreAbs !== next.cadreAbs) out.add('cadreAbs');
  return out;
}

/**
 * Marks what a change makes dirty and arms the auto-write timer (1.2 s after the last change).
 * @param toExcel false: only the forms (e.g. after undoing a read from Excel, which must not write back to Excel)
 */
export function scheduleAuto(prev: AppState, next: AppState, toExcel = true) {
  if (prev === next) return;
  if (toExcel) for (const k of kindsOf(prev, next)) dirty.add(k);
  // the forms use neither capabilities nor «βγήκε στις…»: without other changes they are not made again
  if (
    (Object.keys(next) as (keyof AppState)[]).some(
      (k) =>
        k !== 'printed' &&
        k !== 'caps' &&
        k !== 'lastExpire' &&
        k !== 'notes' &&
        k !== 'imer' &&
        k !== 'hd' &&
        prev[k] !== next[k],
    )
  ) {
    setFormsDirty(true);
    if (autoReps().length) setRepDirty(true);
  }
  if (!dirty.size && !formsDirty) return;
  clearTimeout(autoTimer);
  setAutoTimer(setTimeout(runAuto, 1200));
}

// Kinds that are not written by themselves until a new read or «Ενημέρωση Excel»: the Excel knows things the app lost
/** Reason shown when an undone Excel read puts a kind on hold. */
export const HOLD_UNDO =
  'Αναιρέθηκε μια ανάγνωση από αυτό το Excel και το Excel δεν άλλαξε. Η εφαρμογή δεν γράφει εδώ μόνη της μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel» (με προεπισκόπηση).';
/** Reason shown when a restore from a backup puts a kind on hold (the Excel may be newer). */
export const HOLD_RESTORE =
  'Έγινε επαναφορά της βάσης από αντίγραφο, οπότε το Excel μπορεί να έχει νεότερα στοιχεία. Η εφαρμογή δεν γράφει εδώ μόνη της μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel» (με προεπισκόπηση).';

/**
 * Stops the listed kinds from being written back by themselves (only those with a file that was synced before).
 * @param why the text shown to the user
 */
export function hold(kinds: Iterable<ListKind>, why: string) {
  for (const k of kinds) {
    if (!bindingOf(k) || !srcMeta.get(k)?.at) continue;
    dirty.delete(k);
    srcMeta.set(k, holdPatch(k, why));
  }
}

/** `hold` for every list kind. */
export const holdAll = (why: string) =>
  hold(
    KINDS.map((k) => k.id),
    why,
  );
