// What the form template dialog shows about a template file: its sheets and, for the ΗΚΑΙ, where rows and columns are.
//
// Purpose: `formInfo` reads the template of a form (the bound one, or the file just picked) and answers the sheet
//   names, whether it is custom, and the sheet(s) to use (the saved ones, or the best guess by name).
// Does NOT: bind the template (`formSave`, ipc.ts), pick the file, or write anything.
// Owner layer: main (architecture), `features/forms`. Imports app/*, shared/*, `features/exports`, `features/commands`.
// Why: moved verbatim from main.ts (Phase 4.5). Called by the `formPick` and `formInfo` handlers only.
// Covering test: test/forms*.test.ts, test/hkai*.test.ts (detection); the Electron comparison in the PR description.
import path from 'path';
import type { FormInfo } from '../../../shared/api';
import { detectHkai, type FormKind } from '../../../shared/sources';
import { hkRowsOf } from '../../../shared/ranks';
import { normGreek } from '../../../shared/text';
import { store } from '../../app/state';
import { readBook } from '../../sources';
import { fail } from '../commands';
import { formBinding, formTpl } from '../exports';

/**
 * Sheets of a form template and (ΗΚΑΙ) where the rows and columns were found.
 * @param file a template just picked; without it, the bound template or the built-in one
 * @returns the info, or `{ ok: false, error }`; never throws.
 */
export async function formInfo(f: FormKind, file?: string): Promise<FormInfo | { ok: false; error: string }> {
  if (f === 'check') return { ok: true, file: '', custom: false, sheets: [], sheet: '' };
  try {
    const b = formBinding(f);
    const src = file || formTpl(f);
    const book = await readBook(src, 120, 40);
    const names = book.sheets.map((x) => x.name);
    const has = (n?: string) => (n && names.includes(n) ? n : undefined);
    const find = (re: RegExp) =>
      book.sheets.find(
        (x) =>
          re.test(normGreek(x.name)) ||
          x.rows.slice(0, 12).some((r) => (r || []).some((v) => typeof v === 'string' && re.test(normGreek(v)))),
      )?.name;
    const keep = !file || (b.file && path.resolve(b.file) === path.resolve(file));
    const custom = !!file || !!b.file;
    if (f === 'hkai') {
      const scored = book.sheets
        .map((x) => ({ x, d: detectHkai(x, store.state.settings.place) }))
        .sort((a, c) => c.d.found - a.d.found);
      const front = (keep && has(b.sheet)) || scored[0]?.x.name || names[0];
      const back =
        (keep && has(b.sheet2)) ||
        find(/ΑΠΟΦΑΣΕΙΣ|ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|ΦΡΟΥΡΕΣ/) ||
        names.find((n) => n !== front) ||
        front;
      const d = detectHkai(
        book.sheets.find((x) => x.name === front)!,
        store.state.settings.place,
        [...hkRowsOf(store.state.settings.lists).own],
        store.state.settings.lists?.hkNames,
      );
      if (keep && b.cells)
        d.map = {
          title: b.cells.title || d.map.title,
          date: b.cells.date || d.map.date,
          rows: { ...d.map.rows, ...(b.cells.rows || {}) },
          cols: { ...d.map.cols, ...(b.cells.cols || {}) },
        };
      return { ok: true, file: src, custom, sheets: names, sheet: front, sheet2: back, hkai: d };
    }
    if (f === 'outs')
      return {
        ok: true,
        file: src,
        custom,
        sheets: names,
        sheet: (keep && has(b.sheet)) || find(/ΕΞΟΔΟΥΧ/) || names[0],
        sheet2: (keep && has(b.sheet2)) || find(/ΠΑΡΑΜΕΝ/) || names[1] || names[0],
      };
    return {
      ok: true,
      file: src,
      custom,
      sheets: names,
      sheet: (keep && has(b.sheet)) || find(/ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ|ΦΡΟΥΡΑ/) || names[0],
    };
  } catch (e) {
    return fail(e);
  }
}
