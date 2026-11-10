// Heading keys of the print engine.
//
// Purpose: `sortKey` (heading text to a key: no accents, capitals, letters and digits only) and `normHead` (the same,
//   letters only).
// Does NOT: sort anything (sort.ts and tables.ts do).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: options.ts needs `sortKey` to clean the saved sort levels and sort.ts needs the options; this small file keeps
//   that free of an import cycle (Phase 4.8a, verbatim).
// Covering test: test/print-sort.test.ts.

/** Heading key without accents, capitals, spaces and punctuation (letters only): "Ο/Σ" gives "ΟΣ". */
export const normHead = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-ZΑ-Ω]/g, '');

/** Heading key of a column for sorting: no accents, capitals, only letters and digits ("Ο/Σ" gives "ΟΣ"). */
export const sortKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-ZΑ-Ω0-9]/g, '');
