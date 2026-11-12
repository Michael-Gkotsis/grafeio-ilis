// State of the «ανανέωση από Excel» dialog of the sheet kinds: the choices, the duty-check month and the plan.
// Purpose: `useSheetImport`, the hooks of `SheetImportDialog`, in the order the dialog always called them.
// Does NOT: draw anything (ui/sections/SheetImportDialog.tsx) or build the plan (model/sheetPlan.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order and
//   `useMemo` dependencies are unchanged.
// Covering test: test/settings-sources-view.test.ts, test/screens-dialogs-forms.test.ts.
import { useEffect, useMemo, useState } from 'react';
import type { SourceBook } from '../../../../shared/api';
import { sheetMonth, type ListKind, type SourceBinding } from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { sheetPlan } from './sheetPlan';
import { prevMonth } from './sourcesView';

type Keys = { keys: string[]; base: Record<string, string> };

/**
 * Everything `SheetImportDialog` reads and calls.
 * @param list - the sheet kind
 * @param book - the Excel file as read by the main process
 * @param b - the binding to read with
 * @param onClose - closes the dialog (also after a successful import)
 * @returns the choices, `busy`, the duty-check `month`, `del`, the `sheet` and the plan `res` (null while the sheet is
 *   missing), and `go`
 */
export function useSheetImport(list: ListKind, book: SourceBook, b: SourceBinding, onClose: () => void) {
  const { state, today, refresh } = useStore();
  const toast = useToast();
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);
  const sheet = book.sheets.find((x) => x.name === b.sheet);
  const [month, setMonth] = useState(
    () => (sheet && list === 'duties' && sheetMonth(sheet, b.header, today)) || b.month || prevMonth(today),
  );
  // Duty check: which cells the app already saw (what the sergeant deleted in the app since does not come back).
  const cur = state.settings.sources?.[list];
  const sameTable = !!cur && cur.file === b.file && cur.sheet === b.sheet && cur.header === b.header;
  const [synced, setSynced] = useState<string[]>([]);
  const [meta, setMeta] = useState<Keys>({ keys: [], base: {} });
  // Cadres: statuses removed from the Excel are removed from the app too.
  const [del, setDel] = useState(true);
  useEffect(() => {
    const load = async () => {
      const x = await window.api.srcKeys(list);
      setSynced(x.keys);
      setMeta(x);
    };
    if ((list === 'duties' || list === 'cadres' || list === 'cadreAbs') && sameTable) load();
  }, [list, sameTable]);
  const res = useMemo(
    () => sheetPlan(list, sheet, { b, state, choices, month, today, bookName: book.name, synced, meta, del }),
    [sheet, list, b, state, choices, month, today, book.name, synced, meta, del],
  );
  const go = async () => {
    if (!sheet || !res) return;
    setBusy(true);
    try {
      const r = await window.api.srcApply(
        list,
        list === 'duties' && month !== sheetMonth(sheet, b.header, today) ? { ...b, month } : b,
        res.cmd,
        res.keys,
      );
      if (!r.ok) {
        toast({ text: r.error });
        return;
      }
      await refresh();
      onClose();
      toast({ text: r.text });
    } finally {
      setBusy(false);
    }
  };
  return { choices, setChoices, busy, month, setMonth, del, setDel, sheet, res, go };
}
