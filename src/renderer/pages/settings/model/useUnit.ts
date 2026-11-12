// State of the «Μονάδα και έντυπα» card: the form, the save and the unsaved-changes registration.
// Purpose: `useUnit`, the hooks of `SettingsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/sections/SettingsCard.tsx) or hold the rules (model/unitView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); hook order is
//   unchanged.
// Covering test: test/settings-unit-view.test.ts, test/screens-settings-guide.test.ts.
import { useState } from 'react';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { unitDirty, unitFormOf, unitSavePlan, withUnitKind, type UnitForm } from './unitView';
import type { UnitKind } from '../../../../shared/unit';

/**
 * Everything `SettingsCard` reads and calls.
 * @returns `state`, `boot`, `toast`, the form `s` with its setter `setS`, `setKind` and `save` (resolves to the new
 *   state or `null` when the command was refused)
 */
export function useUnit() {
  const { state, run, boot } = useStore();
  const toast = useToast();
  const [s, setS] = useState<UnitForm>(() => unitFormOf(state.settings));
  const dirty = unitDirty(s, unitFormOf(state.settings));
  const setKind = (k: UnitKind) => setS(withUnitKind(s, k));
  const save = async () => {
    const { patch, text } = unitSavePlan(s, state.settings);
    const ok = await run({ t: 'setSettings', settings: patch, text }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι ρυθμίσεις' });
    return ok;
  };
  usePending(dirty, { label: 'Μονάδα και έντυπα', save, discard: () => setS(unitFormOf(state.settings)) });
  return { state, boot, toast, s, setS, setKind, save };
}
