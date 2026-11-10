// Importing a sheet of another kind than the statuses (the command the screen built) from its Excel.
//
// Purpose: `applySheet` binds the file, runs the screen's import command, stamps the memory and arms the auto-write.
// Does NOT: build the command (the renderer does), preview a roster (roster.ts) or read the statuses (status.ts).
// Owner layer: main (architecture), `features/sources`. Imports app/*, `features/commands`, shared/*.
// Why: moved verbatim from main.ts (Phase 4.3b).
// Covering test: test/sources*.test.ts, test/commands*.test.ts; the Electron comparison in the PR description.
import path from 'path';
import type { CmdResult } from '../../../shared/api';
import type { Command } from '../../../shared/commands';
import { isCadreKind, type ListKind, type SourceBinding } from '../../../shared/sources';
import { autoTimer, dirty, setAutoTimer } from '../../app/state';
import { SHEET_CMDS } from '../../app/tables';
import { runAuto } from '../autowrite';
import { fail, reply, runCmd } from '../commands';
import { cadreExtra, markSynced, saveBinding } from './binding';
import { notify } from './status';

/**
 * Binds the file, runs the import command the screen built, stamps the memory and arms the auto-write.
 * @param keys duty check: the Excel's «day|person» entries the app has now seen; only these are deleted by the
 *   later write
 */
export async function applySheet(
  kind: ListKind,
  b: SourceBinding,
  cmd: Command,
  keys: string[] = [],
): Promise<CmdResult> {
  if (SHEET_CMDS[kind] !== cmd.t) return fail('Λάθος είδος εισαγωγής');
  try {
    saveBinding(kind, b);
    const r = runCmd(cmd);
    if (!r.ok) return r;
    await markSynced(
      kind,
      b,
      kind === 'duties' ? { keys: [...new Set(keys.map(String))] } : isCadreKind(kind) ? await cadreExtra(kind, b) : {},
    );
    dirty.add(kind);
    clearTimeout(autoTimer);
    setAutoTimer(setTimeout(runAuto, 1200));
    notify();
    return reply(r.text || 'Δεν βρέθηκε κάτι νέο στο ' + path.basename(b.file) + ' › ' + b.sheet);
  } catch (e) {
    return fail(e);
  }
}
