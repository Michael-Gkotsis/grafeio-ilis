// Rows and heading of the ΗΚΑΙ front page.
//
// Purpose: `addHkRows` (own rows of the user), `hkRowLabels` (the names of the rows) and `hkHead` (the heading above
//   the title).
// Does NOT: write the numbers or the back page (fillHkai in hkai.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: these steps change the shape of the front page before the numbers go in; they moved verbatim from
//   src/main/exports.ts (Phase 4.9a).
// Covering test: test/hkai.test.ts and test/hkai-auto.test.ts.
import type { AppState } from '../../../shared/domain';
import { itemKey, type HkRows } from '../../../shared/ranks';
import { formText, hkRowLabel } from '../../../shared/unit';
import { type Workbook, colName, unesc, type Sheet } from '../excel/xlsx';
import type { HkaiMap } from '../../../shared/sources';

/**
 * The own rows (ranks) of the user that the form does not have: a new row under the one the user chose, with the format
 * and the formulas of the one above (Σύνολο, impeded, absent, available), inside the total of the group. What is below
 * (totals, signatures, date) moves down one row, and the numbered lists at the side continue correctly. `need`: the row
 * has something to write (a basic row that the form lacks is added only then; the own rows of the user always).
 */
export function addHkRows(
  wb: Workbook,
  fr: Sheet,
  m: HkaiMap,
  R: HkRows,
  warnings: string[],
  need: (k: string) => boolean = () => true,
) {
  for (const group of [R.off, R.nco])
    group.forEach((key, i) => {
      if (m.rows[key] > 0) return;
      if (!R.own.has(key) && !need(key)) return;
      // under the previous one of the group; if all are missing above (e.g. Αρχιλοχίες), above the next one: the new
      // row goes under that one, with its formulas, and the two swap places (the names are written by hkRowLabels)
      const prev = group
        .slice(0, i)
        .reverse()
        .find((k) => m.rows[k] > 0);
      const next = prev ? undefined : group.slice(i + 1).find((k) => m.rows[k] > 0);
      if (!prev && !next) {
        warnings.push('Η γραμμή «' + key + '» δεν μπήκε στο έντυπο: δεν βρέθηκε άλλη γραμμή της ομάδας της');
        return;
      }
      const rowsNow = group.map((k) => m.rows[k]).filter((r) => r > 0);
      const after = m.rows[(prev || next)!],
        first = Math.min(...rowsNow),
        last = Math.max(...rowsNow),
        r = after + 1;
      fr.insertRows(after, 1, after, wb);
      for (const k in m.rows) if (m.rows[k] > after) m.rows[k]++;
      const down = (ref: string) =>
        ref.replace(/(\d+)$/, (_x, n: string) => String(Number(n) > after ? Number(n) + 1 : Number(n)));
      if (m.title) m.title = down(m.title);
      if (m.date) m.date = down(m.date);
      if (next) {
        m.rows[key] = after;
        m.rows[next] = r;
      } else m.rows[key] = r;
      // at the end of the group: the totals (SUM up to the last) reach the new row too, and the thick line below goes
      // to it
      if (after === last) {
        fr.growFormulas(fr.name, first, last, r);
        if (after - 1 >= first)
          for (const c of [...fr.cells()].filter((x) => x.r === after)) {
            const st = fr.style(colName(c.c) + (after - 1));
            if (st != null) fr.setStyle(colName(c.c) + after, st);
          }
      }
      // the formulas of the row above (relative references to its row), for the new row
      for (const c of [...fr.cells()].filter((x) => x.r === after)) {
        const f = fr.formula(colName(c.c) + after);
        if (!f) continue;
        fr.setFormula(
          colName(c.c) + r,
          unesc(f).replace(new RegExp('(?<![$\\d])([A-Z]{1,3})' + after + '(?!\\d)', 'g'), '$1' + r),
        );
      }
      // numbered lists at the side (e.g. ΜΕΤΑΒΟΛΕΣ: ΕΓΓΡΑΦΗΚΑΝ 1, 2, 3...): the new row gets the next number
      for (const c of [...fr.cells()].filter((x) => x.r === after)) {
        const L = colName(c.c),
          num = (row: number) => {
            const v = (fr.get(L + row) || '').trim();
            return /^\d+$/.test(v) && !fr.formula(L + row) ? Number(v) : null;
          };
        const k = num(after);
        if (k == null) continue;
        let n = k + 1;
        fr.set(L + r, String(n));
        for (let x = r + 1; num(x) === n; x++) fr.set(L + x, String(++n));
      }
    });
}

/**
 * The names of the rows: in the company the officers (Ταγματάρχες, Λοχαγοί...) and the own rows of the user. If even
 * one changes, all are written (in capitals, like everything the app writes) so that they look the same in the column;
 * otherwise the form stays as it is.
 */
export function hkRowLabels(fr: Sheet, m: HkaiMap, rows: string[], s: AppState) {
  const at = (r: number) =>
    ['A', 'B', 'C', 'D'].find((c) => {
      const v = (fr.get(c + r) || '').trim();
      return v && !/^[\d.,]+$/.test(v) && !fr.formula(c + r);
    });
  const todo = rows
    .filter((k) => m.rows[k] > 0)
    .map((k) => ({ r: m.rows[k], col: at(m.rows[k]) || at(m.rows[k] - 1) || 'A', label: hkRowLabel(k, s.settings) }));
  if (todo.every((x) => itemKey(fr.get(x.col + x.r) || '') === itemKey(x.label))) return;
  for (const x of todo) fr.set(x.col + x.r, x.label);
}

/**
 * The heading of the ΗΚΑΙ: the 2 rows above the "ΚΑΤΑΣΤΑΣΗ", in the column of the title. Only if the user wrote it in
 * the Settings or in the ΗΚΑΙ; otherwise the one of the form stays. In the company with the words of the company, like
 * the whole form.
 * @decision Michael 18/10: the heading of the ΗΚΑΙ comes from the Settings.
 */
export function hkHead(fr: Sheet, m: HkaiMap, s: AppState) {
  const head = (s.settings.hkai?.head || []).map((x) => (x || '').trim());
  const t = /^([A-Z]+)(\d+)$/.exec(m.title);
  if (!t || !head.some(Boolean) || Number(t[2]) < 3) return;
  head.slice(0, 2).forEach((x, i) => {
    if (x) fr.set(t[1] + (Number(t[2]) - 3 + i), formText(s.settings, x));
  });
}
