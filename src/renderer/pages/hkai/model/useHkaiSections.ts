// State of the «Ενότητες της ΗΚΑΙ» card: the switches and the vehicle and «Προβλέπονται» fields being typed.
// Purpose: `useHkaiSections`, the hooks of `HkaiSectionsCard`, in the order the card always called them.
// Does NOT: draw anything (ui/HkaiSectionsCard.tsx) or hold the number rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useState } from 'react';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { HK_SECTIONS, hkToggle, type HkaiSettings, type HkSection, type HkVehicle } from '../../../../shared/domain';
import { HK } from '../../../../shared/unit';
import { vehicleOf } from './view';

/**
 * @returns the store `state`, `toast`, the saved settings `cur`, the typed vehicle `veh` and provided numbers `prov`
 *   (with their setters), `save`, `toggle`, and whether each of the two is `vehDirty` / `provDirty`
 */
export function useHkaiSections() {
  const { state, run } = useStore();
  const toast = useToast();
  const cur: HkaiSettings = state.settings.hkai || {};
  const [veh, setVeh] = useState<HkVehicle>(() => vehicleOf(cur));
  const [prov, setProv] = useState<Record<string, number>>(() => ({ ...(cur.prov || {}) }));
  const save = (hkai: HkaiSettings, text: string) =>
    run({ t: 'setSettings', settings: { hkai }, text: HK() + ', ' + text }, false);
  const toggle = async (k: HkSection, on: boolean) => {
    const name = HK_SECTIONS.find((x) => x[0] === k)![1];
    if (await save(hkToggle(cur, k, on), (on ? 'άνοιξε: ' : 'έκλεισε: ') + name.toLowerCase())) {
      toast({ text: (on ? 'Άνοιξε: ' : 'Έκλεισε: ') + name });
    }
  };
  const vehDirty = JSON.stringify(veh) !== JSON.stringify(vehicleOf(cur));
  const provDirty = JSON.stringify(prov) !== JSON.stringify(cur.prov || {});
  return { state, toast, cur, veh, setVeh, prov, setProv, save, toggle, vehDirty, provDirty };
}
