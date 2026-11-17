# CLAUDE.md: rules for working in this repo (during and after the rewrite)

## What this is
"Γραφείο Λοχία" (grafeio-ilis): offline Electron desktop app for a Greek army squadron ("Ίλη") office: personnel, duties,
outs ("εξοδούχοι"), medical, penalties, ΗΚΑΙ, and Excel/Word outputs filled from templates. Runs on Windows 7 x64, Intel Atom,
2 GB RAM, no internet. Runtime is Electron 22 = Chromium 108 / V8 10.8 / Node 16.17 (the last Electron that runs on Win7).
All user-facing texts (screens, Excel, Word, guide) are Greek. Code, identifiers and code comments are English
(quote unit terms as they are, e.g. `«ΗΚΑΙ» back page`).

## Commands (all in package.json)
| Command | What it does | PR must pass |
|---|---|---|
| `npm test` | vitest, ~2100 tests in 224 files (rules, Excel/Word output, UI render, architecture ratchets); it also checks the golden output hashes (`test/golden-outputs.test.ts` vs `test/golden/outputs.txt`) and the screen HTML snapshots (`test/__snapshots__/screens/`) | yes |
| `npm run check` | Biome format + lint (`lint`, `format` also exist); CI lints every changed file and runs full `biome ci` (format + lint) on files the PR adds; existing files are reformatted only in their own PRs (1.2, Phase 6), and import sorting is off (import order can carry side effects) | changed/added files |
| `npm run typecheck` | `tsc --noEmit` over src, test, bench (strict, noUnusedLocals); `scripts/` is `.mjs` and is not type-checked | yes |
| `npm run build` | `scripts/build.mjs`: esbuild main/preload + vite renderer into `dist/` | yes |
| `npm run bench:golden` | writes every Excel/print output and prints hashes for a manual look; the binding check is the golden test inside `npm test`. Never edit `test/golden/outputs.txt` to make a PR pass | yes (via `npm test`) |
| `npm run bench:ui` | Electron UI timing per screen (CPU x4); no screen may get slower | yes for UI/structure PRs |
| `node bench/ui/styles-diff.mjs` (`npm run bench:styles`) | browser DOM + computed-style + box diff of every screen, tab and click-opened dialog (light/dark, 3 widths) vs `rewrite`; local, needs Playwright, report in `dist/styles-diff/` | yes for structural renderer PRs and CSS PRs (0 differences, or each one explained) |
| `npm run bench` | node micro-benchmarks of core rules and Excel (`bench/bench.ts`) | when touching hot paths |
| `npm run bench:full` | full-app benchmark with Electron (`bench/full.ts`) | when touching main/db |
| `npm run bench:compare -- new.json` | compares a JSON from `node bench/collect.mjs --out new.json` with `bench/baseline/phase0.json`; exits 1 if a timing is >5% slower (`--threshold`) | for UI/structure PRs, on the same machine |
| `npm run dev` | `scripts/dev.mjs`: dev run of the app | no |
| `npm run gen:print-window` | regenerates `src/main/shared/print/windowScript.gen.ts` from `previewWindow/*.ts`; run it after editing the print preview script (`test/print-window-gen.test.ts` fails on a stale bundle) | when touching `previewWindow/` |

Biome (`biome.json`): `noForEach` and `noExplicitAny` are "warn" for now (the ratchet in `test/architecture.test.ts` enforces them per file); they become "error" when the baseline reaches 0.
Also exist: `bench:reports`, `bench:ui:reports`, `start`, `package:*` (releases only, see Workflow).

## Hard rules (non-negotiable)
1. **Outputs never change.** Excel and Word files the app writes, and the `templates/` folder, must not change by one byte:
   ΗΚΑΙ/ΗΚΑΛ, Ημερήσια Διαταγή (.docx), Υπηρεσίες/ΦΡΟΥΡΑ, Εξοδούχοι, Δυναμολόγιο, headings, columns, fonts, capitals,
   signatures, print layout, pagination. The engines xlsx / forms / hdDocx / print may only be MOVED, never changed in output.
   `bench:golden` must give identical hashes.
2. Everything the app writes into Excel is in CAPITALS. Dates are shown dd/mm/yyyy. Seat codes are exact (e.g. `Θ1α`).
3. **Frozen data contracts** (users upgrade in place; breaking any loses data or settings):
   - `data/ilh.db`: tables, `SCHEMA_VERSION`, `KV_KEYS`/`KV_ENTRIES` (src/main/shared/db/schema.ts, kv.ts),
     format of undo patches (actions of the previous version must stay undoable).
   - Files `data/meta.json`, `sources.json`, `forms.json`, `flags.json`, folder `data/Πρότυπα εντύπων`,
     backup names `ilh_YYYY-MM-DD_*.db` in `data/backups`.
   - localStorage keys `grafeio.prefs`, `grafeio.nav`, `grafeio.people`, `grafeio.recent`, `grafeio.quickAdd`.
   - Folder names (`GrafeioIlis`, `Έγγραφα\Γραφείο Ίλης`, USB backup copies).
   - Auto-update: release file names and the format `src/main/update.ts` reads (new version must update from old ones).
   - The 19 keyboard shortcuts (14 global; Up/Down and PageUp/PageDown in person/cadre sheets; N next empty seat;
     1-9 weapon move reason in 3 places) and all Ctrl+K commands.
4. **Platform limits (Win7 / Electron 22):**
   - tsconfig target/lib is ES2021 today; the plan is ES2022 lib. Syntax can be modern (esbuild/TS transpile it),
     but built-in APIs are NOT transpiled: use only what exists in V8 10.8 / Node 16.
   - Forbidden in `src/main`, `src/shared`, `src/preload`, `src/core` (enforced by `test/node16.test.ts`): `toSorted`, `toReversed`,
     `toSpliced`, `findLast`/`findLastIndex`, `structuredClone`, `fetch`. Also avoid everywhere: `with`, `Object.groupBy`/
     `Map.groupBy`, Set methods (`union`...), `Promise.withResolvers`, `Array.fromAsync`. Use `[...a].sort()` etc.
   - No CSS nesting (needs Chromium 112). `@layer`, container queries, `:has()`, `clamp()` are fine (Chromium 99+/105+).
   - No new heavy runtime dependency (2 GB RAM, Atom): measure size and justify. `htm` is going away (UI moves to TSX).
5. **Refactor PRs move code, not logic.** Same behavior or a written behavior change, never both in one PR. Never delete,
   skip or loosen a test (tests that read source text are rewritten as behavior tests first, same purpose). Never remove a
   feature or setting. Only import paths change in tests.
6. **Code style:**
   - Declarative array methods (`map/filter/reduce/some/every/find/flatMap`, `Object.entries/fromEntries`, `new Map(...)`).
     No `forEach`. `for...of` only when you need `break`/`continue`/ordered `await`. Classic `for(;;)` only in measured hot
     paths (Excel XML read, print geometry, duty auto-fill inner loop) with a `// hot path:` comment. No `var`, no `.then`
     chains (use async/await), no `JSON.parse(JSON.stringify())`. One pass (`flatMap`/`reduce`) instead of long chains on big arrays.
   - Line <= 120 chars, file <= 400 lines, function <= 80 (screen component <= 150). Descriptive names (`seatMap`, not `pm`).
     No `any` in new code. Typed props. Boundary results are `{ ok: true, ... } | { ok: false, error }`.
   - Comments: English, structured. File header (purpose, what it does NOT do, owner layer, why it exists, covering test),
     TSDoc on every export (units/formats like "ISODate, local time", edge cases, `@decision Michael 18/10: ...`,
     `@see test/x.test.ts`), and "why" comments next to non-obvious lines (unit rule, Win7/Excel trap). No "what" comments.
     Comments are translated to English in the same PR that moves a file; user-facing Greek texts are never touched.

## Workflow
- Shared integration branch: `rewrite` (cut from main 2bf8769). All rewrite PRs target `rewrite`: small, ONE concern each,
  rebased on latest `rewrite`. Never push to main directly.
- A PR may be merged into `rewrite` automatically only when ALL nets pass: `npm test`, typecheck, build, identical
  golden hashes, identical screen HTML snapshots (both inside `npm test`), `bench:ui` not slower. CI: `.github/workflows/elegxos.yml`
  runs typecheck + test + build + Biome (lint on changed files, `biome ci` on added files) on every pull request (any base branch).
- Final `rewrite` -> main merge is done only by Michael. Fixes landing on main are merged into `rewrite` in their own PR.
- Releases are built by CI (`paketo.yml`) from main only. Never build or attach zip/exe/deb packages by hand or in a PR
  (`package:*` scripts are for CI).
- Ownership (architecture work vs UI redesign work): `app/styles/*.css`, tokens, themes, look and markup of a screen = UI work, and
  only AFTER that screen's structural PR. `core/`, `main/`, `preload/`, store, IPC, build config (vite/esbuild) = architecture.
  Shared UI primitives: architecture splits them with the same API, then their look is UI work. Print window: markup = UI,
  pagination = architecture.

## If you are changing X, look in Y (today's layout)
| Change | Look in |
|---|---|
| Duty/outs/leave/HKAI rules, dates, text, ranks, status logic (pure, no fs/Electron/React) | `src/core/`: `duty/` (auto-fill, fairness, who does what), `outs/` (returns, outs of the day, weekend), `statuses/`, `hkai/`, `people/` (ranks, Σ.Ι., quick add), `lib/` (`dates.ts`, `greek.ts`, `text.ts`), `model/` (types, settings, migrate), `forms/` (ΗΔ, layout, signatures), `reports/`, `weapons/`, `cadre/`, `notes/`, `esso/`; module-level state is set only through `src/core/ambient.ts`. The files in `src/shared/*.ts` are deprecated re-exports (removed in Phase 7): add no code there |
| Commands with undo (every user action) | `src/core/commands/` (`handlers/`, `run.ts`) |
| IPC contract between UI and main | `src/shared/ipc/` (`contract.ts` channel tables, `types.ts` payloads), `src/preload/preload.ts` (built from the contract), handlers in `src/main/features/<topic>/ipc.ts` wired by `src/main/ipc/handle.ts`, `src/renderer/shared/api/mockApi.ts` |
| Database, migrations, backups | `src/main/shared/db/` (`schema.ts`, `kv.ts`, `patch.ts`, `backups.ts`, `store.ts`); Excel worker thread `src/main/shared/worker/` (entry `src/main/worker.ts`, path frozen by the build) |
| Excel writing / reading Ίλη's Excel files | engine `src/main/shared/excel/xlsx/`; main side `src/main/sources.ts` + `src/main/features/sources/`; ExcelJS-only (lazy, heavy) `src/main/excel.ts`; pure reading/mapping rules `src/core/excel-in/`, `src/core/model/xlLook.ts` |
| Forms (ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι), Word ΗΔ | `src/main/shared/forms/`, `src/main/features/exports/`, `src/main/hdDocx.ts`, `src/main/tplmap.ts`, `templates/*.xlsx` (frozen) |
| Printing / pagination | `src/main/shared/print/` (preview window source in `previewWindow/`, then `npm run gen:print-window`), `src/main/features/print/`, `src/preload/print.ts`, `src/core/reports/formPage.ts`, `src/core/forms/layout.ts` |
| Auto-update | `src/main/update.ts`, `updater.ts`, `src/main/features/update/`, `src/renderer/features/update/`, `scripts/package-app.mjs` |
| App startup, windows | `src/main/main.ts` (entry) + `src/main/app/` (boot, window, recover, lockdown, quit) |
| Screens not moved yet (htm): «Υπηρεσίες» and «Έντυπα» | `src/renderer/screens/guard.ts` (+ `whodoes.ts`, `skips.ts`, `outsPlan.ts`), `screens/reports.ts` (+ `repBands.ts`, `valueEditor.ts`); most other files in `screens/` are deprecated re-exports |
| Screens already moved in Phase 6 (TSX, view logic in `model/view.ts` with a test; the old `screens/*.ts` path re-exports until Phase 7; a lazy page's chunk is named after its folder, see `vite.config.mjs`): «Διάγνωση» `diag`, «Οδηγός» `guide`, «Ιστορικό» `history`, «Σημειώσεις» `notes`, «Ρυθμίσεις» `settings`, «Δύναμη» `strength`, «ΗΚΑΙ» `hkai`, «Στελέχη» `cadre`, «Σήμερα» `today`, «Εξοδούχοι» `outs`, «Δυναμολόγιο» `people`, «Οπλισμός» `weapons`, «Καταστάσεις» `statuses` | `src/renderer/pages/<screen>/` (`ui/` markup, `model/` state, view and actions, public API: its `index.ts`) |
| Shell, nav, Ctrl+K, shortcuts, state | `src/renderer/app/` (Root, Shell, routes, shortcuts, CommandPalette; the providers `useStoreValue`, `useNavValue`), the contexts `StoreCtx`/`NavCtx` in `src/renderer/shared/model/`, `shared/lib/prefs.ts`, `ui.ts`, `common.ts` |
| Shared UI primitives (Button, Dialog, Sheet, Select…) | `src/renderer/shared/ui/` (public API: its `index.ts`; helpers `shared/lib/`) |
| Export context and hooks used by screens, features and widgets (`ExportProvider`, `useExport`, `useExportBusy`, `usePrintFile`) | `src/renderer/shared/model/` (public API: its `index.ts`) |
| Person, status and note atoms shown on many screens (PersonPicker, RkName, StatusBadge, cadre status chip and `absRange`, ChangePlanList, NoteDot, TodayAlert and the notes tab label) | `src/renderer/entities/{person,status,note}/` (public API: each `index.ts`) |
| User actions that several screens open as a dialog (declare a status, fix a status, end a leave early or fix its times, quick-add of soldiers, write or edit a note, «Έντυπα ημέρας», edit signatures, drag header and signatures on the page, the auto-update chip, dialog and card, «Γραμμές και ονόματα» of the ΗΚΑΙ, weapon exit/entry dialogs, pop-ups and the ΕΝΤΟΣ | ΕΚΤΟΣ switch, edit or add a soldier (`person-edit`, with the Σ.Ι. and room fields), edit a cadre member and his statuses (`cadre-edit`), the «Προσωπικά» tab (`personal-data`), fix when one person comes back (`back-fix`), new, rename and choose a duty phase, add or edit a service block (`duty-blocks`); more slices follow) | `src/renderer/features/<slice>/` (`ui/` markup, `model/` state and rules, public API: its `index.ts`; a feature imports only entities, shared and src/shared, never another feature; the old screen paths re-export until Phase 7) |
| Blocks built from features and entities that screens drop in as one piece (the export buttons «Βγάλε το Excel» / «Εκτύπωση» / «Υπογραφές…», the signatures menu, the template note; the soldier's and the cadre member's side cards `person-sheet` and `cadre-sheet`, with the frozen Up/Down/PageUp/PageDown walk, the «Ποιοι γυρίζουν και πότε» list `returns-list`, the «Αρχεία Excel» alert and file status `sources-alert`, the Excel-like preview `ExcelSheet` of a sheet model `excel-preview`; the medical / penalty list and the leaves list `status-lists`; the «Αιτήσεις» tab, card, ΗΚΑΙ summary link and the request and approval dialogs `requests`; the «Ημερήσια Διαταγή» tab `hd`; `reqWaiting` is in `shared/lib/`; the pure sheet builders `frouraSheet`/`checkSheet`/`hkaiFront`/`hkaiBack` and the `Cell`/`SheetModel`/`E` types are model code in `src/renderer/shared/lib/sheets/`) | `src/renderer/widgets/<slice>/` (`ui/` markup, optional `model/`, public API: its `index.ts`; a widget imports features, entities and shared only through their `index.ts`, never another widget; the old `common.ts` paths re-export until Phase 7) |
| Look and feel | `src/renderer/app/styles/index.css` (layer order) + `legacy.css` (UI work), `index.html` |
| Tests | `test/*.test.ts` (224 files; helpers `fixtures.ts`, `duty-sim.ts`, `outs-gen.ts`, `tplgen.ts`, `test/support/`; architecture rules in `test/architecture/` + `test/support/arch-*.ts`; snapshots in `test/__snapshots__/`, golden hashes in `test/golden/`) |
| Benchmarks, golden outputs | `bench/` (`golden-lib.ts`, `golden-books.ts`, `golden-writeback.ts` generate what the golden test hashes; `golden-reports.ts`, `bench.ts`, `full.ts`, `collect.mjs`/`compare.mjs`, `baseline/`, `ui/`) |
| Build, packaging, dev | `scripts/` (`build.mjs`, `dev.mjs`, `package-*.mjs`), `vite.config.mjs`, `build/` |
| CI | `.github/workflows/elegxos.yml` (PR checks), `paketo.yml` (release from main) |

## Layout (adapted Feature-Sliced Design; most code is already here, Phase 7 removes the deprecated re-exports)
```
src/core/        pure rules shared by main + renderer: lib/ model/ duty/ outs/ hkai/ statuses/ people/ cadre/
                 weapons/ notes/ esso/ excel-in/ reports/ forms/ commands/ ambient.ts ; no fs, no Electron, no React
src/shared/ipc/  one IPC contract; preload and mockApi derive from it (src/shared/*.ts = old paths, re-exports only)
src/main/        app/ (boot, windows)  features/<topic>/ (ipc.ts wiring + service)  ipc/  shared/ (db, worker, excel/xlsx, print, forms)
src/preload/
src/renderer/    app/ (Root, Shell, routes, store, styles/ with @layer order)  pages/<screen>/ (ui, model/view.ts, index.ts)
                 widgets/  features/  entities/  shared/ (ui, lib, model, api)
```
Rules (enforced by `test/architecture.test.ts` with baselines that may only shrink): imports go only downwards
`app > pages > widgets > features > entities > shared`; no slice-to-slice import within one layer; import a slice only
through its `index.ts`; renderer never imports main; `src/core` and `src/shared` stay free of Node, Electron, React and htm;
no new import cycle; file/function size and `forEach`/`any` counts only go down.
CSS: plain CSS + BEM + `@layer` + 3-tier tokens, one CSS file next to each component; no CSS-in-JS, Tailwind or CSS Modules;
`style=` only for dynamic values via CSS variables; no new hex colors, `!important` or appearance `style=` (ratchet tests).
View logic goes in the slice's `view.ts`, not in the component. Planned: small per-folder `CLAUDE.md` files listing traps and covering tests.
