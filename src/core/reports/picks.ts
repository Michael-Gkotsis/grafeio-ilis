// The pick of a report: the defaults, the change of kind and the summary text.
//
// Purpose: `defaultPick`, `pickForKind` (what a pick keeps when the kind changes), `newTable` and `pickText` (the
//   summary shown in the list).
// Does NOT: choose the rows (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/weapons,
//   core/reports/conds, core/reports/kinds, core/reports/options.
// Why: a pick is saved in the report, so every way of creating or changing one must produce the same shape, and the
//   summary must describe exactly the filters that apply.
// Covering tests: test/report-blank.test.ts, test/report-stnew.test.ts, test/reports-tables.test.ts,
//   test/report-blank-more.test.ts.
import { TYPES } from '../model/status';
import { everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { WEAPON_FILTERS } from '../weapons/weaponInfo';
import type { Report, RepKind, RepPick, RepCond, RepSort, RepTable } from '../model/reportTypes';
import { condGroups, condsOf, REP_CONDS } from './conds';
import { blankN, manualKind, BLANK_ROWS, isLinked, sortsOf } from './kinds';
import { DEF_CATS, ST_CATS } from './options';

/** The default pick: everyone; for 'random', 10 of the present who have no duty. */
export const defaultPick = (mode: RepPick['mode'] = 'all'): RepPick =>
  mode === 'random'
    ? { from: 'all', need: ['present'], not: ['duty'], mode, n: 10, even: false }
    : { from: 'all', mode };
/** A summary for the list of forms: «57 τυχαίοι από τους παρόντες». */
export function pickText(
  r: Pick<Report, 'kind' | 'pick'> & Pick<Partial<Report>, 'src'>,
  s: Pick<AppState, 'settings'>,
): string {
  if (r.kind === 'blank') {
    const n = blankN(r.pick.n, r.src),
      mine = n + (n === 1 ? ' γραμμή' : ' γραμμές') + ' που γράφεις εσύ';
    return r.src ? (r.src === 'cadre' ? 'Στελέχη' : 'Στρατιώτες') + ' από φίλτρο' + (n ? ' και ' + mine : '') : mine;
  }
  const pk = r.pick;
  const who = r.kind === 'cadre' ? 'στελέχη' : r.kind === 'status' ? 'καταστάσεις' : 'στρατιώτες';
  if (r.kind === 'status') {
    const cats = pk.types?.length
      ? pk.types.map((t) => TYPES[t]?.label || t).join(', ')
      : (pk.cats?.length ? pk.cats : DEF_CATS)
          .map((c) => ST_CATS.find((x) => x.id === c)?.label.toLowerCase())
          .join(', ');
    const lead =
      pk.mode === 'random' ? (pk.n || 0) + ' τυχαίες' : pk.mode === 'first' ? 'Οι πρώτες ' + (pk.n || 0) : 'Όλες';
    return (
      lead +
      ' (' +
      cats +
      ') ' +
      (pk.when === 'new' ? 'που ξεκινούν τη μέρα' : pk.when === 'from' ? 'από τη μέρα και μετά' : 'που ισχύουν τη μέρα')
    );
  }
  const rest = [
    pk.view && 'λίστα «' + ((s.settings.views || []).find((v) => v.id === pk.view)?.name || '') + '»',
    pk.si?.length && 'Σ.Ι. ' + pk.si.join(', '),
    pk.rooms?.length && (pk.rooms.length === 1 ? 'θάλαμος ' : 'θάλαμοι ') + pk.rooms.join(', '),
  ]
    .filter(Boolean)
    .join(', ');
  const tail = rest ? ' (' + rest + ')' : '';
  if (r.kind === 'duty') {
    const bl = pk.blocks?.length
      ? pk.blocks
          .map((id) => everyBlock(s.settings).find((b) => b.id === id)?.name)
          .filter(Boolean)
          .join(', ')
      : '';
    return (bl ? 'Θέσεις: ' + bl : 'Όλες οι θέσεις υπηρεσίας') + (pk.empty ? ', και οι κενές' : '') + tail;
  }
  if (r.kind === 'wmove') return (pk.open ? 'Τα όπλα που είναι ακόμα έξω' : 'Οι κινήσεις όπλων της μέρας') + tail;
  if (r.kind === 'weapon') {
    const wf = WEAPON_FILTERS.find((x) => x[0] === (pk.wf || 'with'));
    return (
      (pk.mode === 'random' ? (pk.n || 0) + ' τυχαίοι: ' : '') + 'Οπλισμός, ' + (wf ? wf[1].toLowerCase() : '') + tail
    );
  }
  const cadre = r.kind === 'cadre';
  const gs = cadre || !pk.or?.length ? null : condGroups(pk); // groups of filters (OR)
  const { need, not } = cadre || gs ? { need: [] as RepCond[], not: [] as RepCond[] } : condsOf(pk);
  const pres = cadre
    ? pk.from === 'present'
    : gs
      ? gs.every((g) => g.need.includes('present'))
      : need.includes('present');
  const from =
    pk.from === 'inactive'
      ? 'τους εκτός δύναμης'
      : pres
        ? cadre
          ? 'τα παρόντα στελέχη'
          : 'τους παρόντες'
        : cadre
          ? 'όλα τα στελέχη'
          : 'όλους';
  const view = pk.view ? (s.settings.views || []).find((v) => v.id === pk.view)?.name : '';
  const word = (c: RepCond, yes: boolean) => {
    const x = REP_CONDS.find((k) => k.id === c)!;
    return (yes ? x.yes : x.no).toLowerCase();
  };
  const man = manualKind(r.kind);
  const gtxt = gs
    ? gs
        .map((g) => [
          ...g.need.filter((c) => !pres || c !== 'present').map((c) => word(c, true)),
          ...g.not.map((c) => word(c, false)),
        ])
        .map((w) => (w.length === 1 ? w[0] : w.length ? '(' + w.join(' και ') + ')' : 'όλοι'))
        .join(' ή ')
    : '';
  const extra = [
    view && 'λίστα «' + view + '»',
    gtxt,
    ...need.filter((c) => c !== 'present').map((c) => word(c, true)),
    pk.si?.length && 'Σ.Ι. ' + pk.si.join(', '),
    pk.rooms?.length && (pk.rooms.length === 1 ? 'θάλαμος ' : 'θάλαμοι ') + pk.rooms.join(', '),
    ...not.map((c) => word(c, false)),
    !cadre && pk.stNew && 'μόνο όσα δηλώθηκαν τη μέρα',
    pk.mode === 'random' && pk.gap
      ? 'όχι όσοι βγήκαν τις τελευταίες ' + (pk.gap === 1 ? 'μία μέρα' : pk.gap + ' μέρες')
      : '',
    man && pk.always?.length ? pk.always.length + ' πάντα μέσα' : '',
    man && pk.never?.length ? pk.never.length + ' ποτέ' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const head =
    pk.mode === 'random'
      ? (pk.n || 0) +
        ' τυχαίοι από ' +
        from +
        (pk.even ? ', ισομερώς ανά θάλαμο' : '') +
        (pk.fair ? ', πρώτα όσοι βγήκαν λιγότερο' : '')
      : pk.mode === 'first'
        ? 'Οι πρώτοι ' + (pk.n || 0) + ' από ' + from
        : from === 'όλους' || from === 'όλα τα στελέχη'
          ? 'Όλοι οι ' + who
          : 'Όλοι από ' + from;
  return head + (extra ? ' (' + extra + ')' : '');
}
/**
 * «Τι αφορά» changed: each kind keeps only its own filters; rooms, Σ.Ι. and the list stay in the kinds that have
 * soldiers.
 */
export function pickForKind(
  from: RepKind,
  pk: RepPick,
  sort: RepSort,
  kind: RepKind,
): { pick: RepPick; sort: RepSort } {
  const { cats, when, blocks, empty, wf, open, stNew, ...rest } = pk;
  const sn = stNew && (kind === 'people' || kind === 'weapon') ? { stNew } : {}; // soldier-filter kinds only
  const base = { ...rest, from: 'all' as const, noDuty: false };
  const pick: RepPick =
    kind === 'blank'
      ? { from: 'all', mode: 'all', n: from === 'blank' ? blankN(pk.n) : BLANK_ROWS }
      : kind === 'cadre'
        ? { from: pk.from === 'present' ? 'present' : 'all', mode: pk.mode, n: pk.n }
        : kind === 'status'
          ? { ...base, cats: cats || ['med', 'pun', 'abs'], when: when || 'on' }
          : kind === 'duty'
            ? { ...base, mode: 'all', blocks, empty }
            : kind === 'wmove'
              ? { ...base, mode: 'all', open }
              : kind === 'weapon'
                ? { ...rest, ...sn, from: isLinked(from) ? 'all' : rest.from, wf: wf || 'with' }
                : { ...rest, ...sn, from: isLinked(from) ? 'all' : rest.from };
  const so: RepSort =
    kind === 'blank'
      ? 'pick'
      : kind === 'duty'
        ? 'seat'
        : kind === 'wmove'
          ? 'from'
          : sortsOf(kind).some((x) => x.value === sort) && from !== 'blank'
            ? sort
            : kind === 'cadre'
              ? 'rank'
              : 'name';
  return { pick, sort: so };
}
/** A new table 2, 3…: everyone, without filters, in the order that fits the kind. */
export function newTable(kind: RepKind, id: string): RepTable {
  const x = pickForKind('people', defaultPick(), 'name', kind);
  return { id, kind, head: 1, cols: [], pick: x.pick, sort: x.sort };
}
