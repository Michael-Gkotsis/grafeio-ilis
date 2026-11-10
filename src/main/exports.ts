// Deprecated path: import from './shared/forms' (the form engine moved there in Phase 4.9a).
//
// Purpose: keeps the old import path alive so that the importers (src/main, worker, test, bench) do not change in
//   this PR.
// Does NOT: contain code. It re-exports the public face of the engine, with the same names as before. The bare imports
//   below only fix the order in which the bundle evaluates the dependencies.
// Owner layer: main (architecture). Importers migrate to the new path later; then this file is deleted.
// Why: the bare imports repeat, in the same order, the value imports the old file had, so that the modules it loaded
//   (shared/*, core/*, tplmap, sigs, layout) are still evaluated in the same order in every bundle (main, worker, excel);
//   the form files then load right before this shim, where the old file sat (Phase 4.9a).
// Covering test: every test that imports the engine (e.g. test/exports.test.ts).
import '../shared/dates';
import '../shared/returns';
import '../shared/weekend';
import '../shared/text';
import '../shared/hours';
import '../shared/hkaiText';
import '../shared/domain';
import '../shared/ranks';
import '../shared/unit';
import '../shared/rules';
import '../shared/outsDay';
import './xlsx';
import '../shared/sources';
import '../shared/cadre';
import '../shared/outsStay';
import '../shared/froura';
import './tplmap';
import '../shared/sigs';
import './sigs';
import '../shared/xlLook';
import './layout';
import '../shared/stat';
export * from './shared/forms';
