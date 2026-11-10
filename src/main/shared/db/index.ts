// Public face of the database package: the `Store` class, its error, the backup helpers and the patch type.
//
// Purpose: what the old src/main/db.ts exported (`Store`, `CorruptDbError`, `BackupInfo`, `listBackups`,
//   `backupsToDelete`, `Patch`), and nothing else. The schema, the `kv` keys, `emptyPatch` and `diffMap` stay private
//   to the folder: nobody outside it may depend on them.
// Does NOT: contain code. The bare imports below only fix the order in which the bundles evaluate the dependencies.
// Owner layer: main (architecture), `shared/db`.
// Why: the bare imports repeat, in the same order, the value imports the old db.ts had, so that the modules it loaded
//   (domain, notes, dates, ambient, rules, files, ranks, sources) are still evaluated in the same order in the main
//   bundle, the worker bundle and the excel bundle, whichever path the importer uses.
// Covering test: test/db.test.ts.
import 'fs';
import 'path';
import 'sql.js';
import '../../../shared/domain';
import '../../../shared/notes';
import '../../../shared/dates';
import '../../../core/ambient';
import '../../../shared/rules';
import '../../files';
import '../../../shared/ranks';
import '../../../shared/sources';
export { CorruptDbError } from './errors';
export { backupsToDelete, listBackups } from './backups';
export type { BackupInfo } from './backups';
export type { Patch } from './patch';
export { Store } from './store';
