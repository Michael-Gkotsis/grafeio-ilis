// State of the «πού βρίσκεται στο Excel» mapping dialog: the sheet, the header row and the column of each field.
// Purpose: `useMap`, the hooks of `MapDialog`, in the order the dialog always called them.
// Does NOT: draw anything (ui/sections/MapDialog.tsx, MapGrid.tsx) or hold the rules (model/mapView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order, `useMemo`
//   dependencies and the fresh empty sheet of a new tab are unchanged (they decide how often the sample is rebuilt).
// Covering test: test/settings-sources-view.test.ts, test/screens-dialogs-forms.test.ts.
import { useMemo, useState } from 'react';
import type { RawSheet } from '../../../../shared/roster';
import type { SourceBook } from '../../../../shared/api';
import {
  KIND,
  bestFor,
  bindingText,
  defaultBinding,
  fieldsOf,
  missingFields,
  suggestCols,
  tableRows,
  type ListKind,
  type SourceBinding,
} from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { colLabel, mapRange, mapSample, nextField, setColIn } from './mapView';
import { NEW_SHEET } from './sourcesView';

/**
 * Everything `MapDialog` reads and calls.
 * @param list - the kind being mapped
 * @param book - the Excel file as read by the main process
 * @param initial - the binding the dialog starts from
 * @param onSaved - called after the binding was saved, with whether to read the file next
 * @returns the binding `b` (with `setB`), the selected field `active`, the grid range, the `sample` lines, the `count`
 *   of records, the missing fields `miss`, and the actions `setCol`, `setSheet`, `setHeader`, `clickCell`, `save`
 */
export function useMap(
  list: ListKind,
  book: SourceBook,
  initial: SourceBinding,
  onSaved: (b: SourceBinding, andRead: boolean) => void,
) {
  const { state, refresh, today } = useStore();
  const toast = useToast();
  const [b, setB] = useState<SourceBinding>(() => ({ ...initial, cols: { ...initial.cols } }));
  const [active, setActive] = useState<string | null>(null);
  const [extra, setExtra] = useState(0);
  const fields = fieldsOf(list);
  const isNew = !book.sheets.some((s) => s.name === b.sheet);
  const sheet: RawSheet = book.sheets.find((s) => s.name === b.sheet) || { name: b.sheet, rows: [] };
  const sugg = useMemo(() => suggestCols(list, sheet, b.header), [list, sheet, b.header]);
  const miss = missingFields(list, b.cols);
  const { maxCol, from, to } = mapRange(sheet, b, extra);
  const setCol = (k: string, c: number | null) => setB((x) => ({ ...x, cols: setColIn(x.cols, k, c) }));
  const setSheet = (name: string) => {
    if (name === NEW_SHEET) {
      setB({ ...defaultBinding(list, book.file), write: b.write, scope: b.scope });
      return;
    }
    const sh = book.sheets.find((s) => s.name === name)!;
    const best = bestFor(list, [sh]);
    setB({ ...b, sheet: name, header: best ? best.header : 0, cols: best ? best.cols : {} });
  };
  const setHeader = (r: number) => setB({ ...b, header: r, cols: suggestCols(list, sheet, r) });
  const clickCell = (r: number, c: number) => {
    if (active) {
      setCol(active, c);
      setActive(nextField(fields, active, b.cols));
      return;
    }
    if (r === b.header) return;
  };
  const sample = useMemo(
    () => mapSample({ list, sheet, b, state, today, isNew, missing: miss.length }),
    [b, sheet, list, isNew, miss.length],
  );
  const count = useMemo(() => (isNew ? 0 : tableRows(sheet, b.header, b.cols).records.length), [b, sheet, isNew]);
  const save = async (andRead: boolean) => {
    const r = await window.api.srcSave(list, b);
    if (!r.ok) {
      toast({ text: r.error });
      return;
    }
    await refresh();
    toast({ text: KIND[list].label + ': ' + bindingText(b) });
    onSaved(b, andRead);
  };
  const colName = (c: number) => colLabel(sheet, b.header, c);
  const fieldAt = (c: number) => fields.find((f) => b.cols[f.k] === c);
  return {
    b,
    setB,
    active,
    setActive,
    setExtra,
    fields,
    isNew,
    sheet,
    sugg,
    miss,
    maxCol,
    from,
    to,
    setCol,
    setSheet,
    setHeader,
    clickCell,
    sample,
    count,
    save,
    colName,
    fieldAt,
  };
}
