// State of the «Νέα ΕΣΣΟ» wizard: the step, the chosen ΕΣΣΟ, the unit header, the folders, the roster file and the start.
// Purpose: `useNewEsso`, the hooks of `NewEssoWizard`, in the order the dialog always called them.
// Does NOT: draw the steps (ui/sections/NewEssoWizard.tsx, NewEssoSteps.tsx) or hold the text rules (essoView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); hook order is unchanged.
// Covering test: test/settings-esso-view.test.ts, test/screens-dialogs-shell.test.ts.
import { useState } from 'react';
import { currentEsso, essoName, nextEsso, parseEsso, type Esso } from '../../../../shared/esso';
import type { EssoInfo, ImportPreview } from '../../../../shared/api';
import { unitKindOf, type UnitKind } from '../../../../shared/unit';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { essoStartArgs, joinDir } from './essoView';
import type { EssoStarted } from './useEsso';

/** The unit header the wizard lets the sergeant correct (three header lines and the name in the report title). */
export type UnitForm = {
  unitKind: UnitKind;
  unit: [string, string, string];
  unitName: string;
};

/**
 * Everything `NewEssoWizard` reads and calls.
 * @param info - what the main process knows about the archive and the Excel files
 * @param onDone - called with the result once the new ΕΣΣΟ was started
 * @returns the store `today`, the current ΕΣΣΟ `cur`, the form (`step`, `e`, `u`, `root`, `dir`, `ros`, `ack`) with
 *   its setters, `busy`, `err`, the derived `same`, `target` and `rosEsso`, and `choose`, `pickRoster`, `start`
 */
export function useNewEsso(info: EssoInfo, onDone: (r: EssoStarted) => void) {
  const { state, refresh, today } = useStore();
  const toast = useToast();
  const cur = currentEsso(state);
  const [step, setStep] = useState(1);
  const [e, setE] = useState<Esso>(() => nextEsso(cur, today));
  // Where the unit is (Michael, 18/10): ίλη → ΗΚΑΙ, λόχος → ΗΚΑΛ; the header changes with it and is fixed here.
  const [u, setU] = useState<UnitForm>(() => ({
    unitKind: unitKindOf(state.settings),
    unit: [...state.settings.unit] as [string, string, string],
    unitName: state.settings.unitName,
  }));
  const [root, setRoot] = useState<string>(info.archiveRoot);
  // The sergeant's own folder for the new ΕΣΣΟ; null means newRoot\<name>.
  const [dir, setDir] = useState<string | null>(null);
  const [ros, setRos] = useState<ImportPreview | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const same = cur && cur.s === e.s && cur.y === e.y;
  const target = dir || joinDir(info.newRoot, essoName(e));
  const rosEsso = ros?.essos ? parseEsso(ros.essos) : null;
  const choose = async (def: string, set: (d: string) => void) => {
    const d = await window.api.essoDir(def);
    if (d) set(d);
  };
  const pickRoster = async () => {
    const r = await window.api.essoRoster();
    if (!r) return;
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr(null);
    setRos(r);
  };
  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await window.api.essoStart(essoStartArgs(e, root, dir, ros, u));
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      await refresh();
      toast({ text: 'Ξεκίνησε η ' + essoName(e) });
      onDone(r);
    } finally {
      setBusy(false);
    }
  };
  return {
    today,
    cur,
    step,
    setStep,
    e,
    setE,
    u,
    setU,
    root,
    setRoot,
    dir,
    setDir,
    ros,
    setRos,
    ack,
    setAck,
    busy,
    err,
    setErr,
    same,
    target,
    rosEsso,
    choose,
    pickRoster,
    start,
  };
}
