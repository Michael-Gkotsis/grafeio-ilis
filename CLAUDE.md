# CLAUDE.md: rules for working in this repo (branch `rewrite`)

"Γραφείο Λοχία" (grafeio-ilis): offline Electron desktop app for a Greek army squadron ("Ίλη") office:
personnel, duties, outs, medical, penalties, ΗΚΑΙ, and Excel/Word outputs filled from templates.
Target: Windows 7 x64, Intel Atom, 2 GB RAM, no internet. Runtime: Electron 22 = Chromium 108 / V8 10.8 / Node 16.17
(the last Electron for Win7). npm, TypeScript, React.
All user-facing texts (screens, Excel, Word, guide) are Greek. Code, identifiers and comments are English
(quote unit terms as they are, e.g. `«ΗΚΑΙ» back page`).

## Commands (repo root; CI `.github/workflows/elegxos.yml` runs typecheck, test, build and Biome on every PR)
- `npm test`: vitest over `test/**/*.test.ts`; includes the golden output hashes, screen HTML snapshots and the
  architecture ratchet. Must pass.
- `npm run typecheck`: `tsc --noEmit` over src, test, bench. Must pass. `scripts/*.mjs` is not type-checked.
- `npm run build`: esbuild main/preload + vite renderer into `dist/`. Must pass.
- `npm run check`: Biome format + lint. CI lints changed files and runs `biome ci` on added files; reformat existing
  files only in their own PR. Import sorting is off on purpose: import order can carry side effects.
- One test file: `npx vitest run test/<name>.test.ts`
- `npm run gen:print-window`: run after editing `src/main/shared/print/previewWindow/` (a test fails on a stale bundle).
- UI/structure PRs also: `npm run bench:ui` (headless Linux: `xvfb-run -a npm run bench:ui`; no screen may get slower,
  compare with `npm run bench:compare -- new.json` on the same machine) and `npm run bench:styles` (0 differences
  vs `rewrite`, or each one explained; report in `dist/styles-diff/`).
- Hot paths: `npm run bench`; main/db: `npm run bench:full`. Never run `package:*` (CI only).
- Golden baseline, only after an output change Michael asked for (rule 1):
  `GOLDEN_UPDATE=1 npx vitest run test/golden-outputs.test.ts`, then review `git diff test/golden/outputs.txt`.
- Architecture baseline, only after you REMOVED violations: `ARCH_UPDATE=1 npx vitest run test/architecture.test.ts`.
  Never grow a baseline entry or add one by hand; fix the code instead.

## Hard rules (tests cite these numbers)
1. **Outputs and templates.** Never change on your own initiative the `templates/` files or what the app writes into
   Excel/Word: ΗΚΑΙ/ΗΚΑΛ, Ημερήσια Διαταγή (.docx), Υπηρεσίες/ΦΡΟΥΡΑ, Εξοδούχοι, Δυναμολόγιο; headings, columns, fonts,
   capitals, signatures, print layout, pagination. An output may change only as part of a feature Michael asked for,
   in that feature's PR, which says which outputs change and updates the golden baseline. Refactor PRs keep every
   output byte-identical: the engines xlsx / forms / hdDocx / print are only moved. Never edit `test/golden/outputs.txt`
   by hand or to make a PR pass.
2. Everything the app writes into Excel is in CAPITALS. Dates are shown dd/mm/yyyy. Seat codes are exact (e.g. `Θ1α`).
3. **Frozen data contracts** (users upgrade in place; breaking one loses data or settings):
   - `data/ilh.db`: tables, `SCHEMA_VERSION`, `KV_KEYS`/`KV_ENTRIES` (`src/main/shared/db/schema.ts`, `kv.ts`) and the
     undo patch format (actions of the previous version must stay undoable).
   - Files `data/meta.json`, `sources.json`, `forms.json`, `flags.json`, folder `data/Πρότυπα εντύπων`,
     backups `data/backups/ilh_YYYY-MM-DD_*.db`, folders `GrafeioIlis`, `Έγγραφα\Γραφείο Ίλης`, USB backup copies.
   - localStorage keys `grafeio.prefs`, `grafeio.nav`, `grafeio.people`, `grafeio.recent`, `grafeio.quickAdd`.
   - Auto-update: release file names and the manifest format `src/main/update.ts` reads (old versions must update).
   - The 19 keyboard shortcuts (14 global; Up/Down and PageUp/PageDown in person/cadre sheets; N next empty seat;
     1-9 weapon move reason in 3 places) and all Ctrl+K commands.
   - The worker entry `src/main/worker.ts` (its path is fixed by `scripts/build.mjs`).
4. **Platform limits (Win7 / Electron 22).** Syntax can be modern (transpiled); built-in APIs are NOT transpiled:
   use only what exists in V8 10.8 / Node 16.
   - Forbidden in `src/main`, `src/shared`, `src/preload`, `src/core` (`test/node16.test.ts`): `toSorted`, `toReversed`,
     `toSpliced`, `findLast`/`findLastIndex`, `structuredClone`, `fetch`. Use `[...a].sort()` etc.
   - Avoid everywhere (no test checks these): `with`, `Object.groupBy`/`Map.groupBy`, Set methods (`union`...),
     `Promise.withResolvers`, `Array.fromAsync`.
   - No CSS nesting (needs Chromium 112). `@layer`, container queries, `:has()`, `clamp()` are fine.
   - No new heavy runtime dependency (2 GB RAM, Atom): measure the size and justify it. ExcelJS is heavy and is
     loaded lazily only in `src/main/excel.ts`.
5. **Refactor PRs move code, not logic.** Same behavior or a written behavior change, never both in one PR. Never
   delete, skip or loosen a test (a test that reads source text is first rewritten as a behavior test with the same
   purpose). Never remove a feature or setting. In tests only import paths change.
6. **Code style** (the size and `forEach`/`any` limits are ratchets in `test/architecture.test.ts`):
   - Declarative array methods; no `forEach`. `for...of` only for `break`/`continue`/ordered `await`; classic `for(;;)`
     only in measured hot paths with a `// hot path:` comment. No `.then` chains (async/await), no
     `JSON.parse(JSON.stringify())`. One pass (`flatMap`/`reduce`) instead of long chains on big arrays.
   - File <= 400 lines, function <= 80 (screen component <= 150). No `any` in new code. Typed props. Descriptive
     names (`seatMap`, not `pm`). Boundary results are `{ ok: true, ... } | { ok: false, error }`.
   - Comments in English: file header (purpose, what it does NOT do, owner layer, why, covering test), TSDoc on every
     export (units/formats, edge cases, `@decision Michael 18/10: ...`, `@see test/x.test.ts`), "why" comments at
     non-obvious lines (unit rule, Win7/Excel trap); no "what" comments. A PR that moves a file translates its
     comments; user-facing Greek texts are never touched.
   - CSS: plain CSS + BEM + `@layer` + 3-tier tokens, one CSS file next to its component. No CSS-in-JS, Tailwind or CSS
     Modules, no `!important`. Colours only as palette tokens (`test/contrast.test.ts`). `style=` only for dynamic
     values through CSS variables.

## Architecture (adapted Feature-Sliced Design; Phase 7 deletes the old re-export paths)
```
src/core/        pure rules shared by main + renderer (duty, outs, hkai, statuses, people, cadre, weapons, forms,
                 reports, excel-in, model, lib, commands with undo); no fs, Electron, React or htm
src/shared/ipc/  the one IPC contract; preload and mockApi derive from it
src/main/        main.ts + app/ (boot, windows), features/<topic>/ (ipc.ts + service), ipc/handle.ts,
                 shared/ (db, worker, excel/xlsx, forms, print)
src/preload/     built from the IPC contract
src/renderer/    app/ (Root, Shell, routes, shortcuts, styles/index.css layer order) > pages/<screen>/ > widgets/
                 > features/ > entities/ > shared/ (ui, lib, model, api)
```
- Enforced by `test/architecture.test.ts`: imports only go downwards in that renderer order; no slice-to-slice
  import within a layer; import a slice only through its `index.ts`; renderer never imports main; core and shared
  stay free of Node, Electron, React and htm; no new import cycle.
- `src/shared/*.ts` and most of `src/renderer/screens/*.ts` are deprecated re-exports: add no code there. Still real
  (htm, not moved yet): «Υπηρεσίες» `screens/guard.ts` and «Έντυπα» `screens/reports.ts` with their helpers.
- Module-level state is set only through `src/core/ambient.ts` (enforced by the architecture test).
- A page keeps markup in `ui/`, state, view logic (`model/view.ts`, with a test) and actions in `model/`, public API
  in `index.ts`. A lazy page's chunk is named after its folder (`vite.config.mjs`).
- Golden outputs are generated by `bench/golden-*.ts`; screen snapshots live in `test/__snapshots__/screens/`.

## Workflow
- All PRs target `rewrite`: small, one concern each, rebased on latest `rewrite`. Never push to main.
- A PR may be merged into `rewrite` automatically only when every net passes: `npm test` (golden hashes and screen
  snapshots identical), typecheck, build, and for UI/structure PRs `bench:ui` not slower.
- The final `rewrite` -> main merge is Michael's only. Fixes that land on main are ported into `rewrite` in their
  own PR.
- Releases are built by CI (`paketo.yml`) from main. Never build or attach zip/exe/deb packages.
- Ownership: CSS, tokens, themes, look and markup of a screen = UI work, and only AFTER that screen's structural PR.
  `core/`, `main/`, `preload/`, store, IPC, build config = architecture. Shared UI primitives: architecture splits
  them with the same API, then their look is UI work. Print window: markup = UI, pagination = architecture.

## Repository rules
- WHEN a PR changes what a screen shows first, its tabs or which dialogs open -> DO update `bench/ui/run.mjs` and
  `bench/ui/styles-walk.mjs` in the same PR and check every state is still reached (else it silently stops being
  measured).
- WHEN a PR moves, renames or creates a file or folder this file names -> DO update this file in the same PR.

## Behavioral Guidelines
Bias toward caution over speed; use judgment on trivial tasks.

1. **Think before coding.** State assumptions. If something is unclear or has several interpretations, name it and
   ask — don't pick silently. If a simpler approach exists, say so.
2. **Simplicity first.** Minimum code that solves the request. No speculative features, abstractions,
   configurability, or handling for impossible cases.
3. **Surgical changes.** Touch only what the request needs; match existing style. Don't refactor or reformat adjacent
   code. Mention unrelated dead code, don't delete it. Remove only what your change made unused.
4. **Goal-driven execution.** Turn tasks into verifiable goals (e.g. failing test first, then make it pass). For
   multi-step work give a short plan: `1. step -> verify: check`. If a fix fails twice, stop and explain the blocker
   before trying a third approach.
