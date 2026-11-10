// The IPC handlers of the command service: run a command, sync, daily check, undo.
//
// Purpose: `registerCommandsIpc` registers `run`, `sync`, `dayCheck` and `undo` on their contract channels.
// Does NOT: run the Excel auto-write itself or know how it works: what `undo` and `dayCheck` need from it
//   (`AutoWriteHooks`) is passed in by main.ts from `features/autowrite`, which imports this feature (its daily job
//   runs commands), so this one cannot import it back.
// Owner layer: main (architecture), `features/commands`. Imports only app/*, ipc/*, shared/* and its own service.
// Why: part of taking the command service out of main.ts (Phase 4.2). The handler bodies are unchanged.
// Covering test: test/ipc-contract.test.ts (channels); the registration order and every handler text of the whole
//   boot closure were compared old vs new once (PR description).
import { nowHM, today } from '../../../shared/dates';
import type { CmdResult } from '../../../shared/api';
import type { Command } from '../../../shared/commands';
import type { AppState } from '../../../shared/domain';
import type { ListKind } from '../../../shared/sources';
import { store } from '../../app/state';
import { handle } from '../../ipc/handle';
import { fail, reply, runCmd } from './service';

/**
 * What the handlers need from the Excel auto-write area (`features/autowrite`, which imports this feature and so
 * cannot be imported back). Each member is the function of the same name there, unchanged; main.ts passes them.
 */
export interface AutoWriteHooks {
  /** The once-a-day jobs (expiries, daily backup, day-change rewrite). */
  daily: () => void;
  /** Stops the listed kinds from being written back to Excel until the next read, with the reason shown. */
  hold: (kinds: Iterable<ListKind>, why: string) => void;
  /** The Excel list kinds whose data differs between two states. */
  kindsOf: (prev: AppState, next: AppState) => Set<ListKind>;
  /** The reason text shown when an undone Excel read puts a kind on hold. */
  HOLD_UNDO: string;
  /** Arms the auto-write after a change (`toExcel` false: forms only). */
  scheduleAuto: (prev: AppState, next: AppState, toExcel?: boolean) => void;
  /** Pushes the Excel status to the UI. */
  notify: () => void;
}

/**
 * Registers the command handlers.
 * @param answer turns a `runCmd` result into the UI answer (main.ts's `reply` wrapper).
 * @param MAIN_ONLY the settings keys the UI may not change with a command (files and folders come only from main's
 *   dialogs); `run` of a `setSettings` touching one of them is refused.
 * @param auto the auto-write functions of main.ts.
 */
export function registerCommandsIpc(
  answer: (r: ReturnType<typeof runCmd>) => CmdResult,
  MAIN_ONLY: string[],
  auto: AutoWriteHooks,
) {
  const { daily, hold, kindsOf, HOLD_UNDO, scheduleAuto, notify } = auto;
  handle('run', (_e, cmd: Command) =>
    cmd?.t === 'setSettings' && Object.keys(cmd.settings || {}).some((k) => MAIN_ONLY.includes(k))
      ? fail('Αυτή η ρύθμιση αλλάζει μόνο από τα Αρχεία Excel / τους Φακέλους')
      : answer(runCmd(cmd)),
  );
  handle('sync', () => reply(''));
  // a new day with the app open: the day's jobs now (not within 10 minutes) and only what changed
  handle('dayCheck', () => {
    daily();
    return reply('');
  });
  handle('undo', (_e, id?: number): CmdResult => {
    const last = store.lastUndoable();
    if (!last) return { ok: false, error: 'Δεν υπάρχει κάτι για αναίρεση' };
    // «Αναίρεση» from a message: only that message's action, not one made after it
    if (typeof id === 'number' && last.id !== id)
      return {
        ok: false,
        error:
          'Έγινε άλλη ενέργεια μετά από αυτή, οπότε δεν αναιρείται από εδώ. Η τελευταία ήταν: «' +
          last.text +
          '». Δες το Ιστορικό.',
      };
    try {
      const prev = store.state;
      store.transact(
        () => {
          store.revert(last.patch);
          store.markUndone(last.id, false);
        },
        true,
        () => store.markUndone(last.id, false, false),
      );
      // Undoing a read from Excel: the app goes back, the Excel file does not. Writing now would erase from the Excel
      // what was just read (or write old values back into the Δυναμολόγιο). The kinds wait for a new read.
      const fromExcel = last.source === 'excel' || last.source === 'import';
      if (fromExcel) hold(kindsOf(prev, store.state), HOLD_UNDO);
      scheduleAuto(prev, store.state, !fromExcel);
      store.addAudit(
        {
          at: nowHM(),
          day: today(),
          text: 'Αναίρεση: ' + last.text + (fromExcel ? ' (το Excel δεν άλλαξε)' : ''),
          files: [],
          source: 'app',
          undoable: false,
        },
        null,
      );
      if (fromExcel) notify();
      // the old row changed too (marked undone): the whole history
      return reply('Αναιρέθηκε: ' + last.text + (fromExcel ? '. Το Excel δεν άλλαξε.' : ''), true);
    } catch (e) {
      return fail(e);
    }
  });
}
