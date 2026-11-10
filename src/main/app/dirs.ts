// Where the Excel files the app makes are put, as the settings say.
//
// Purpose: `outputDir` (the general output folder) and `newDir` (the folder for new Excel files of one list kind).
// Does NOT: create the folders, write files or look at forms (the per-form folder is `formDir` in features/exports);
//   read the window.
// Owner layer: main (architecture), `app/`. Imports `app/state` and `files` only.
// Why: the exports, sources, reports, ESSO, print and folder-settings areas all need the general output folder, so
//   it cannot live in any one of them. Moved verbatim from main.ts (Phase 4.2b).
// Covering test: test/architecture.test.ts (layers); the folders are frozen names (CLAUDE.md rule 3), checked by
//   `npm run bench:golden`.
import { app } from 'electron';
import path from 'path';
import { ownOsDir } from '../files';
import type { ListKind } from '../../shared/sources';
import { store } from './state';

/**
 * The folder the app writes its Excel and Word files to: the one chosen in Settings, else
 * `Documents\Γραφείο Ίλης`. Reads `store`, so call it only after boot opened the database.
 */
export const outputDir = () =>
  ownOsDir(store.state.settings.outputDir) || path.join(app.getPath('documents'), 'Γραφείο Ίλης');

/**
 * New Excel files per kind: the folder of the kind (Settings → Folders), else the general output folder.
 * @param k the list kind the new file is for
 */
export const newDir = (k: ListKind) => ownOsDir(store.state.settings.newDirs?.[k]) || outputDir();
