// State and actions of the cadre dialog.
// Purpose: `useCadreForm` holds the option lists, the form fields, the touched-row flag and the save, for `CadreDialog`.
// Does NOT: draw anything. Every hook of the dialog is called here, in the order the dialog had them.
// Owner layer: renderer/features/cadre-edit. Why: moved verbatim from CadreDialog's body (Phase 5.3c).
// Covering test: test/cadre.test.ts, test/dialog-cases.test.ts.
import { useMemo, useState } from 'react';
import { EPOP_ROWS, isEpop } from '../../../../shared/rules';
import { listOf, optionsOf, rankTxt } from '../../../../shared/ranks';
import type { Cadre } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { useDirty, useToast } from '../../../shared/ui';

/** The state of the dialog and its actions. */
export function useCadreForm(c: Partial<Cadre>, onClose: () => void) {
  const { run, state } = useStore();
  const toast = useToast();
  const lists = state.settings.lists;
  const ranks = useMemo(
    () =>
      optionsOf(
        listOf(lists, 'cadreRanks'),
        state.cadreList.map((x) => x.rank),
      ),
    [state.cadreList, lists],
  );
  const specs = useMemo(
    () =>
      optionsOf(
        listOf(lists, 'specs'),
        state.cadreList.map((x) => x.spec || ''),
      ),
    [state.cadreList, lists],
  );
  const eids = useMemo(
    () =>
      optionsOf(
        [],
        state.cadreList.map((x) => x.eid || ''),
      ),
    [state.cadreList],
  );
  const wtypes = useMemo(() => optionsOf(listOf(lists, 'weaponTypes'), [c.wtype || '']), [lists, c.wtype]);
  const origins = useMemo(
    () =>
      optionsOf(listOf(lists, 'origins'), [
        ...state.cadreList.map((x) => x.origin),
        ...state.people.map((p) => p.origin),
      ]),
    [state.cadreList, state.people, lists],
  );
  const [f, setF] = useState({
    rank: c.rank || '',
    origin: c.origin || '',
    hk: c.hk || 'Λοχίες',
    spec: c.spec || '',
    eid: c.eid || '',
    last: c.last || '',
    first: c.first || '',
    am: c.am || '',
    phone: c.phone || '',
    role: c.role || '',
    active: c.active ?? true,
    monthMax: c.monthMax as number | undefined,
    wtype: c.wtype || '',
    weapon: c.weapon || '',
    rack: c.rack || '',
    wpos: c.wpos || '',
  });
  // ΕΠΟΠ/ΟΒΑ (Michael, 21/10): πόσες υπηρεσίες τον μήνα· με όριο μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι
  const duty = isEpop({ rank: f.rank, origin: f.origin }, lists) || EPOP_ROWS.includes(f.hk) || !!c.monthMax;
  const [hkTouched, setHkTouched] = useState(!!c.id);
  const dirty = useDirty(f);
  const save = async () => {
    if (await run({ t: 'saveCadre', cadre: { ...f, id: c.id } }, false)) {
      onClose();
      toast({
        text:
          (c.id ? 'Αποθηκεύτηκε: ' : 'Προστέθηκε: ') +
          rankTxt({ rank: f.rank, origin: f.origin }).toUpperCase() +
          ' ' +
          f.last.toUpperCase() +
          (c.id && c.active !== f.active ? (f.active ? ', σε δύναμη' : ', εκτός δύναμης') : ''),
      });
    }
  };
  return { lists, ranks, specs, eids, wtypes, origins, f, setF, duty, hkTouched, setHkTouched, dirty, save };
}

/** What `useCadreForm` returns. */
export type CadreFormModel = ReturnType<typeof useCadreForm>;
