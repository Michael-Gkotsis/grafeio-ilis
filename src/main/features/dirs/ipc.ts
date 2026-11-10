// The IPC handlers of the folder settings (Settings › Φάκελοι).
//
// Purpose: `registerDirsIpc` registers `dirChoose`, `dirReset` and `dirOpen` for the general output folder, one folder
//   per form and one per kind of new Excel; `dirOf` answers which folder a target currently uses.
// Does NOT: compute the default folders (`app/dirs`, `features/exports`' `formBinding`), or choose the backup/output
//   folder of the older dialogs (`openFolder`, `chooseOutputDir` in features/backups).
// Owner layer: main (architecture), `features/dirs`. Imports app/*, `shared/sources`, `ipc/handle`,
//   `features/commands` and `features/exports`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6b), same channels in the same order. `settings.outputDir`, `forms[].dir`
//   and `newDirs` are frozen settings (CLAUDE.md rule 3); `dirChoose` writes them only through `runCmd`.
// Covering test: test/ipc-contract.test.ts (channels), test/ipc-guards.test.ts (argument guards); the
//   dialogs are covered by the Electron comparison in the PR.
import fs from 'fs';
import { dialog, shell } from 'electron';
import type { DirTarget } from '../../../shared/api';
import { FORM_KINDS, KIND, canCreate } from '../../../shared/sources';
import { writableDir } from '../../app/paths';
import { newDir, outputDir } from '../../app/dirs';
import { store, win } from '../../app/state';
import { handle } from '../../ipc/handle';
import { reply, runCmd, fail } from '../commands';
import { formBinding } from '../exports';

/** The folder a target uses now: the output folder, a form's own folder, or the folder for a kind's new files. */
const dirOf = (t: DirTarget) =>
  t === 'output' ? outputDir() : 'form' in t ? formBinding(t.form).dir || outputDir() : newDir(t.kind);

/** Registers `dirChoose`, `dirReset` and `dirOpen`. */
export function registerDirsIpc() {
  // File folders (Settings): the general one, one per form and one per kind for the new Excel. Empty = the general
  // one.
  const setDir = (t: DirTarget, dir: string | undefined, what: string) => {
    if (t === 'output')
      return runCmd({ t: 'setSettings', settings: { outputDir: dir || '' }, text: 'φάκελος αρχείων ' + what });
    if ('form' in t) {
      const forms = { ...(store.state.settings.forms || {}) };
      const b = { ...formBinding(t.form), dir };
      if (Object.values(b).some((v) => v !== undefined && v !== '')) forms[t.form] = b;
      else delete forms[t.form];
      return runCmd({
        t: 'setSettings',
        settings: { forms },
        text: 'φάκελος για το έντυπο ' + t.form + ': ' + what,
      });
    }
    const newDirs = { ...(store.state.settings.newDirs || {}) };
    if (dir) newDirs[t.kind] = dir;
    else delete newDirs[t.kind];
    return runCmd({
      t: 'setSettings',
      settings: { newDirs },
      text: 'φάκελος για νέα Excel (' + KIND[t.kind].label + '): ' + what,
    });
  };
  const okTarget = (t: DirTarget) =>
    t === 'output' ||
    (!!t &&
      typeof t === 'object' &&
      (('form' in t && FORM_KINDS.includes(t.form)) || ('kind' in t && canCreate(t.kind))));
  handle('dirChoose', async (_e, t: DirTarget) => {
    if (!okTarget(t)) return fail('άγνωστος φάκελος');
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε φάκελο',
      defaultPath: dirOf(t),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = r.filePaths[0];
    if (!writableDir(dir)) return fail('Δεν γράφεται ο φάκελος ' + dir + '. Διάλεξε άλλον.');
    const c = setDir(t, dir, dir);
    return c.ok ? reply(c.text, false) : c;
  });
  handle('dirReset', (_e, t: DirTarget) => {
    if (!okTarget(t)) return fail('άγνωστος φάκελος');
    const c = setDir(t, undefined, t === 'output' ? 'προεπιλογή' : 'ο γενικός');
    return c.ok ? reply(c.text, false) : c;
  });
  handle('dirOpen', (_e, t: DirTarget) => {
    if (!okTarget(t)) return 'άγνωστος φάκελος';
    const dir = dirOf(t);
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
}
