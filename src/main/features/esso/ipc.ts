// The IPC handlers of Settings › ΕΣΣΟ.
//
// Purpose: `registerEssoIpc` registers `essoInfo`, `essoDir`, `essoRoster`, `essoStart`, `essoPick`, `essoRestore` and
//   `essoOpen`, and shows the folder/file dialogs they need.
// Does NOT: archive, start or restore (archive.ts, start.ts, restore.ts), or decide the order of registration
//   (main.ts calls it at the same place as before).
// Owner layer: main (architecture), `features/esso`. Imports app/*, `ipc/handle`, `features/sources`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6a), same channels in the same order. The folders a dialog returns are
//   added to `essoDirs`; start/restore accept only those (a renderer cannot name any other folder).
// Covering test: test/ipc-contract.test.ts (channels), test/ipc-guards.test.ts; the Electron comparison in the PR.
import fs from 'fs';
import { dialog, shell } from 'electron';
import type { EssoArchiveInfo, EssoStart } from '../../../shared/api';
import { readArchive } from '../../esso';
import { DOCS, archiveRoot } from '../../app/paths';
import { outputDir } from '../../app/dirs';
import { win } from '../../app/state';
import { handle } from '../../ipc/handle';
import { rosterPreview } from '../sources';
import { essoInfo, newRoot } from './archive';
import { essoDirs, knownArchives, okEssoDir, sameDir } from './guard';
import { restoreEsso } from './restore';
import { startEsso } from './start';

/** Registers the seven ΕΣΣΟ channels (Settings › ΕΣΣΟ). */
export function registerEssoIpc() {
  handle('essoInfo', () => essoInfo());
  handle('essoDir', async (_e, def?: string) => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε φάκελο',
      defaultPath: typeof def === 'string' && def ? def : DOCS(),
      properties: ['openDirectory', 'createDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (dir) essoDirs.add(dir);
    return dir;
  });
  handle('essoRoster', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Δυναμολόγιο της νέας ΕΣΣΟ',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return rosterPreview(res.filePaths[0], null);
  });
  handle('essoStart', (_e, o: EssoStart) => startEsso(o));
  handle('essoPick', async (): Promise<EssoArchiveInfo | { ok: false; error: string } | null> => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος αρχείου ΕΣΣΟ (με το ΕΣΣΟ.json)',
      defaultPath: fs.existsSync(archiveRoot()) ? archiveRoot() : DOCS(),
      properties: ['openDirectory'],
    });
    const dir = r.canceled ? null : r.filePaths[0] || null;
    if (!dir) return null;
    const a = readArchive(dir);
    if (!a.ok) return a;
    essoDirs.add(dir);
    return {
      dir,
      name: a.manifest.name,
      at: a.manifest.at,
      people: a.manifest.people,
      files: new Set(a.manifest.files.map((f) => f.copy)).size,
    };
  });
  handle('essoRestore', (_e, dir: string) => restoreEsso(dir));
  handle('essoOpen', (_e, dir: string) => {
    if (
      typeof dir !== 'string' ||
      !(
        okEssoDir(dir) ||
        knownArchives().some((d) => sameDir(d, dir)) ||
        sameDir(dir, outputDir()) ||
        sameDir(dir, newRoot())
      ) ||
      !fs.existsSync(dir)
    )
      return 'άγνωστος φάκελος';
    return shell.openPath(dir);
  });
}
