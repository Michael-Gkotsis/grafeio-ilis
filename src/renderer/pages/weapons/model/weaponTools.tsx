// Small actions of the «Οπλισμός» screen that need no hook: the Excel export, «Καθάρισε», and the type for all.
// Purpose: `weaponTools(...)`: `exportXl`, `clear`, `noType`, `typeAll`, `fLabel`, `empty`.
// Does NOT: hold state (the hooks of useWeapons.ts do) or draw anything but the export toast.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import type { Sig } from '../../../../shared/sigs';
import { WEAPON_FILTERS, weaponKey } from '../../../../shared/weapons';
import type { WeaponBase } from './useWeaponBase';
import type { WeaponList } from './useWeaponList';
import type { WeaponSelection } from './useWeaponSelection';
import type { SaveWeapons } from './useWeaponSave';
import { emptyText } from './view';

/** The small actions, built from the state of the other hooks. */
export function weaponTools(base: WeaponBase, selection: WeaponSelection, list: WeaponList, save: SaveWeapons) {
  const { nav, toast, date, today, filter, setXl, setQ } = base;
  const { setOnlySel } = selection;
  const { rows } = list;
  const exportXl = async (print: boolean, sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportWeapons(date, print, sigs);
      if (!r.ok)
        toast({
          text: (
            <span>
              <b>Δεν βγήκε.</b> {r.error}
            </span>
          ),
        });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print)
        toast({
          text:
            'Βγήκε ' +
            r.file.split(/[\\/]/).pop() +
            ': κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο.',
        });
    } finally {
      setXl(false);
    }
  };
  const clear = () => {
    setQ('');
    setOnlySel(false);
    nav.set({ wfilter: 'all', unit: 'all', room: null, wreason: null });
  };
  const fLabel = WEAPON_FILTERS.find(([k]) => k === filter)?.[1] ?? filter;
  // Type for everyone shown who has a weapon number but no type.
  const noType = rows.filter((p) => p.active && weaponKey(p.weapon) && !p.wtype);
  const typeAll = (t: string) => {
    if (t && noType.length)
      save(
        noType.map((p) => ({ pid: p.id, wtype: t })),
        {
          what: 'τύπος ' + t,
          msg: 'Τύπος ' + t + ' σε ' + noType.length + (noType.length === 1 ? ' άτομο' : ' άτομα') + ' χωρίς τύπο',
        },
      );
  };
  const empty = emptyText(filter, date, today);
  return { exportXl, clear, fLabel, noType, typeAll, empty };
}
