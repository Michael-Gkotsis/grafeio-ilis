// The ΕΣΣΟ archive: what the current series consists of, writing it to the archive, and the info the screen shows.
//
// Purpose: `newRoot`, `settleAuto`, `essoFiles`, `outDirsOf`, `archiveNow` (write the current series to the archive),
//   `essoInfo` (the data of Settings › ΕΣΣΟ) and `copyInto` (copy a file into the new series' folder).
// Does NOT: decide whether a series may change (guard.ts), start or restore (start.ts, restore.ts), register IPC.
// Owner layer: main (architecture), `features/esso`. Imports app/*, `features/autowrite`, the archive engine
//   (src/main/esso.ts) and the pure ΕΣΣΟ rules; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6a). Only the ΕΣΣΟ code used these helpers (the backups, folders,
//   diagnostics and boot code in main.ts do not), so they stay inside the slice and are not promoted to `app/`.
// Covering test: test/esso.test.ts (archive engine, names, restored paths); the flow itself by the Electron comparison.
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { copyDurable } from '../../files';
import { today, nowHM } from '../../../shared/dates';
import type { AppState } from '../../../shared/domain';
import type { EssoArchiveInfo, EssoInfo } from '../../../shared/api';
import { KIND, type FormBinding, type FormKind, type ListKind, type SourceBinding } from '../../../shared/sources';
import { currentEsso, essoName, parseEsso } from '../../../shared/esso';
import { listArchives, readArchive, writeArchive } from '../../esso';
import { archiveRoot, DOCS } from '../../app/paths';
import { writeMeta } from '../../app/meta';
import { outputDir } from '../../app/dirs';
import { srcMeta } from '../../app/bindings';
import { autoBusy, autoTimer, store } from '../../app/state';
import { runAuto } from '../autowrite';
import { knownArchives, sameDir } from './guard';

/**
 * The folder the new series is created in: next to the current one when that is a ΕΣΣΟ folder («Β΄ ΕΣΣΟ 2026»),
 * else in the Documents folder.
 */
export const newRoot = () => {
  const o = outputDir();
  return parseEsso(path.basename(o)) ? path.dirname(o) : DOCS();
};

/** Waits until what is pending for the Excel files is written, so it goes into the archive. */
export async function settleAuto() {
  clearTimeout(autoTimer);
  while (autoBusy) await new Promise((r) => setTimeout(r, 100));
  await runAuto();
}

/** The Excel files of the current series: the sources of each kind and the user's own form templates. */
export function essoFiles(s: AppState): { orig: string; kind?: ListKind; form?: FormKind; label: string }[] {
  const st = s.settings;
  return [
    ...(Object.entries(st.sources || {}) as [ListKind, SourceBinding | undefined][])
      .filter(([, b]) => b?.file)
      .map(([k, b]) => ({ orig: b!.file, kind: k, label: KIND[k]?.label || k })),
    ...(Object.entries(st.forms || {}) as [FormKind, FormBinding | undefined][])
      .filter(([, b]) => b?.file)
      .map(([f, b]) => ({ orig: b!.file!, form: f, label: 'Template ' + f })),
  ];
}

/** Every folder the current series writes to (output, per-form and per-kind folders), without duplicates. */
export const outDirsOf = (s: AppState) => [
  ...new Set(
    [
      outputDir(),
      ...Object.values(s.settings.forms || {}).map((b) => b?.dir),
      ...Object.values(s.settings.newDirs || {}),
    ].filter((x): x is string => !!x),
  ),
];

/**
 * Writes the current series to the archive: a folder with the database, the Excel files, `sources.json` and the
 * `ΕΣΣΟ.json` manifest, then remembers it in `meta.json`. One file write at a time (the caller wraps it in `serial`).
 * @param root the archive root the new archive folder is created in
 */
export function archiveNow(root: string) {
  const s = store.state;
  const e = currentEsso(s);
  const r = writeArchive({
    root,
    day: today(),
    db: store.data(),
    files: essoFiles(s).map(({ orig, kind, form }) => ({ orig, ...(kind ? { kind } : {}), ...(form ? { form } : {}) })),
    sources: srcMeta.dump(),
    manifest: {
      app: 'grafeio-ilis',
      v: 1,
      name: e ? essoName(e) : 'ΕΣΣΟ',
      ...(e ? { esso: e } : {}),
      at: today() + ' ' + nowHM(),
      version: app.getVersion(),
      people: s.people.filter((p) => p.active).length,
      outDirs: outDirsOf(s),
    },
  });
  writeMeta({ essoArchives: [r.dir, ...knownArchives().filter((d) => !sameDir(d, r.dir))].slice(0, 50) });
  return r;
}

/** The data of Settings › ΕΣΣΟ: people, bound files, output folders, the two default roots and the known archives. */
export function essoInfo(): EssoInfo {
  const s = store.state;
  const seen = new Set<string>();
  const archives: EssoArchiveInfo[] = [];
  const add = (dir: string, m: { name: string; at: string; people: number; files: { copy: string }[] }) => {
    const k = path.resolve(dir).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    archives.push({
      dir,
      name: m.name,
      at: m.at,
      people: m.people,
      files: new Set(m.files.map((f) => f.copy)).size,
    });
  };
  for (const d of knownArchives()) {
    const r = readArchive(d);
    if (r.ok) add(d, r.manifest);
  }
  for (const x of listArchives(archiveRoot())) add(x.dir, x.manifest);
  archives.sort((a, b) => b.at.localeCompare(a.at));
  return {
    people: s.people.filter((p) => p.active).length,
    files: essoFiles(s).map((f) => ({ label: f.label, file: f.orig, exists: fs.existsSync(f.orig) })),
    outDirs: outDirsOf(s),
    archiveRoot: archiveRoot(),
    newRoot: newRoot(),
    archives,
  };
}

/** Copies `file` into `dir` under the same name (and extension), without overwriting an existing file. */
export function copyInto(dir: string, file: string): string {
  const ext = path.extname(file),
    stem = path.basename(file, ext);
  for (let i = 1; ; i++) {
    const f = path.join(dir, stem + (i > 1 ? ' (' + i + ')' : '') + ext);
    if (sameDir(f, file)) return f;
    if (!fs.existsSync(f)) {
      fs.mkdirSync(dir, { recursive: true });
      copyDurable(file, f);
      return f;
    }
  }
}
