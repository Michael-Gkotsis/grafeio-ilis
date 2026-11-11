// State and actions of the «Γραμμές (βαθμοί)» card.
// Purpose: `useHkRowsState` reads the settings, works out which ranks count in which row (and how many people are there today)
// and holds the form, the error and the rename in progress; `hkRowsActions` are the plain functions the buttons call
// (rename, add or change, delete, pick a rank). The hooks run in the order they did in the single component.
// Does NOT: draw anything (ui/HkRowsCard.tsx).
// Owner layer: renderer/features/hk-rows. Why: moved verbatim from screens/hkrows.ts (Phase 5.3b).
// Covering test: test/unit.test.ts, test/ux-names.test.ts.
import { useMemo, useState } from 'react';
import { guessHk, hkRowsOf, itemKey, listOf, optionsOf, type HkRowDef } from '../../../../shared/ranks';
import { hkaiCounts, hkRankOf } from '../../../../shared/rules';
import { HK, hkRowLabel, hkRowName } from '../../../../shared/unit';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/** The two groups of rows: key, title, and the text of the total line. */
export const GROUPS: ['off' | 'nco', string, string][] = [
  ['off', 'Αξιωματικοί', 'ΣΥΝΟΛΟ ΑΞΚΩΝ'],
  ['nco', 'Οπλίτες', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ'],
];

/** The «Νέα γραμμή» form. `edit` is the name of the row being changed, or null for a new one. */
export type HkForm = { name: string; grp: 'off' | 'nco'; after: string; ranks: string[]; edit: string | null };

/** The empty form. */
export const EMPTY: HkForm = { name: '', grp: 'off', after: '', ranks: [], edit: null };

/** A rename in progress: the row key and the name being typed. */
export type HkRen = { key: string; name: string } | null;

/** Everything the card draws and the actions read. */
export function useHkRowsState() {
  const { state, run, today } = useStore();
  const toast = useToast();
  const lists = state.settings.lists || {};
  const own: HkRowDef[] = lists.hkRows || [];
  const names = lists.hkNames || {};
  const R = hkRowsOf(lists);
  const st = state.settings;
  const [f, setF] = useState<HkForm>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [ren, setRen] = useState<HkRen>(null);
  // κάθε βαθμός (των λιστών και όσων υπάρχουν ήδη) στη γραμμή όπου μετρά: στελέχη με τη «Γραμμή» τους, στρατιώτες από τον βαθμό
  const cadreRanks = useMemo(
    () =>
      optionsOf(
        listOf(lists, 'cadreRanks'),
        state.cadreList.map((c) => c.rank),
      ),
    [lists, state.cadreList],
  );
  const soldierRanks = useMemo(
    () =>
      optionsOf(
        listOf(lists, 'soldierRanks'),
        state.people.filter((p) => p.active).map((p) => p.rank),
      ),
    [lists, state.people],
  );
  // προελεύσεις: μια δική σου γραμμή μπορεί να μαζεύει και όλους μιας προέλευσης (π.χ. ΣΜΥ)
  const origins = useMemo(
    () =>
      optionsOf(listOf(lists, 'origins'), [
        ...state.cadreList.map((c) => c.origin),
        ...state.people.map((p) => p.origin),
      ]),
    [lists, state.cadreList, state.people],
  );
  const ranksOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (row: string, r: string) => {
      if (!m.has(row)) m.set(row, new Set());
      m.get(row)!.add(r);
    };
    for (const r of cadreRanks) add(guessHk(r, lists), r);
    for (const r of soldierRanks) add(hkRankOf(r, lists), r);
    for (const o of origins) {
      const r = hkRankOf('ΣΤΡ', lists, o);
      if (r !== hkRankOf('ΣΤΡ', lists)) add(r, o + ' ΣΤΡ');
    }
    return m;
  }, [cadreRanks, soldierRanks, origins, lists]);
  const counts = useMemo(() => hkaiCounts(state, today).rank, [state, today]);
  const allRanks = useMemo(
    () => optionsOf(f.grp === 'off' ? cadreRanks : [...soldierRanks, ...cadreRanks, ...origins], []),
    [f.grp, cadreRanks, soldierRanks, origins],
  );
  return { run, toast, own, names, R, st, f, setF, err, setErr, ren, setRen, ranksOf, counts, allRanks };
}

/** What `useHkRowsState` returns. */
export type HkState = ReturnType<typeof useHkRowsState>;

/** «Προσθήκη γραμμής» / «Αποθήκευση»: checks the name, then saves the new or changed row. */
async function hkSubmit(
  d: HkState,
  save: (rows: HkRowDef[], text: string) => Promise<unknown>,
  taken: (name: string, except: string | null) => boolean,
) {
  const { toast, own, R, f, setF, setErr } = d;
  const name = f.name.trim().replace(/\s+/g, ' ');
  if (!name) {
    setErr('Γράψε το όνομα της γραμμής, π.χ. Λοχαγοί');
    return;
  }
  if (taken(name, f.edit)) {
    setErr('Υπάρχει ήδη γραμμή «' + name + '»');
    return;
  }
  const row: HkRowDef = {
    name,
    grp: f.grp,
    ...(f.after ? { after: f.after } : {}),
    ...(f.ranks.length ? { ranks: f.ranks } : {}),
  };
  const rows = f.edit
    ? own.map((x) => (x.name === f.edit ? row : x.after === f.edit ? { ...x, after: name } : x))
    : [...own, row];
  if (
    await save(rows, (f.edit ? 'άλλαξε η ' : 'νέα ') + name + (f.ranks.length ? ' (' + f.ranks.join(', ') + ')' : ''))
  ) {
    toast({
      text:
        (f.edit ? 'Άλλαξε η γραμμή ' : 'Μπήκε η γραμμή ') +
        name +
        '. Θα γραφτεί στην ' +
        HK() +
        ' κάτω από τους ' +
        hkRowLabel(f.after || (f.grp === 'off' ? R.off : R.nco).slice(-1)[0]) +
        '.',
    });
    setF(EMPTY);
    setErr(null);
  }
}

/** The plain functions behind the buttons of the card. Each saves with `setHkRows` and shows its toast as before. */
export function hkRowsActions(d: HkState) {
  const { run, toast, own, names, R, st, f, setF, setErr, ren, setRen } = d;
  const save = async (rows: HkRowDef[], text: string, nm?: Record<string, string>) =>
    run({ t: 'setHkRows', rows, ...(nm ? { names: nm } : {}), text: 'γραμμές της ' + HK() + ': ' + text }, false);
  // ίδιο όνομα με άλλη γραμμή (όπως φαίνεται τώρα ή στον λόχο) ή «ΣΥΝΟΛΟ»
  const taken = (name: string, except: string | null) => {
    const k = itemKey(name);
    return (
      /ΣΥΝΟΛΟ/.test(k) ||
      [...R.off, ...R.nco].some(
        (r) => r !== except && [r, hkRowName(r, 'lochos'), hkRowLabel(r, st)].some((x) => itemKey(x) === k),
      )
    );
  };
  const rename = async () => {
    if (!ren) return;
    const name = ren.name.trim().replace(/\s+/g, ' ');
    const base = hkRowName(ren.key, st.unitKind === 'lochos' ? 'lochos' : 'ili');
    if (name && taken(name, ren.key)) {
      setErr('Υπάρχει ήδη γραμμή «' + name + '»');
      return;
    }
    const nm = { ...names };
    if (!name || name === base) delete nm[ren.key];
    else nm[ren.key] = name;
    if (await save(own, nm[ren.key] ? base + ' → ' + name : base + ': το αρχικό όνομα', nm)) {
      toast({
        text: nm[ren.key]
          ? 'Η γραμμή ' + base + ' θα γράφεται «' + name + '» στην εφαρμογή και στην ' + HK() + '.'
          : 'Η γραμμή ' + base + ' πήρε ξανά το αρχικό της όνομα.',
      });
      setRen(null);
      setErr(null);
    }
  };
  const submit = () => hkSubmit(d, save, taken);
  const drop = async (name: string) => {
    const x = own.find((y) => y.name === name)!;
    if (
      await save(
        own.filter((y) => y.name !== name).map((y) => (y.after === name ? { ...y, after: x.after } : y)),
        'σβήστηκε η ' + name,
      )
    )
      toast({
        text:
          'Σβήστηκε η γραμμή ' +
          name +
          '. Όσοι μετρούσαν εκεί γυρνούν στη γραμμή του βαθμού τους (Ctrl+Z για αναίρεση).',
      });
  };
  const edit = (x: HkRowDef) => {
    setErr(null);
    setF({ name: x.name, grp: x.grp, after: x.after || '', ranks: x.ranks || [], edit: x.name });
  };
  const toggleRank = (r: string) =>
    setF({ ...f, ranks: f.ranks.includes(r) ? f.ranks.filter((x) => x !== r) : [...f.ranks, r] });
  const groupRows = (g: 'off' | 'nco') => (g === 'off' ? R.off : R.nco).filter((r) => r !== f.edit);
  return { rename, submit, drop, edit, toggleRank, groupRows };
}
