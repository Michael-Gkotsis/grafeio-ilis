// Who comes into a report: the candidates and the rows of the form.
//
// Purpose: `candidates` (who passes the filters: people, cadres, statuses, duties, weapons, weapon moves, «Κενό»),
//   `rowsOf` (with «Πάντα μέσα», the count and the order) and `alwaysOf`.
// Does NOT: do the random draw (randomDraw.ts) or test one filter (condTest.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/weapons, core/people, core/cadre, core/reports/condTest, core/reports/conds, core/reports/kinds,
//   core/reports/options, core/reports/rowInfo, core/reports/rowTypes, core/reports/sortRows.
// Why: `candidates`, `soldiersOf` and `rowsOf` call each other (a table of rows from a filter and the kinds with one
//   row per status ask who the soldiers are), so they stay together.
// Covering tests: test/report-blank.test.ts, test/reports-flow.test.ts, test/reports-phase3.test.ts,
//   test/reports-sheets.test.ts.
import type { ISODate } from '../lib/dates';
import { collator, norm, normGreek } from '../lib/text';
import { TYPES } from '../model/status';
import { unitOf } from '../model/settingsAccess';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Post } from '../model/duty';
import { activePeople, personMap, seatMap } from '../duty/indexes';
import { postBy, postsOf } from '../duty/posts';
import { statusesOn } from '../duty/statuses';
import { weaponMatch } from '../weapons/weaponInfo';
import { movesAll } from '../weapons/weaponSheets';
import { live } from '../people/kinds';
import { cadreStatusOn, orderedCadre } from '../cadre/cadre';
import { rosterMatch } from '../people/rosterLists';
import type { RosterFilter } from '../model/lists';
import type { Report, RepPick, StCat } from '../model/reportTypes';
import { condTest } from './condTest';
import { condGroups, passGroup } from './conds';
import { manualKind, srcSort, blankN } from './kinds';
import { DEF_CATS } from './options';
import { wInfo } from './rowInfo';
import { type Row, blankRow, type WhoAt, whoOf, type StatusRow, type DutyRow, dutyRow, type MoveRow } from './rowTypes';
import { sortRows } from './sortRows';

// the soldier filters without the «who» filters (for the kinds with one row per status, post or move)
const soldiersPick = (pk: RepPick): RepPick => ({
  ...pk,
  from: 'all',
  noDuty: false,
  need: undefined,
  not: undefined,
  or: undefined,
  mode: 'all',
});
/** Those who pass the filters (before «πόσοι»), in the «Δυναμολόγιο» order (alphabetical). */
export function candidates(
  s: AppState,
  r: Pick<Report, 'kind' | 'pick'> & Pick<Partial<Report>, 'who' | 'src' | 'sort'>,
  d: ISODate,
): Row[] {
  const pk = r.pick;
  if (r.kind === 'blank') {
    const pm = r.who?.some(Boolean) ? personMap(s.people) : undefined;
    // rows from a filter: first those who pass the table's filters (all of them), then the user's own
    const top: Row[] = r.src
      ? rowsOf(s, { kind: r.src, pick: { ...pk, mode: 'all' }, sort: srcSort(r.src, r.sort || 'pick') }, d)
      : [];
    return [
      ...top.map((x, i) => blankRow(i, { kind: r.src, x } as WhoAt, -1)),
      ...Array.from({ length: blankN(pk.n, r.src) }, (_, j) => blankRow(top.length + j, whoOf(s, r.who?.[j], pm), j)),
    ];
  }
  if (r.kind === 'status') {
    const cats = new Set(pk.cats?.length ? pk.cats : DEF_CATS);
    const pm = personMap(s.people);
    const people = new Set(candidates(s, { kind: 'people', pick: soldiersPick(pk) }, d).map((p) => p.id));
    const out: StatusRow[] = [];
    for (const st of live(s)) {
      if (!cats.has(TYPES[st.type]?.cat as StCat) || !people.has(st.pid)) continue;
      if (pk.types?.length && !pk.types.includes(st.type)) continue;
      if (
        pk.when === 'new'
          ? st.from !== d
          : pk.when === 'from'
            ? st.to < d && !st.open
            : st.from > d || (st.to < d && !st.open)
      )
        continue;
      const p = pm.get(st.pid);
      if (!p) continue;
      out.push({ ...p, id: st.id, pid: p.id, st, p });
    }
    return out.sort(
      (a, b) =>
        collator.compare(a.last, b.last) || collator.compare(a.first, b.first) || (a.st.from < b.st.from ? -1 : 1),
    );
  }
  // Duties: the posts of the day in the ΦΡΟΥΡΑ order (and those that have someone but are no longer in the form)
  if (r.kind === 'duty') {
    const filtered = !!(pk.view || pk.si?.length || pk.rooms?.length);
    const ok = filtered ? soldiersOf(s, pk, d) : null;
    const pm = seatMap(s); // and cadres in a post (Michael, 26/10)
    const blocks = pk.blocks?.length ? new Set(pk.blocks) : null;
    const g = s.guards[d] || {};
    const posts = postsOf(s.settings);
    const have = new Set(posts.map((x) => x.k));
    const out: DutyRow[] = [];
    for (const po of [
      ...posts,
      ...Object.keys(g)
        .filter((k) => !have.has(k))
        .map((k) => postBy(s, k))
        .filter((x): x is Post => !!x),
    ]) {
      if (blocks && !blocks.has(po.block)) continue;
      const row = dutyRow(pm, po, g[po.k]);
      if (row.p ? !ok || ok.has(row.p.id) : pk.empty && !filtered) out.push(row);
    }
    return out;
  }
  // Weapon moves of the day (exits, entries, those still out), in the order they went out
  if (r.kind === 'wmove') {
    const ok = soldiersOf(s, pk, d);
    const pm = seatMap(s);
    const all = !(pk.view || pk.si?.length || pk.rooms?.length); // cadres (armed duty) only without a soldier filter
    const out: MoveRow[] = [];
    for (const m of movesAll(s, d)) {
      if (pk.open && m.inDay && m.inDay <= d) continue;
      const p = pm.get(m.pid);
      if (p && (ok.has(p.id) || (all && p.cid))) out.push({ ...p, id: m.id, pid: p.id, p, m });
    }
    return out;
  }
  // Weapons: as the soldiers, with the filter of the «Οπλισμός» tab («Να παραδώσουν»: also those out of the strength)
  if (r.kind === 'weapon') {
    const wf = pk.wf || 'with';
    const info = wInfo(s, d);
    const base =
      wf === 'return'
        ? s.people.filter((p) => !p.active)
        : (candidates(s, { kind: 'people', pick: pk }, d) as Person[]);
    return base
      .filter((p) => weaponMatch(wf, p, info))
      .sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
  }
  if (r.kind === 'cadre') {
    const list = orderedCadre(s.cadreList || []).filter((c) => c.active);
    return pk.from === 'present' ? list.filter((c) => !cadreStatusOn(s, c.id, d)) : list;
  }
  const view = pk.view ? (s.settings.views || []).find((v) => v.id === pk.view) : undefined;
  let list: Person[] = pk.from === 'inactive' ? s.people.filter((p) => !p.active) : activePeople(s);
  const gs = condGroups(pk);
  if (gs.length > 1) {
    const t = condTest(s, d, pk.stNew);
    list = list.filter((p) => gs.some((g) => passGroup(t, g, p)));
  } // OR between the groups; an empty group = everyone passes
  else if (gs[0].need.length || gs[0].not.length) {
    const t = condTest(s, d, pk.stNew);
    list = list.filter((p) => passGroup(t, gs[0], p));
  }
  if (view)
    list = list.filter(
      (p) =>
        (view.room == null || p.room === view.room) &&
        (view.unit === 'all' || !view.unit || unitOf(p, s.settings) === view.unit) &&
        (!view.filter ||
          view.filter === 'all' ||
          rosterMatch(view.filter as RosterFilter, p, statusesOn(s.statuses, p.id, d))) &&
        (!view.q ||
          normGreek([p.last, p.first, p.rank, p.origin, p.post, p.role].join(' ')).includes(normGreek(view.q))),
    );
  if (pk.never?.length) {
    const nv = new Set(pk.never);
    list = list.filter((p) => !nv.has(p.id));
  }
  if (pk.si?.length) {
    const si = new Set(pk.si.map(norm));
    list = list.filter((p) => si.has(norm(p.si)));
  }
  if (pk.rooms?.length) {
    const rs = new Set(pk.rooms);
    list = list.filter((p) => p.room != null && rs.has(p.room));
  }
  return [...list].sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
}
// soldiers who pass the «Δυναμολόγιο» filters (list, rooms, Σ.Ι.): for the kinds with one row per status, post or move
function soldiersOf(s: AppState, pk: RepPick, d: ISODate): Set<number> {
  return new Set(candidates(s, { kind: 'people', pick: soldiersPick(pk) }, d).map((p) => p.id as number));
}
/** «Πάντα μέσα»: they come in whatever the filters say (not those who are also in «Ποτέ»). */
export function alwaysOf(s: AppState, r: Pick<Report, 'kind' | 'pick'>): Person[] {
  if (!manualKind(r.kind) || !r.pick.always?.length) return [];
  const pm = personMap(s.people);
  const nv = new Set(r.pick.never || []);
  return r.pick.always.map((id) => pm.get(id)).filter((p): p is Person => !!p && !nv.has(p.id));
}
/**
 * The rows of the form without the random pick (that is made on the screen, so what you saw is what comes out): the
 * «always in» ones, then the candidates, cut to `n` in 'first' mode, in the order of `sort`.
 */
export function rowsOf(
  s: AppState,
  r: Pick<Report, 'kind' | 'pick' | 'sort'> & Pick<Partial<Report>, 'who' | 'src'>,
  d: ISODate,
): Row[] {
  const a = alwaysOf(s, r);
  const aIds = new Set(a.map((p) => p.id));
  const c = [...a, ...candidates(s, r, d).filter((x) => !aIds.has(x.id as number))];
  const n = r.pick.mode === 'all' ? c.length : Math.max(0, r.pick.n || 0);
  return sortRows(r.pick.mode === 'first' ? c.slice(0, n) : c, r.sort, s, r.kind);
}
