// State of the «Διάγνωση» screen: the `Diag` snapshot from main, refreshed every 3 s, and the speed-run step.
// Purpose: one hook so the markup only reads values. Hook order is the old component's (store, nav, two states,
//   effect).
// Does NOT: compute anything shown (model/view.ts does) or time screens (model/speedRun.ts does).
// Owner layer: renderer/pages/diag. Why: moved verbatim from screens/diag.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { useEffect, useState } from 'react';
import type { Diag } from '../../../../shared/api';
import { useNav, useStore } from '../../../shared/model';
import { runSpeed } from './speedRun';

/** The screen's data and its two actions (start the speed run, switch GPU acceleration). `d` is null until loaded. */
export function useDiag() {
  const { boot } = useStore();
  const nav = useNav();
  const [d, setD] = useState<Diag | null>(null);
  const [step, setStep] = useState('');
  const load = async () => setD(await window.api.diag());
  // polls from mount to unmount: main's numbers change on their own (memory, Excel writes)
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  /** The speed run ends back on this screen; `step` names the screen it is timing (empty when idle). */
  const startSpeed = () => {
    setStep('…');
    runSpeed(() => nav.go('diag'), setStep);
  };
  /** Turns GPU acceleration on or off; main restarts the app. */
  const toggleGpu = (on: boolean) => window.api.setGpu(on);
  return { boot, d, step, startSpeed, toggleGpu };
}

/** What {@link useDiag} returns. */
export type DiagModel = ReturnType<typeof useDiag>;
