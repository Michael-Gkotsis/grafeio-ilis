# Phase 0 performance baseline

Measured at git commit `21b7d93d20b81d710e66409b648d95f029afffc6` (branch claude/project-thread-efmuyf = rewrite + test-only commits; `src/` and `templates/` are identical to main 2bf8769, working tree clean for app code), 2026-11-09.

Machine: Intel(R) Xeon(R) Processor @ 2.30GHz, 4 cores, 16086 MB RAM, Linux 6.18.44-fc-v310, node v22.23.4, Electron 22.3.27 (Chromium 108). Display: Xvfb.
Each timing is the median over 5 full runs of each bench (the min–max column is the run-to-run spread). The numbers are only comparable on a similar machine, never with the Atom/Win7 PC of the unit. This is a shared cloud VM: the UI timings below ~100 ms jitter by 20–100% between runs, so compare medians of several runs, not one run.

Reproduce: `node bench/collect.mjs --runs 5 --out new.json` then `npm run bench:compare -- new.json` (exit 1 if a timing is >5% slower and >2 ms slower). Machine-readable data: `bench/baseline/phase0.json`.

## Headline numbers

| Metric | Median | Min–max | Note |
|---|---|---|---|
| Boot to first screen (Electron, CPU x4) | 836 | 798–1093 | UI-redesign thread quoted 1131 ms for main 2bf8769 on its machine |
| Boot, data ready to first screen | 341 | 325–508 |  |
| Eager renderer JS (KB, raw) | 1030.4 | 1030.4–1030.4 | quoted 1.05 MB; lazy chunks are not counted |
| Eager renderer JS (KB, gzip) | 343.6 | 343.6–343.6 |  |
| JS heap after all screens (MB) | 21 | 13–23 | quoted ~25 MB; varies with GC timing |
| Peak RSS of bench:full (MB) | 226.0 | 211.6–229.8 | node process, not Electron |

Eager chunks before first paint (from `dist/renderer/index.html`; no modulepreload): `assets/index-BrhwKSUI.js` 1030.4 KB raw / 343.6 KB gzip; `assets/index-CWUtVx-W.css` 125.2 KB raw / 22.9 KB gzip. Lazy (dynamic import) chunks: `diag-DTptALAH.js`, `guide-CU5MQdyM.js`, `mockApi-DvAhdByj.js`, `reports-DE74Lggt.js`, `settings-2O7xuCKm.js`.

## Files in dist/

| File | Raw bytes | Gzip bytes | Eager |
|---|---|---|---|
| dist/main/excel.js | 1209328 | 355390 |  |
| dist/main/main.js | 1037539 | 314263 |  |
| dist/main/sql-wasm.wasm | 655300 | 321568 |  |
| dist/main/worker.js | 635181 | 201349 |  |
| dist/preload/preload.js | 4237 | 1089 |  |
| dist/preload/print.js | 417 | 189 |  |
| dist/renderer/assets/diag-DTptALAH.js | 5874 | 2743 |  |
| dist/renderer/assets/guide-CU5MQdyM.js | 216795 | 56995 |  |
| dist/renderer/assets/index-BrhwKSUI.js | 1055149 | 351845 | yes |
| dist/renderer/assets/index-CWUtVx-W.css | 128251 | 23459 | yes |
| dist/renderer/assets/mockApi-DvAhdByj.js | 23363 | 9446 |  |
| dist/renderer/assets/reports-DE74Lggt.js | 132596 | 42057 |  |
| dist/renderer/assets/settings-2O7xuCKm.js | 154831 | 46468 |  |
| dist/renderer/icon.png | 17117 | 17106 |  |
| dist/renderer/index.html | 627 | 423 |  |
| dist/renderer/logo.svg | 982 | 425 |  |

## Bundle sizes (npm run build, dist/)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| renderer eager JS (raw) | 1030.4 | 1030.4–1030.4 | KB |
| renderer eager JS (gzip) | 343.6 | 343.6–343.6 | KB |
| renderer eager JS+CSS (raw) | 1155.7 | 1155.7–1155.7 | KB |
| renderer eager JS+CSS (gzip) | 366.5 | 366.5–366.5 | KB |
| renderer total (raw) | 1694.9 | 1694.9–1694.9 | KB |
| renderer total (gzip) | 538.0 | 538.0–538.0 | KB |
| main total (raw) | 3454.4 | 3454.4–3454.4 | KB |
| main total (gzip) | 1164.6 | 1164.6–1164.6 | KB |
| preload total (raw) | 4.5 | 4.5–4.5 | KB |
| preload total (gzip) | 1.3 | 1.3–1.3 | KB |

## Memory

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| bench:full peak RSS | 226.0 | 211.6–229.8 | MB |

## UI in Electron 22 (npm run bench:ui: CPU x4, 180 people, 120 days; median of 3 clicks per run)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| boot ως την πρώτη οθόνη | 836 | 798–1093 | ms |
| boot: από τα δεδομένα ως την πρώτη οθόνη | 341 | 325–508 | ms |
| οθόνη Σήμερα | 11 | 10–14 | ms |
| οθόνη Δυναμολόγιο | 79 | 57–90 | ms |
| Δυναμολόγιο › Λίστα | 97 | 90–104 | ms |
| Δυναμολόγιο › Ημερολόγιο κωλυομένων | 519 | 513–595 | ms |
| οθόνη Στελέχη | 46 | 38–65 | ms |
| οθόνη Υπηρεσίες | 84 | 82–106 | ms |
| Υπηρεσίες › Θέσεις | 31 | 23–46 | ms |
| Υπηρεσίες › Έλεγχος υπηρεσιών | 59 | 50–64 | ms |
| Υπηρεσίες › Ποιος κάνει τι | 108 | 85–112 | ms |
| Υπηρεσίες › Εξαιρέσεις | 27 | 23–42 | ms |
| οθόνη Εξοδούχοι | 109 | 82–118 | ms |
| οθόνη Ιατρικά | 28 | 22–32 | ms |
| οθόνη Δύναμη | 44 | 34–80 | ms |
| οθόνη ΗΚΑΙ | 187 | 153–207 | ms |
| ΗΚΑΙ › ΗΚΑΙ | 165 | 160–198 | ms |
| ΗΚΑΙ › Ποινές | 22 | 20–32 | ms |
| ΗΚΑΙ › Άδειες | 22 | 21–23 | ms |
| ΗΚΑΙ › Αιτήσεις | 28 | 23–37 | ms |
| ΗΚΑΙ › Ημερήσια Διαταγή | 11 | 9–19 | ms |
| οθόνη Οπλισμός | 195 | 153–251 | ms |
| Οπλισμός › Όπλα | 141 | 130–161 | ms |
| Οπλισμός › Κινήσεις | 30 | 23–41 | ms |
| οθόνη Έντυπα | 29 | 29–37 | ms |
| Έντυπα › Τα έντυπά μου | 15 | 15–18 | ms |
| Έντυπα › Πρότυπα | 11 | 10–13 | ms |
| οθόνη Σημειώσεις | 40 | 34–47 | ms |
| οθόνη Ρυθμίσεις | 83 | 75–103 | ms |
| μετά από εντολή (statuses): Σήμερα | 34 | 29–47 | ms |
| μετά από εντολή (people): Δυναμολόγιο | 100 | 94–116 | ms |
| μετά από εντολή (guards): Υπηρεσίες › Θέσεις | 27 | 25–41 | ms |
| μετά από εντολή (guards): Υπηρεσίες › Έλεγχος | 30 | 26–38 | ms |
| μετά από εντολή (guards): Υπηρεσίες › Ποιος | 29 | 26–36 | ms |
| μετά από εντολή (statuses): Εξοδούχοι | 46 | 32–55 | ms |
| μετά από εντολή (statuses): ΗΚΑΙ | 29 | 24–37 | ms |
| μετά από εντολή (people): Οπλισμός › Όπλα | 43 | 35–62 | ms |
| σφάλματα σελίδας | 0 | 0–0 | n |
| μνήμη JS (MB) | 21 | 13–23 | MB |

## UI "Νέο έντυπο" (npm run bench:ui:reports: Electron, CPU x4, 300 people)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| Έντυπα (Ctrl+E) | 65 | 57–68 | ms |
| + Νέο έντυπο | 201 | 181–255 | ms |
| έτοιμο: Ονομαστική κατάσταση (βήμα 4) | 162 | 124–197 | ms |
| βήμα 3 | 164 | 148–215 | ms |
| (κλικ χωρίς αλλαγή: χρόνος του Playwright) | 65 | 61–77 | ms |
| πλήκτρο στον τίτλο | 47 | 36–57 | ms |
| άνοιγμα λίστας στήλης | 153 | 135–246 | ms |
| διάλεξε Συνδυασμός | 158 | 140–227 | ms |
| στήλη: Ιατρικό τη μέρα | 314 | 297–375 | ms |
| πλήκτρο σε επικεφαλίδα | 45 | 41–49 | ms |
| + Πίνακας | 196 | 165–216 | ms |
| πίνακας 2: Καταστάσεις | 327 | 294–369 | ms |
| βήμα 4 | 230 | 170–263 | ms |
| βήμα 4: πίνακας 1 | 208 | 157–233 | ms |
| φίλτρο στο βήμα 4 | 149 | 128–177 | ms |
| βήμα 5 | 145 | 120–158 | ms |
| πλήκτρο στο όνομα | 50 | 42–55 | ms |

## Core rules and Excel micro-benchmarks (npm run bench)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| day 91: db KB | 364 | 364–364 | KB |
| day 91: autofill | 6.2 | 6.1–6.5 | ms |
| day 91: outs | 0.2 | 0.2–0.3 | ms |
| day 91: commit | 0.8 | 0.7–0.9 | ms |
| day 91: audit+flush | 1.8 | 1.7–1.9 | ms |
| day 91: ipc-ser | 0.5 | 0.5–0.5 | ms |
| day 182: db KB | 608 | 608–608 | KB |
| day 182: autofill | 7.2 | 6.7–9.7 | ms |
| day 182: outs | 0.5 | 0.4–0.6 | ms |
| day 182: commit | 1.2 | 1.1–1.4 | ms |
| day 182: audit+flush | 2.2 | 1.9–2.3 | ms |
| day 182: ipc-ser | 0.7 | 0.5–0.8 | ms |
| day 335: db KB | 1024 | 1024–1024 | KB |
| day 335: autofill | 8.9 | 8.2–9.2 | ms |
| day 335: outs | 0.7 | 0.6–0.8 | ms |
| day 335: commit | 2.1 | 1.8–2.2 | ms |
| day 335: audit+flush | 3 | 2.6–3.1 | ms |
| day 335: ipc-ser | 0.9 | 0.8–0.9 | ms |
| db size KB | 1096 | 1096–1096 | KB |
| open/load | 26.3 | 21.7–27.7 | ms |
| dutyStats cold | 0.8 | 0.7–1.2 | ms |
| strengthOf | 1.1 | 1.1–1.3 | ms |
| hkaiCounts | 1.1 | 1–1.1 | ms |
| preflight froura | 1.8 | 1.6–3.1 | ms |
| preflight hkai | 1.9 | 1.8–2 | ms |
| preflight outs | 0.2 | 0.2–0.3 | ms |
| fillDay (next day) | 12.2 | 10.8–12.6 | ms |
| boot (full) payload KB | 560 | 560–560 | KB |
| boot (full) serialize | 3.6 | 3.5–3.9 | ms |

## Full-app benchmark (npm run bench:full, node, 180 people)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| χτίσιμο κατάστασης | 1125.3 | 1083.9–1146.5 | ms |
| apply:autofill (τελευταίες 20) | 7.9 | 7.6–8 | ms |
| apply:declare (τελευταίες 20) | 0.3 | 0.2–0.3 | ms |
| apply:weaponOut (τελευταίες 20) | 0.1 | 0.1–0.1 | ms |
| apply:weaponIn (τελευταίες 20) | 0.1 | 0.1–0.1 | ms |
| apply:addRequest (τελευταίες 20) | 0.1 | 0.1–0.1 | ms |
| apply:addCadreAbs (τελευταίες 20) | 0.2 | 0.1–0.2 | ms |
| apply:outs (τελευταίες 20) | 0.4 | 0.4–0.4 | ms |
| apply:decideRequest (τελευταίες 20) | 0.4 | 0.4–0.4 | ms |
| apply autofill αύριο | 1.1 | 1–1.2 | ms |
| apply assign μία θέση | 0.2 | 0.1–0.2 | ms |
| apply declare άδεια | 0.5 | 0.4–0.5 | ms |
| apply updatePerson τηλέφωνο | 0.6 | 0.5–0.7 | ms |
| apply outs 60 άτομα | 0.6 | 0.5–0.7 | ms |
| apply weaponOut 10 | 0.1 | 0.1–0.2 | ms |
| dutyStats κρύο | 0.9 | 0.8–1.2 | ms |
| dutyStats ζεστό | 0 | 0–0.1 | ms |
| monthStats | 0.4 | 0.4–0.6 | ms |
| dutyMonths | 0.1 | 0.1–0.1 | ms |
| strengthOf κρύο | 2 | 1.8–2.6 | ms |
| strengthOf ζεστό | 0.8 | 0.7–0.8 | ms |
| hkaiCounts | 1.3 | 1.3–1.4 | ms |
| whyAll (αύριο) | 2.2 | 1.8–2.8 | ms |
| fairAvg | 0.5 | 0.5–0.8 | ms |
| returnsOn | 0.5 | 0.5–1.5 | ms |
| outsAndStay | 6.3 | 5.9–6.8 | ms |
| capCells όλοι × στήλες | 3.9 | 3.3–4.6 | ms |
| preflight froura | 0.8 | 0.6–1.3 | ms |
| preflight hkai | 2.6 | 2.2–3.3 | ms |
| preflight outs | 0.2 | 0.2–0.3 | ms |
| preflight check | 0 | 0–0 | ms |
| fillDay αύριο | 0.8 | 0.6–1.4 | ms |
| fillDay 7 μέρες | 4.1 | 3.5–5.6 | ms |
| commit πρώτο (όλη η κατάσταση) | 38.5 | 36.2–45.7 | ms |
| commit μετά από autofill | 1.8 | 1.2–4.3 | ms |
| addAudit+flush | 2.8 | 2–8 | ms |
| flush βάσης | 2.4 | 1.5–3.3 | ms |
| άνοιγμα βάσης | 24.4 | 20.2–27.8 | ms |
| boot serialize | 2.6 | 2.6–3.6 | ms |
| boot deserialize | 2.2 | 2.2–3.3 | ms |
| reply serialize (autofill) | 0.1 | 0.1–0.2 | ms |
| reply serialize (statuses) | 0.7 | 0.6–0.9 | ms |
| ΦΡΟΥΡΑ (1η) | 48.4 | 45.7–61.1 | ms |
| ΦΡΟΥΡΑ | 10.6 | 9.2–12.2 | ms |
| ΗΚΑΙ (1η) | 33.1 | 27.8–36.7 | ms |
| ΗΚΑΙ | 17.8 | 15.6–18.3 | ms |
| Εξοδούχοι (1η) | 42 | 39.3–44.8 | ms |
| Εξοδούχοι | 31.4 | 28.9–32.6 | ms |
| ΦΡΟΥΡΑ ΠΣΚ (3 φύλλα) (1η) | 22.4 | 20.9–28.4 | ms |
| ΦΡΟΥΡΑ ΠΣΚ (3 φύλλα) | 22 | 18.8–25.3 | ms |
| Έλεγχος υπηρεσιών μήνα (1η) | 157.1 | 140.9–189 | ms |
| Έλεγχος υπηρεσιών μήνα | 115.9 | 106.2–126.1 | ms |
| Λίστες Δυναμολογίου (1η) | 62.7 | 58–72.5 | ms |
| Λίστες Δυναμολογίου | 55.6 | 48.1–58 | ms |
| Δυναμικό στελεχών (1η) | 9.1 | 6.8–10 | ms |
| Δυναμικό στελεχών | 8.3 | 6.8–10 | ms |
| Δυναμολόγιο εκτύπωση (1η) | 47.5 | 42.5–48.6 | ms |
| Δυναμολόγιο εκτύπωση | 43.5 | 37.9–47.5 | ms |
| Οπλισμός (1η) | 96.3 | 93–105.2 | ms |
| Οπλισμός | 94.9 | 89.6–99.3 | ms |
| zipHash ΗΚΑΙ (1η) | 1.9 | 1.8–2.1 | ms |
| zipHash ΗΚΑΙ | 1.9 | 1.8–3.6 | ms |
| valuesHash ΗΚΑΙ (1η) | 3 | 2.7–3.3 | ms |
| valuesHash ΗΚΑΙ | 2.8 | 2.5–2.9 | ms |
| regenForms 4 έντυπα (χωρίς αλλαγή) (1η) | 59.2 | 57.9–65 | ms |
| regenForms 4 έντυπα (χωρίς αλλαγή) | 58.5 | 54.9–62.2 | ms |
| Προεπισκόπηση εκτύπωσης ΗΚΑΙ (1η) | 22.4 | 21.2–24.2 | ms |
| Προεπισκόπηση εκτύπωσης ΗΚΑΙ | 9.8 | 8.9–10.7 | ms |
| Προεπισκόπηση εκτύπωσης Δυναμολογίου (1η) | 16.6 | 14.7–18.3 | ms |
| Προεπισκόπηση εκτύπωσης Δυναμολογίου | 15 | 12.9–17.5 | ms |
| Νέο Δυναμολόγιο 9 φύλλα | 242.3 | 199–254.5 | ms |
| readBook Δυναμολόγιο (1η) | 10.6 | 9.8–11.4 | ms |
| readBook Δυναμολόγιο | 9.5 | 8.9–10.9 | ms |
| autoCheck 9 ειδών | 20.1 | 19–27.4 | ms |
| writeGroup αλλαγή τηλεφώνου (9 είδη) | 108.9 | 104–134.1 | ms |
| writeGroup νέο ιατρικό (6 είδη καταστάσεων) | 24 | 20.9–25.6 | ms |

## Reports engine (npm run bench:reports)

| Metric | Median | Min–max | Unit |
|---|---|---|---|
| candidates (1η) | 1 | 1–1 | ms |
| candidates | 0.3 | 0.2–0.4 | ms |
| rowsOf (1η) | 0 | 0–1 | ms |
| rowsOf | 0.3 | 0.2–0.4 | ms |
| απλό: buildTemplate (1η) | 24 | 23–37 | ms |
| απλό: buildTemplate | 5.5 | 4.4–8.4 | ms |
| απλό: moreRows (1η) | 0 | 0–0 | ms |
| απλό: moreRows | 0 | 0–0 | ms |
| απλό: fillReport (1η) | 60 | 58–80 | ms |
| απλό: fillReport | 29.7 | 28.5–46.1 | ms |
| απλό: previewReport (120) (1η) | 30 | 28–32 | ms |
| απλό: previewReport (120) | 16.7 | 14.9–17.5 | ms |
| απλό: inspectTemplate (1η) | 6 | 5–9 | ms |
| απλό: inspectTemplate | 3.5 | 3.3–4 | ms |
| απλό: renderBook 1 σελίδα (1η) | 39 | 36–51 | ms |
| απλό: renderBook 1 σελίδα | 21.7 | 20–25.6 | ms |
| απλό: renderBook auto (1η) | 12 | 11–28 | ms |
| απλό: renderBook auto | 12.7 | 11.5–13.7 | ms |
| πολλές στήλες + 2ος πίνακας: buildTemplate (1η) | 5 | 5–6 | ms |
| πολλές στήλες + 2ος πίνακας: buildTemplate | 4.1 | 3.7–4.4 | ms |
| πολλές στήλες + 2ος πίνακας: moreRows (1η) | 1 | 1–1 | ms |
| πολλές στήλες + 2ος πίνακας: moreRows | 0.5 | 0.5–0.6 | ms |
| πολλές στήλες + 2ος πίνακας: fillReport (1η) | 87 | 81–88 | ms |
| πολλές στήλες + 2ος πίνακας: fillReport | 73.6 | 67.2–87.2 | ms |
| πολλές στήλες + 2ος πίνακας: previewReport (120) (1η) | 38 | 36–39 | ms |
| πολλές στήλες + 2ος πίνακας: previewReport (120) | 38.3 | 37.8–41.2 | ms |
| πολλές στήλες + 2ος πίνακας: inspectTemplate (1η) | 4 | 4–6 | ms |
| πολλές στήλες + 2ος πίνακας: inspectTemplate | 4.1 | 3.9–4.4 | ms |
| πολλές στήλες + 2ος πίνακας: renderBook 1 σελίδα (1η) | 56 | 40–60 | ms |
| πολλές στήλες + 2ος πίνακας: renderBook 1 σελίδα | 44.8 | 38.7–53.4 | ms |
| πολλές στήλες + 2ος πίνακας: renderBook auto (1η) | 48 | 37–61 | ms |
| πολλές στήλες + 2ος πίνακας: renderBook auto | 26.2 | 23.5–27.9 | ms |

Not measured: Windows 7 / Intel Atom / 2 GB RAM (no such machine here); the "-1" results of bench:ui (tab or input not on that screen) are dropped.
