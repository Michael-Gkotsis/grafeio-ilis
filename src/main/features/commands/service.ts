// Runs one command against the open database and answers the renderer with only what changed.
//
// Purpose: `ctx` (the clock and id source a command runs with), `runCmd` (apply a command, write it and its audit
//   rows in one database transaction), and the answers built from it: `snapshot` (first full state), `reply`
//   (changed fields + new audit rows), `fail`.
// Does NOT: write any Excel file itself or know how that is scheduled (a hook installed by main.ts does, see
//   `onCommandApplied`); register IPC handlers (ipc.ts); run the daily jobs (they drive the auto-write and stay in
//   main.ts).
// Owner layer: main (architecture), `features/commands`. Imports only app/*, shared/* and core/*, never main.ts.
// Why: every other area of main (exports, sources, reports, ESSO, backups) runs commands and answers the UI through
//   these functions, so they are the first slice taken out of the 3700-line main.ts (Phase 4.2).
// Covering test: test/architecture.test.ts (layers, no cycle); behaviour of the commands themselves is covered by
//   test/commands*.test.ts, and the end-to-end boot/outputs by `npm run bench:golden` and `npm run bench:full`.
import crypto from 'crypto';
import { apply, type Command } from '../../../shared/commands';
import { nowHM, today } from '../../../shared/dates';
import type { CmdResult } from '../../../shared/api';
import type { AppState, AuditEntry } from '../../../shared/domain';
import { HISTORY_AMBIENT, applyAmbient } from '../../../core/ambient';
import { store } from '../../app/state';

/** What the command rules need from the outside: the local date (`ISODate`) and a fresh unique id. */
export const ctx = () => ({ today: today(), newId: () => crypto.randomUUID() });

/** Called after a command that changed the state: previous and new state. Installed once by main.ts at load. */
type AppliedHook = (prev: AppState, next: AppState) => void;
let applied: AppliedHook = () => {
  throw new Error('onCommandApplied was not installed'); // loud on purpose: a silent skip would drop the auto-write
};

/**
 * Installs the function that runs after every command that changed the state (main.ts: the Excel auto-write
 * scheduling, `scheduleAuto`). It lives in main.ts because the auto-write belongs to the Excel sources area, which
 * this module may not import; main.ts installs it once while it loads, before any command can run.
 * @decision Phase 4.2a: a hook instead of an import, so the feature never imports main.ts (no cycle).
 */
export function onCommandApplied(fn: AppliedHook): void {
  applied = fn;
}

// What the UI already has: the state and the newest audit row that were sent to it. Commands do not mutate objects,
// they build new ones, so whatever has the same reference as before did not change and is not sent again.
let sent: AppState | null = null,
  sentAudit = 0;

/**
 * The full state and audit list for the UI's first load (`boot`); it also becomes the baseline of later `reply` calls.
 * @returns the live state object (not a copy) and every audit row, newest first.
 */
export function snapshot(): { state: AppState; audit: AuditEntry[] } {
  const audit = store.audit();
  sent = store.state;
  sentAudit = Math.max(sentAudit, audit[0]?.id || 0);
  return { state: store.state, audit };
}

/**
 * The answer to the UI after a change: only the state fields whose reference differs from what was sent last, plus
 * the audit rows newer than the last sent one (up to 300).
 * @param text the message for the user (Greek), echoed back.
 * @param fullAudit true when old audit rows changed too (undo marks a row undone): sends the whole history.
 */
export function reply(text: string, fullAudit = false): CmdResult {
  const s = store.state;
  const changes: Partial<AppState> = {};
  for (const k of Object.keys(s) as (keyof AppState)[])
    if (!sent || s[k] !== sent[k]) (changes as Record<string, unknown>)[k] = s[k];
  sent = s;
  const newAudit = fullAudit ? [] : store.audit(300, sentAudit);
  const audit = fullAudit ? store.audit() : undefined;
  sentAudit = Math.max(sentAudit, (audit || newAudit)[0]?.id || 0);
  return { ok: true, changes, newAudit, audit, text };
}

/** Turns a thrown value into the `{ ok: false, error }` the UI shows. */
export const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

// Runs a command and writes it. Whatever changed reaches the UI with the next reply() (also what changed without it,
// e.g. expiries)
/**
 * Applies a command to the database state and records its audit rows, then lets main.ts schedule the Excel write.
 * Never throws: a failure (including a rolled-back write) comes back as `{ ok: false, error }`.
 * @returns the command's message for the user (Greek) on success.
 */
export function runCmd(cmd: Command): { ok: true; text: string } | { ok: false; error: string } {
  try {
    const prev = store.state;
    applyAmbient(prev, HISTORY_AMBIENT); // ΗΚΑΙ or ΗΚΑΛ in the history texts
    const r = apply(store.state, cmd, ctx());
    const changed = r.state !== store.state;
    // one database write to disk per action, not one per history row; if it is not written, everything rolls back
    store.transact(
      () => {
        if (changed) {
          const patch = store.commit(r.state);
          const undoable = r.undoable !== false;
          if (r.text)
            store.addAudit(
              { at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable },
              undoable ? patch : null,
              false,
            );
        } else if (r.text)
          store.addAudit(
            { at: nowHM(), day: today(), text: r.text, files: r.files, source: r.source || 'app', undoable: false },
            null,
            false,
          );
        for (const t of r.extra || [])
          store.addAudit(
            { at: nowHM(), day: today(), text: t, files: [], source: 'auto', undoable: false },
            null,
            false,
          );
      },
      !!(changed || r.text || r.extra?.length),
    );
    if (changed) applied(prev, store.state);
    return { ok: true, text: r.text };
  } catch (e) {
    return fail(e);
  }
}
