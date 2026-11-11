// State of the penalty-text dialog.
// Purpose: `usePunText` (who punished, when, why), the ready text and the save command, plus `copyRich`.
// Does NOT: draw anything (ui/PunTextDialog.tsx does) or word the text (shared/punish.ts `punText` does).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-dialogs-forms.test.ts, test/punish.test.ts.
import { useMemo, useState } from 'react';
import type { Status } from '../../../../shared/domain';
import { overMax, punBySuggestions, punDays, punText } from '../../../../shared/punish';
import { personMap } from '../../../../shared/rules';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/**
 * Copies the penalty text with its formatting (the duration is underlined) so it pastes into Word.
 * Falls back to plain text through the clipboard API.
 * @returns whether something was copied
 */
export function copyRich(htmlStr: string, plain: string): boolean {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.innerHTML = htmlStr;
  div.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap';
  document.body.appendChild(div);
  const r = document.createRange();
  r.selectNodeContents(div);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  sel.removeAllRanges();
  div.remove();
  if (!ok && navigator.clipboard) {
    navigator.clipboard.writeText(plain).catch(() => undefined);
    ok = true;
  }
  return ok;
}

/** All the state and derived data `PunTextDialog` draws from. */
export type PunTextModel = ReturnType<typeof usePunText>;

export function usePunText(st: Status) {
  const { state, run } = useStore();
  const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const [f, setF] = useState({ by: st.by || '', reason: st.reason || '', on: st.on || st.from });
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const t = punText(
    p,
    { ...st, by: f.by.trim() || undefined, reason: f.reason.trim() || undefined, on: f.on },
    state.settings.lists,
  );
  const max = overMax(st.kind, punDays(st), state.settings.lists);
  const dirty = f.by !== (st.by || '') || f.reason !== (st.reason || '') || f.on !== (st.on || st.from);
  const save = async () =>
    dirty ? run({ t: 'setPunInfo', id: st.id, by: f.by, reason: f.reason, on: f.on }, false) : true;
  return { p, f, setF, byList, t, max, dirty, save, toast };
}
