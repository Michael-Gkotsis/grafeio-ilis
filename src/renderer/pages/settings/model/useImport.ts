// State of the «ανανέωση από Excel» dialog of the status kinds: the binding, the choices and the parsed diff.
// Purpose: `useImport`, the hooks of `ImportDialog`, in the order the dialog always called them.
// Does NOT: draw anything (ui/sections/ImportDialog.tsx) or hold the counts (model/importView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); hook order and
//   `useMemo` dependencies are unchanged.
// Covering test: test/settings-sources-view.test.ts, test/screens-dialogs-forms.test.ts.
import { useEffect, useMemo, useState } from 'react';
import type { SourceBook } from '../../../../shared/api';
import { diffStatuses, parseStatuses, type SourceBinding, type StatusKind } from '../../../../shared/sources';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { toggleKeepApp } from './importView';

type Keys = { keys: string[]; base: Record<string, string> };

/**
 * Everything `ImportDialog` reads and calls.
 * @param list - the status kind
 * @param book - the Excel file as read by the main process
 * @param initial - the binding the dialog starts from
 * @param onClose - closes the dialog (also after a successful import)
 * @returns `state`, the binding `b`, the choices for unmatched rows, `busy`, `del`, `keepApp`, the `sheet`, the
 *   `parsed` rows, the diff `d` and the unmatched candidates `all` (null while the sheet is missing), and `go`
 */
export function useImport(list: StatusKind, book: SourceBook, initial: SourceBinding, onClose: () => void) {
  const { state, today, refresh } = useStore();
  const toast = useToast();
  const [b, setB] = useState<SourceBinding>(initial);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(true);
  // Which records the Excel had last time (for the ones removed or whose «from» changed there) and how they looked
  // then (`base`), for the ones that changed on both sides.
  const [prev, setPrev] = useState<Keys>({ keys: [], base: {} });
  const [keepApp, setKeepApp] = useState<Set<string>>(new Set());
  const cur = state.settings.sources?.[list];
  const same = !!cur && cur.file === b.file && cur.sheet === b.sheet && cur.header === b.header;
  useEffect(() => {
    const load = async () => {
      setPrev(await window.api.srcKeys(list));
    };
    if (same) load();
    else setPrev({ keys: [], base: {} });
  }, [list, same]);
  const sheet = book.sheets.find((s) => s.name === b.sheet);
  const parsed = useMemo(
    () => (sheet ? parseStatuses(list, sheet, b, state.people, today, state.settings.lists) : null),
    [sheet, b, state.people, today, list, state.settings.lists],
  );
  const d = useMemo(
    () => (parsed ? diffStatuses(list, state, parsed, b, choices, prev.keys, prev.base, today) : null),
    [parsed, state, b, choices, list, prev, today],
  );
  const all = useMemo(() => (parsed ? parsed.cands.filter((c) => c.pid == null) : []), [parsed]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await window.api.srcImport(list, b, choices, !del, [...keepApp]);
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
  const toggleKeep = (id: string, on: boolean) => setKeepApp(toggleKeepApp(keepApp, id, on));
  return { state, b, setB, choices, setChoices, busy, del, setDel, keepApp, sheet, parsed, d, all, go, toggleKeep };
}
