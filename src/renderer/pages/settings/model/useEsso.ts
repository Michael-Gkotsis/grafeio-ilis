// State of the «ΕΣΣΟ» and «Επαναφορά ΕΣΣΟ» cards: the archive list, the correction of the current ΕΣΣΟ and the dialogs.
// Purpose: `useEsso`, the hooks of `EssoCards`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/EssoCards.tsx) or run the wizard (model/useNewEsso.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-esso-view.test.ts, test/screens-settings-guide.test.ts.
import { useEffect, useState } from 'react';
import { currentEsso, essoName, type Esso } from '../../../../shared/esso';
import type { EssoArchiveInfo, EssoInfo, EssoResult } from '../../../../shared/api';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/** What the wizard hands back when the new ΕΣΣΟ was started. */
export type EssoStarted = Extract<EssoResult, { ok: true }>;

/**
 * Everything `EssoCards` reads and calls.
 * @returns the store `state` and `today`, the archive `info` (null until loaded or when it failed), the correction
 *   form (`edit`), the three dialogs (`wiz`, `done`, `restore`) with their setters, the current ΕΣΣΟ (`cur`) with the
 *   stored one (`own`), `load`, `saveEdit` and `pick` («Διάλεξε φάκελο…»)
 */
export function useEsso() {
  const { state, run, today } = useStore();
  const toast = useToast();
  const [info, setInfo] = useState<EssoInfo | null>(null);
  const [edit, setEdit] = useState<Esso | null>(null);
  const [wiz, setWiz] = useState(false);
  const [done, setDone] = useState<EssoStarted | null>(null);
  const [restore, setRestore] = useState<EssoArchiveInfo | null>(null);
  const load = async () => {
    try {
      setInfo(await window.api.essoInfo());
    } catch {
      setInfo(null);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const cur = currentEsso(state);
  const own = state.settings.essos;
  const saveEdit = async () => {
    if (!edit) return;
    if (
      await run({
        t: 'setSettings',
        settings: { essos: { ...(own || {}), s: edit.s, y: edit.y } },
        text: 'ΕΣΣΟ ' + essoName(edit),
      })
    )
      setEdit(null);
  };
  const pick = async () => {
    const r = await window.api.essoPick();
    if (!r) return;
    if ('ok' in r) {
      toast({ text: r.error });
      return;
    }
    setRestore(r);
  };
  return {
    state,
    today,
    info,
    edit,
    setEdit,
    wiz,
    setWiz,
    done,
    setDone,
    restore,
    setRestore,
    cur,
    own,
    load,
    saveEdit,
    pick,
  };
}
