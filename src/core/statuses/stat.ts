// Per-duty rules of the medical statuses and penalties: which duties a status keeps a person out of, and whether it
// stops the out.
//
// Purpose: for ΕΥ, ΕΑ, ΕΟ, ΕΑΡΒ and the user's own medical kinds the user sets, per duty (one column per duty), yes /
//   only if there is nobody else / no, and whether they go out (Ρυθμίσεις › Υπηρεσίες). Penalties: one row for all and
//   one for each kind, initially in everywhere as before, never out. Only the user's changes live in lists.stat; the
//   default is the sergeant's rules as before (TYPES): ΕΥ no duty, ΕΑ/ΕΟ not armed, not kitchens, and sentry only if
//   nobody else, ΕΑΡΒ everywhere.
// Does NOT: store anything, or apply the result to a roster (core/duty and core/outs do).
// Owner layer: core/statuses (no fs, no Electron, no React).
// Why: one place answers "does this status keep this person from this duty / from going out" for the duty rules,
//   the outs, the Φρουρά lists and the declaration text.
// @decision Michael 13/10: duties per status in Ρυθμίσεις › Υπηρεσίες.
// @decision Michael 18/10: the user's own medical kind is configured only here (no «behaves like» in Λίστες): what is
//   not changed stays like its base type (the old ones like ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ, new ones without limits).
// @decision Michael 18/10: penalties, one row for all and one per kind; out never.
// Covering tests: test/stat.test.ts, test/stat-own.test.ts, test/own-kind.test.ts, test/own-leave-modes.test.ts.
import { TYPES, effects, type Status, type TypeDef, type TypeKey } from '../model/status';
import type { DutyKind } from '../model/duty';
import { itemKey, listRows } from '../people/ranks';
import { leaveMode, noDutyOf, noOutOf, ownMed } from '../people/kinds';
import type { UserLists, StatCell } from '../model/lists';
export type { StatConfig, StatCell } from '../model/lists';

/**
 * STEP (admission inside the camp) goes into no duty, so it is not here.
 * @decision Michael 13-14/10
 */
export const STAT_MED: TypeKey[] = ['EY', 'EA', 'EO', 'EARV'];
/** Rows of the Υπηρεσίες table: the medical types and the penalties. */
export const STAT_ROWS: TypeKey[] = [...STAT_MED, 'PUN'];
/** Greek text of each cell value, for the settings screen. */
export const STAT_TXT: Record<StatCell, string> = {
  yes: 'μπαίνει',
  last: 'μόνο αν δεν υπάρχει άλλος',
  no: 'δεν μπαίνει',
};
/** Storage key of a row in lists.stat: the type, or `type:ownName` for the user's own kind. */
export const statRowKey = (type: TypeKey, own?: string) => (own ? type + ':' + itemKey(own) : type);

/**
 * The row of a status: the user's own medical kind by its name, else the type (null: not configurable, e.g. leave).
 */
export function statRowOf(s: Pick<Status, 'type' | 'kind'>, lists?: UserLists): { type: TypeKey; own?: string } | null {
  if (!STAT_ROWS.includes(s.type)) return null;
  if (s.type === 'PUN') {
    // the penalty kind, base or own (and the hidden ones, for penalties that already exist)
    const k = itemKey(s.kind || '');
    const r = k ? listRows(lists, 'punKinds').find((x) => itemKey(x.name) === k) : undefined;
    return r ? { type: 'PUN', own: r.name } : { type: 'PUN' };
  }
  const m = ownMed(lists, s.kind);
  return m ? { type: s.type, own: m.name } : { type: s.type };
}
type Blk = { kind?: DutyKind; armed: boolean };
/** Default cell of a type on a duty: from the TYPES flags (noDuty, noArmed, light). */
export function statDefault(t: TypeDef, b: Blk): StatCell {
  if (t.noDuty) return 'no';
  if (t.noArmed && b.armed) return 'no';
  if (t.light && b.kind === 'mg') return 'no';
  if (t.light && b.kind === 'sk') return 'last';
  return 'yes';
}
/** Value of one cell: first the user's own medical kind (if changed), then the type, then the default. */
export function statCellOf(
  lists: UserLists | undefined,
  type: TypeKey,
  own: string | undefined,
  b: Blk & { id: string },
): { v: StatCell; from: 'own' | 'row' | 'def' } {
  const c = lists?.stat?.cells;
  const vo = own ? c?.[statRowKey(type, own)]?.[b.id] : undefined;
  if (vo) return { v: vo, from: 'own' };
  const vr = c?.[type]?.[b.id];
  if (vr) return { v: vr, from: 'row' };
  return { v: statDefault(TYPES[type], b), from: 'def' };
}
/**
 * For a status on a seat. Without a seat (or Λ/Υ-Δ/Υ, which are set by hand): the default, as armed when unknown.
 */
export function statOn(
  s: Pick<Status, 'type' | 'kind'>,
  post: (Blk & { block?: string }) | null | undefined,
  lists?: UserLists,
): { v: StatCell; from: 'own' | 'row' | 'def' } {
  const t = TYPES[s.type];
  const r = post?.block && post.kind !== 'ly' ? statRowOf(s, lists) : null;
  // leave of the user's own kind «Πουθενά» that goes into duties (Michael 3/11)
  if (!r && s.type === 'LEAVE' && !noDutyOf(s, lists)) return { v: 'yes', from: 'def' };
  if (!r) return { v: statDefault(t, post || { armed: true }), from: 'def' };
  return statCellOf(lists, r.type, r.own, { id: post!.block!, kind: post!.kind, armed: post!.armed });
}
/** Does it go out? As before (TYPES noOut), unless the user changed it. */
export function statOutOf(
  lists: UserLists | undefined,
  type: TypeKey,
  own?: string,
): { ok: boolean; from: 'own' | 'row' | 'def' } {
  if (type === 'PUN') return { ok: false, from: 'def' }; // a penalty always stops the out
  const o = lists?.stat?.out;
  const vo = own ? o?.[statRowKey(type, own)] : undefined;
  if (vo != null) return { ok: vo, from: 'own' };
  const vr = STAT_ROWS.includes(type) ? o?.[type] : undefined;
  if (vr != null) return { ok: vr, from: 'row' };
  return { ok: !TYPES[type].noOut, from: 'def' };
}
/**
 * True when the status keeps the person from going out (KOL: per declaration; leave «Πουθενά»: only if allowed).
 */
export const statNoOut = (s: Pick<Status, 'type' | 'kind'> & { noOut?: boolean }, lists?: UserLists): boolean => {
  if (s.type === 'KOL') return !!s.noOut; // the prevented one: per declaration
  const r = statRowOf(s, lists);
  return r ? !statOutOf(lists, r.type, r.own).ok : noOutOf(s, lists); // leave «Πουθενά»: goes out only if the user said so
};
/**
 * Unarmed because of status (for «Αυστηρά Άοπλοι»): goes into no armed duty of the form. A form without armed duties:
 * as before, from the type (ΕΑ/ΕΟ).
 */
export function statIsUnarmed(
  s: Pick<Status, 'type' | 'kind'>,
  blocks: (Blk & { id: string })[],
  lists?: UserLists,
): boolean {
  const armed = blocks.filter((b) => b.armed);
  const r = statRowOf(s, lists);
  if (!armed.length || !r) return !!TYPES[s.type].noArmed;
  return armed.every((b) => statCellOf(lists, r.type, r.own, b).v === 'no');
}
/** In no duty of the form because of status (for the Φρουρά lists). */
export function statNoDuty(
  s: Pick<Status, 'type' | 'kind'>,
  blocks: (Blk & { id: string })[],
  lists?: UserLists,
): boolean {
  const r = statRowOf(s, lists);
  const bs = blocks.filter((b) => b.kind !== 'ly');
  if (!bs.length || !r) return noDutyOf(s, lists);
  return bs.every((b) => statCellOf(lists, r.type, r.own, b).v === 'no');
}
/**
 * What a status does with these duties, in one line (for the declaration): «Όχι: Μαγειρεία · Δεν βγαίνει έξοδο».
 */
export function statSummary(
  s: Pick<Status, 'type' | 'kind'>,
  blocks: (Blk & { id: string; name: string; hidden?: boolean })[],
  lists?: UserLists,
): string {
  const lm = leaveMode(s, lists); // leave of the user's own kind that does not count as absent (Michael 3/11): what it does in practice
  if (lm === 'kol') return 'Κωλυόμενος (αφαιρείται από τους παρόντες) · Καμία υπηρεσία · Δεν βγαίνει έξοδο';
  if (lm === 'present')
    return (
      'Παρών · ' +
      (noDutyOf(s, lists) ? 'Καμία υπηρεσία' : 'Μπαίνει σε υπηρεσίες') +
      ' · ' +
      (noOutOf(s, lists) ? 'Δεν βγαίνει έξοδο' : 'Βγαίνει έξοδο')
    );
  const r = statRowOf(s, lists);
  const bs = blocks.filter((b) => b.kind !== 'ly' && !b.hidden);
  if (!r || !bs.length) return effects(TYPES[s.type]);
  const of = (v: StatCell) => bs.filter((b) => statCellOf(lists, r.type, r.own, b).v === v).map((b) => b.name);
  const no = of('no'),
    last = of('last');
  return (
    [
      no.length === bs.length ? 'Καμία υπηρεσία' : no.length && 'Όχι: ' + no.join(', '),
      last.length && 'Μόνο αν δεν υπάρχει άλλος: ' + last.join(', '),
      !statOutOf(lists, r.type, r.own).ok && 'Δεν βγαίνει έξοδο',
    ]
      .filter(Boolean)
      .join(' · ') || 'Χωρίς περιορισμούς'
  );
}
/**
 * Moves a user medical kind that nobody uses to another base type (ΗΚΑΙ column in the table: ΕΥ or present). Duties
 * and out stay as they appear: whatever came from the old type is written on the row of the medical kind.
 */
export function statRebase(lists: UserLists, own: string, to: TypeKey, blocks: (Blk & { id: string })[]): UserLists {
  const m = ownMed(lists, own);
  if (!m?.like || m.like === to) return lists;
  const from = m.like,
    kf = statRowKey(from, m.name),
    kt = statRowKey(to, m.name);
  const cells = { ...(lists.stat?.cells || {}) };
  const out = { ...(lists.stat?.out || {}) };
  const row: Record<string, StatCell> = {};
  for (const b of blocks) {
    const v = statCellOf(lists, from, m.name, b).v;
    if (v !== statCellOf(lists, to, undefined, b).v) row[b.id] = v;
  }
  delete cells[kf];
  if (Object.keys(row).length) cells[kt] = row;
  else delete cells[kt];
  const o = statOutOf(lists, from, m.name).ok;
  delete out[kf];
  if (o !== statOutOf(lists, to).ok) out[kt] = o;
  else delete out[kt];
  const add = (lists.medKinds?.add || []).map((x) => (x === m ? { ...x, like: to } : x));
  return { ...lists, medKinds: { ...lists.medKinds, add }, stat: { ...lists.stat, cells, out } };
}
