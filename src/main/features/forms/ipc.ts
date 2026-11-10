// The IPC handlers of the form templates (Αρχεία Excel › Έντυπα).
//
// Purpose: `registerFormsIpc` registers `formPick`, `formInfo`, `formSave`, `formDir` and `openPath`.
// Does NOT: read a template (info.ts), decide which files are known (known.ts), or show the file dialog: the Excel
//   picker is passed in by the boot closure, which shares it with the sources handlers.
// Owner layer: main (architecture), `features/forms`. Imports app/*, `ipc/handle`, `features/exports`,
//   `features/commands`.
// Why: moved verbatim from main.ts (Phase 4.5), same channels in the same order. `forms` in the settings is a frozen
//   data contract (CLAUDE.md rule 3); only the main process changes it, through `formSave`.
// Covering test: test/ipc-contract.test.ts (channels), test/ipc-guards*.test.ts; the Electron comparison in the PR.
import fs from 'fs';
import path from 'path';
import { dialog, shell } from 'electron';
import type { FormBinding, FormKind } from '../../../shared/sources';
import { outputDir } from '../../app/dirs';
import { win, store } from '../../app/state';
import { srcMeta } from '../../app/bindings';
import { handle } from '../../ipc/handle';
import { fail, reply, runCmd } from '../commands';
import { formBinding } from '../exports';
import { formInfo } from './info';
import { knownPath } from './known';

/** Registers the five form-template channels; `pickXlsx` opens the Excel file dialog (and allows the file). */
export function registerFormsIpc(pickXlsx: (title: string) => Promise<string | null>) {
  handle('formPick', async (_e, f: FormKind) => {
    const file = await pickXlsx('Template για ' + f);
    if (!file) return null;
    return formInfo(f, file);
  });
  handle('formInfo', (_e, f: FormKind) => formInfo(f));
  handle('formSave', (_e, f: FormKind, b: FormBinding | null) => {
    const cur = formBinding(f);
    if (b?.file && b.file !== cur.file && !srcMeta.allowed(b.file))
      return fail('Άγνωστο αρχείο: διάλεξέ το με το «Template…»');
    if (b?.dir && b.dir !== cur.dir && !srcMeta.allowed(b.dir))
      return fail('Άγνωστος φάκελος: διάλεξέ τον με το «Φάκελος…»');
    const forms = { ...(store.state.settings.forms || {}) };
    if (b && Object.values(b).some((v) => v !== undefined && v !== '')) forms[f] = b;
    else delete forms[f];
    const r = runCmd({
      t: 'setSettings',
      settings: { forms },
      text: 'έντυπο ' + f + (b?.file ? ': ' + path.basename(b.file) : b?.dir ? ': φάκελος ' + b.dir : ': προεπιλογή'),
    });
    return r.ok ? reply(r.text, false) : r;
  });
  handle('formDir', async (_e, f: FormKind) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος για το έντυπο',
      defaultPath: formBinding(f).dir || outputDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (dir) srcMeta.allow([dir]);
    return dir;
  });
  handle('openPath', (_e, file: string) => {
    if (typeof file === 'string' && /\.xls[xm]?$/i.test(file) && knownPath(file) && fs.existsSync(file))
      return shell.openPath(file);
    return 'άγνωστο αρχείο';
  });
}
