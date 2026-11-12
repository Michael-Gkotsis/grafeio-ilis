// Pure rules of the «Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν» card: sections, counts and each button's change.
// Purpose: `statView` helpers for `useStat` and their test; every change is a `StatChange` (the new config or lists,
//   the history text and the toast), so the hook only saves it.
// Does NOT: render anything, touch React or call `run` (model/useStat.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/stat.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-stat-view.test.ts.
import type { AppState, BlockDef, TypeKey } from '../../../../shared/domain';
import { TYPES } from '../../../../shared/domain';
import { punLbl } from '../../../../shared/punish';
import { itemKey, listRows, live, type ListItem, type UserLists } from '../../../../shared/ranks';
import { statusesOn } from '../../../../shared/rules';
import {
  STAT_MED,
  STAT_TXT,
  statCellOf,
  statDefault,
  statOutOf,
  statRebase,
  statRowKey,
  statRowOf,
  type StatCell,
  type StatConfig,
} from '../../../../shared/stat';
import { HK } from '../../../../shared/unit';
import type { DutyCol } from './dutyCols';

/** The three choices of a cell and their labels. */
export const OPTS: [StatCell, string][] = [
  ['yes', '✓ Ναι'],
  ['last', '⚠ Αν δεν υπάρχει άλλος'],
  ['no', '✕ Όχι'],
];
/** ΗΚΑΙ column value of a medical that counts under «ΕΥ» (from the medicals only ΕΥ counts: the others are present). */
export const HK_EY = 'ey';

/** One row of the table: a base status (`own` empty) or an own medical / penalty kind. */
export interface StatRow {
  type: TypeKey;
  own: string;
  med?: ListItem;
}
/** A titled group of rows; `empty` groups show a hint when there is no row. */
export interface StatSection {
  title: string;
  rows: StatRow[];
  empty?: boolean;
}
/** What a button saves: the new config (`stat`) or whole lists (`next`), the history text and the toast. */
export interface StatChange {
  stat?: StatConfig;
  next?: UserLists;
  text: string;
  toast?: string;
}

/** Name of a row in texts: the penalty text, «Ποινή (όλες)», the own name, or the base label. */
export const rowName = (type: TypeKey, own: string) =>
  type === 'PUN' ? (own ? punLbl(own) : 'Ποινή (όλες)') : own || TYPES[type].label;
/** What an own row follows: «όλες τις ποινές» or «το ΕΑ». */
export const baseName = (type: TypeKey) => (type === 'PUN' ? 'όλες τις ποινές' : 'το ' + TYPES[type].label);
/** A kind written with letters and digits only, so «ΕΛ.ΓΥΜΝ» and «ΕΛ ΓΥΜΝ» are the same. */
export const medKey = (kind: string) => itemKey(kind).replace(/[^Α-ΩA-Z0-9]/g, '');

/** Base medicals, the own medicals (from «Λίστες») and the penalties (all, then each kind). */
export function statSections(lists: UserLists, cells: NonNullable<StatConfig['cells']>): StatSection[] {
  // «Μόνο σημείωση» medicals have nothing to set (Michael, 4/11).
  const meds = listRows(lists, 'medKinds').filter(
    (r) => !r.builtin && !r.hidden && r.like && STAT_MED.includes(r.like) && !r.note,
  );
  const puns = listRows(lists, 'punKinds').filter((r) => !r.hidden || cells[statRowKey('PUN', r.name)]);
  return [
    { title: 'Ιατρικά', rows: STAT_MED.map((t) => ({ type: t, own: '' }) as StatRow) },
    {
      title: 'Δικά σου ιατρικά (από τις Λίστες)',
      rows: meds.map((m) => ({ type: m.like as TypeKey, own: m.name, med: m }) as StatRow),
      empty: true,
    },
    {
      title: 'Ποινές',
      rows: [{ type: 'PUN', own: '' } as StatRow, ...puns.map((r) => ({ type: 'PUN', own: r.name }) as StatRow)],
    },
  ];
}

/** How many people in service have each status today; the row «Ποινή» counts every penalty. */
export function statCounts(state: AppState, today: string, lists: UserLists): Map<string, number> {
  const m = new Map<string, number>();
  const inc = (k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const p of state.people) {
    if (!p.active) continue;
    for (const s of statusesOn(live(state), p.id, today)) {
      const r = statRowOf(s, lists);
      if (!r) continue;
      inc(statRowKey(r.type, r.own));
      if (r.type === 'PUN' && r.own) inc('PUN');
    }
  }
  return m;
}

/** The medicals somebody already has: their base type (so their ΗΚΑΙ column) cannot change. */
export const usedMedicals = (statuses: AppState['statuses']): Set<string> =>
  new Set(statuses.filter((x) => STAT_MED.includes(x.type) && x.kind).map((x) => medKey(x.kind as string)));

/** A duty cell changed; a value equal to what would apply without the cell is not stored. */
export function cellChange(lists: UserLists, type: TypeKey, own: string, b: BlockDef, v: StatCell): StatChange {
  const cfg: StatConfig = lists.stat || {};
  const cells = cfg.cells || {};
  // What would apply without this cell: for an own medical or penalty its base type, else the default.
  const inherited = own ? statCellOf(lists, type, undefined, b).v : statDefault(TYPES[type], b);
  const k = statRowKey(type, own);
  const row = { ...(cells[k] || {}) };
  if (v === inherited) delete row[b.id];
  else row[b.id] = v;
  const next = { ...cells, [k]: row };
  if (!Object.keys(row).length) delete next[k];
  const who = rowName(type, own);
  return {
    stat: { ...cfg, cells: next },
    text: who + ' ' + STAT_TXT[v] + ' σε ' + b.name,
    toast: who + ': ' + STAT_TXT[v] + ' σε ' + b.name + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.',
  };
}

/** The «Έξοδος» tick changed. */
export function outChange(lists: UserLists, type: TypeKey, own: string, ok: boolean): StatChange {
  const cfg: StatConfig = lists.stat || {};
  const inherited = own ? statOutOf(lists, type).ok : !TYPES[type].noOut;
  const k = statRowKey(type, own);
  const next = { ...(cfg.out || {}) };
  if (ok === inherited) delete next[k];
  else next[k] = ok;
  const who = rowName(type, own);
  return {
    stat: { ...cfg, out: next },
    text: who + (ok ? ' βγαίνει' : ' δεν βγαίνει') + ' έξοδο',
    toast: who + (ok ? ' βγαίνει' : ' δεν βγαίνει') + ' έξοδο.',
  };
}

/** «Επαναφορά»: the row forgets its cells and its out setting. */
export function resetChange(lists: UserLists, type: TypeKey, own: string): StatChange {
  const cfg: StatConfig = lists.stat || {};
  const k = statRowKey(type, own);
  const nc = { ...(cfg.cells || {}) };
  delete nc[k];
  const no = { ...(cfg.out || {}) };
  delete no[k];
  return {
    stat: { ...cfg, cells: nc, out: no },
    text: rowName(type, own) + ': ' + (own ? 'όπως ' + baseName(type) : 'όπως στην αρχή'),
  };
}

/**
 * The ΗΚΑΙ column of an own medical: under ΕΥ (base type ΕΥ) or present (ΕΑΡΒ); its duties and out stay as shown.
 * @returns `null` when nothing changes (the same type, or the row is not an own medical)
 */
export function hkChange(lists: UserLists, r: StatRow, col: string, cols: DutyCol[]): StatChange | null {
  const to: TypeKey = col === HK_EY ? 'EY' : 'EARV';
  if (to === r.type || !r.med) return null;
  const txt = col === HK_EY ? 'στην ' + HK() + ' στους ΕΥ' : 'στην ' + HK() + ' παρών';
  return {
    next: statRebase(lists, r.own, to, cols),
    text: r.own + ' ' + txt,
    toast: r.own + ': ' + txt + '. Οι υπηρεσίες και η έξοδος μένουν όπως είναι.',
  };
}
