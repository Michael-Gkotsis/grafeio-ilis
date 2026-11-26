# CLAUDE.md: rules for working in this repo (branch `main`)

"Γραφείο Λοχία" (grafeio-ilis): offline Electron desktop app for a Greek army squadron ("Ίλη") office:
personnel, duties, outs, medical, penalties, ΗΚΑΙ, and Excel/Word outputs filled from templates.
Target: Windows 7 x64, Intel Atom, 2 GB RAM, no internet. Runtime: Electron 22 = Chromium 108 / V8 10.8 / Node 16.17
(the last Electron for Win7). npm, TypeScript, React + htm. All user-facing texts (screens, Excel, Word, guide) are
Greek. Code comments on main are Greek too: match the file you edit.

## Commands (repo root; CI `.github/workflows/elegxos.yml` runs the first three on every PR)
- `npm run typecheck`: `tsc --noEmit` over src, test, bench. Must pass.
- `npm test`: vitest over `test/**/*.test.ts` (rules, Excel/Word output, print, UI render). Must pass.
- `npm run build`: esbuild main/preload/worker + vite renderer into `dist/`. Must pass.
- One test file: `npx vitest run test/<name>.test.ts`
- Optional checks: `npm run bench` (hot paths), `npm run bench:full` (main/db), `npm run bench:ui` (screen timings;
  headless Linux: `xvfb-run -a npm run bench:ui`), `npm run bench:golden` (writes every output and prints hashes).
- Never run `package:*`: releases are built by CI (`paketo.yml`) on every merge to main. Never build or attach
  zip/exe/deb packages.
- There is no linter or formatter on main.

## Hard rules
1. **Outputs and templates.** Never change on your own initiative the `templates/` files or what the app writes into
   Excel/Word: ΗΚΑΙ/ΗΚΑΛ, Ημερήσια Διαταγή (.docx), Υπηρεσίες/ΦΡΟΥΡΑ, Εξοδούχοι, Δυναμολόγιο; headings, columns, fonts,
   capitals, signatures, print layout, pagination. An output may change only as part of a feature Michael asked for;
   the PR says which outputs change. Never update a snapshot (`vitest -u`) or loosen an output test to make a PR pass.
2. Everything the app writes into Excel is in CAPITALS. Dates are shown dd/mm/yyyy. Seat codes are exact (e.g. `Θ1α`).
3. **Frozen data contracts** (users upgrade in place; breaking one loses data or settings):
   - `data/ilh.db`: tables, `SCHEMA_VERSION`, `KV_KEYS`/`KV_ENTRIES` (`src/main/db.ts`) and the undo patch format
     (actions of the previous version must stay undoable). A new KV key is added, never renamed or removed.
   - Files `data/meta.json`, `sources.json`, `forms.json`, `flags.json`, folder `data/Πρότυπα εντύπων`,
     backups `data/backups/ilh_YYYY-MM-DD_*.db`, folders `GrafeioIlis`, `Έγγραφα\Γραφείο Ίλης`, USB backup copies.
   - localStorage keys `grafeio.prefs`, `grafeio.nav`, `grafeio.people`, `grafeio.recent`, `grafeio.quickAdd`.
   - Auto-update: release file names and the manifest format `src/main/update.ts` reads (old versions must update;
     breaking it once forced users to install by hand, #236).
   - Existing keyboard shortcuts and Ctrl+K commands. The worker entry `src/main/worker.ts` (`scripts/build.mjs`).
4. **Platform limits (Win7 / Electron 22).** Syntax can be modern (transpiled); built-in APIs are NOT transpiled:
   use only what exists in V8 10.8 / Node 16.
   - Forbidden in `src/main`, `src/shared`, `src/preload` (`test/node16.test.ts`): `toSorted`, `toReversed`,
     `toSpliced`, `findLast`/`findLastIndex`, `structuredClone`, `fetch`. Use `[...a].sort()` etc.
   - Avoid everywhere (no test checks these): `with`, `Object.groupBy`/`Map.groupBy`, Set methods (`union`...),
     `Promise.withResolvers`, `Array.fromAsync`.
   - No CSS nesting (needs Chromium 112).
   - No new heavy runtime dependency (2 GB RAM, Atom): measure the size and justify it. ExcelJS is heavy and is
     loaded only in `src/main/excel.ts`.
5. Never delete, skip or loosen a test, and never remove a feature or setting, unless Michael asked for it.

## Architecture
```
src/shared/     pure rules and types shared by main + renderer (domain.ts types, commands.ts = every user action
                with undo, rules, dates, ΗΚΑΙ, outs, duty); no fs, Electron, React or htm imports
                dutyGrid.ts + dutyUnit.ts = monthly duty grid of ANOTHER unit (detection, code vocabulary, profile → unitCodes/unitOut overlay)
                unitLists.ts + listMap.ts = lists of ANOTHER unit: services as a vertical list, outs/leaves side by side, room lists with VLOOKUP (detection, matching, write plans, screen model)
                rosterUnit.ts + rosterUnitWrite.ts = roster (Δυναμολόγιο) of ANOTHER unit: master list + derived lists, mixed cadre/soldiers, own words (reading, screen model, write plan; used only when the binding has own:true)
                dutyOnce.ts + dutyOnceAsk.ts = «Μετρά για 1»: a person with 2+ duties on one day counts 1 when the user says so (state.dutyOnce, kv «dutyOnce»): person keys, counting, whom the screen asks (renderer/dutyOnce.ts = dialog and 1/2 toggle)
                weaponUnit.ts = weapons file of ANOTHER unit read into the registry (assets.ts): sheets, columns, type/place words, plan «Τι θα αλλάξει» (READ only, never writes their file; command importWeapons)
src/main/       main.ts (entry, IPC handlers), db.ts (sql.js database), xlsx.ts (own Excel engine), exports.ts
                (ΦΡΟΥΡΑ/ΗΚΑΙ/Εξοδούχοι forms), hdDocx.ts (Word ΗΔ), print.ts, sources.ts (unit Excel files),
                worker.ts + offload.ts (Excel work off the main thread), update.ts + updater.ts,
                formPreview.ts (on-screen preview = the produced file through the print layout; printSetup is shared with the print window),
                tplLists.ts (fill + screen model of those lists; fillFroura / fillOuts call it when a saved mapping matches the file)
                formEdit.ts (structure of ANOTHER unit's services list in the output copy: remove blocks, add an app service or a state list where asked with the look of an existing block, tidy separators/formulas; called by tplLists.ts when the mapping has show:'remove' or add)
src/preload/    preload.ts (IPC bridge), print.ts
src/renderer/   app.ts (shell, nav, shortcuts), screens/*.ts (one per screen; dutyMap.ts, listMap.ts, rosterMap.ts = «Αντιστοίχιση…» dialogs; weaponMap.ts = the same for a weapons file, opened from Οπλισμός › Μητρώο όπλων › Ενέργειες; assets.ts = the Μητρώο όπλων and Υλικό tabs, RegistryView), store.ts, realPreview.ts (RealPreview: pages of the real export file), mockApi.ts, styles.css
templates/      the official .xlsx templates (rule 1)
```
- The renderer never imports from `src/main`; it reaches main only through the preload API (`src/shared/api.ts`).
- Colours are tokens in `src/renderer/styles.css` (`test/contrast.test.ts` checks both themes).
- Branch `rewrite` (paused) restructures this code into another layout with its own CLAUDE.md. Never base main work
  on it and never merge it: the `rewrite` -> main merge is Michael's only.

## Workflow
- PRs target main, one concern each. Michael's standing rule (13/10): merge your own PR only when it is rebased on
  latest main and typecheck, test and build pass; then report it.
- WHEN a PR moves, renames or creates a file or folder this file names -> DO update this file in the same PR.

## Replies to Michael
Michael's rule (25/11), verbatim: "Before you write any direct response to me, ensure it is written in ASD-STE100
Simplified Technical English, do not use techno-babble of any kind, do not physicalize things, always use the
simplest turn of phrase, no need for synonymous phrases for variety, and use active voice."
- It applies to replies in Greek too (Michael writes Greek; reply in Greek): the same plain rules, outcome first.

## Subagent model selection
When spawning subagents (Agent tool), pick the cheapest model that can do the job. Default to Sonnet when unsure.
- **Haiku**: bulk mechanical work with no judgment: renames, format conversions, simple grep/glob lookups,
  mechanical refactors.
- **Sonnet**: scoped research and synthesis: code exploration, "where is X used", tests for a known function.
- **Opus**: only when the task needs planning, design tradeoffs or non-obvious judgment.
- This does not change the thread rule: Opus plans, Sonnet 5.5 implements after Michael approves.
- Guardrails: a Haiku subagent never spawns further subagents (if it needs to, it returns to its parent to re-scope);
  max spawn depth is 2; a subagent that needs a smarter model returns to its parent with a summary and never
  escalates itself.
- Brief a subagent like a colleague: goal, context, expected output shape, length cap.

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
