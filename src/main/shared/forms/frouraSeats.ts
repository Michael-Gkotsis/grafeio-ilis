// The seats of the ΦΡΟΥΡΑ: which post goes into which box of the template, and growing a table.
//
// Purpose: `seatFroura` (post to box), `extendFroura` (rows added under a table whose boxes are not enough) and the
//   type `Seat`.
// Does NOT: write the names into the cells (fillFroura in froura.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: the template has a fixed number of boxes per table; numbers beyond them make the table grow (Michael, 4/11). It
//   moved verbatim from src/main/exports.ts (Phase 4.9a).
// Covering test: test/exports.test.ts, test/shifts.test.ts, test/own-phases.test.ts and test/active-service.test.ts.
import { groupKey, type Post } from '../../../shared/domain';
import { type Workbook, colName, type Sheet } from '../excel/xlsx';
import type { FNum, FrouraMap, FTable } from '../../tplmap';
import { refOf } from './common';

/**
 * A seat of the template: its cell `ref`, the table `t` it belongs to and the number `n` in it (both null for a single
 * cell).
 */
export interface Seat {
  ref: string;
  t: FTable | null;
  n: FNum | null;
}

/**
 * The seats of the guard in the cells of the template: every table gets the seats of its kind (room guards, armourers,
 * kitchens, sentries or an own service of the user by its name), in order, one per number; the sentries in pairs, at
 * the number of their sentry-box ("3η"). What finds no seat goes into a table of its own below (frouraTables). `over`
 * (Michael, 4/11): numbers that do not fit the boxes of their table; the table grows downwards (extendFroura).
 */
export function seatFroura(
  map: FrouraMap,
  posts: Post[],
  custom: Set<string> = new Set(),
): { seats: Map<string, Seat>; over: Map<FTable, Post[][]> } {
  const out = new Map<string, Seat>();
  const over = new Map<FTable, Post[][]>();
  const kindOfPost = (x: Post, own: Set<string>) => (own.has('b:' + x.block) ? 'b:' + x.block : x.kind);
  const own = new Set(
    map.tables
      .map((t) => t.kind)
      .concat(map.single.map((x) => x.kind))
      .filter((k) => k.startsWith('b:')),
  );
  // one number = the posts of the same block with the same rot or grp (pair): every kind, not only the sentries
  const groupsOf = (ps: Post[]) => {
    const g: Post[][] = [];
    const at = new Map<string, number>();
    for (const p of ps) {
      const k = p.block + '|' + groupKey(p);
      const i = at.get(k);
      if (i != null) g[i].push(p);
      else {
        at.set(k, g.length);
        g.push([p]);
      }
    }
    return g;
  };
  const kinds = [...new Set(posts.filter((x) => x.k !== 'ly' && x.k !== 'dy').map((x) => kindOfPost(x, own)))];
  for (const kind of kinds) {
    const ps = posts.filter((x) => x.k !== 'ly' && x.k !== 'dy' && kindOfPost(x, own) === kind);
    const tabs = map.tables.filter((t) => t.kind === kind);
    const singles: Seat[] = map.single
      .filter((x) => x.kind === kind)
      .map((x) => ({ ref: refOf(x.c, x.r), t: null, n: null }));
    const slotsOf = (ts: FTable[]): Seat[] => ts.flatMap((t) => t.nums.map((n) => ({ ref: refOf(t.name, n.r), t, n })));
    // sentries: "3η" is the pair of the 3rd sentry-box (if the numbers of the form match those of the posts)
    const numOf = (x: string) => Number((/^(\d+)/.exec(x) || [])[1] || NaN);
    const place = (groups: Post[][], slots: Seat[], ext: FTable | null) => {
      const byNum =
        kind === 'sk' && slots.some((sl) => sl.n && groups.some((g) => numOf(g[0].short) === numOf(sl.n!.label)));
      // an own service of the same kind (e.g. "Θαλαμοφύλακες γ΄") does not go into the table of the form: its own table
      // below
      groups.forEach((g, i) => {
        const sl = byNum ? slots.find((x) => x.n && numOf(x.n.label) === numOf(g[0].short)) : slots[i];
        if (sl) for (const p of g) out.set(p.k, sl);
        else if (ext && ext.aa != null && (kind.startsWith('b:') || !custom.has(g[0].block)))
          over.set(ext, [...(over.get(ext) || []), g]);
      });
    };
    const ids = [...new Set(ps.map((x) => x.block))];
    // as many blocks as tables (e.g. α΄ and β΄ room guards): each in its own table, else in order over all seats of the
    // kind
    if (tabs.length && ids.length === tabs.length)
      ids.forEach((id, i) => place(groupsOf(ps.filter((x) => x.block === id)), slotsOf([tabs[i]]), tabs[i]));
    else place(groupsOf(ps), [...slotsOf(tabs), ...singles], tabs.length ? tabs[tabs.length - 1] : null);
  }
  return { seats: out, over };
}

/**
 * The table grows downwards (Michael, 4/11: "can't it extend the table?"): after the last box come rows with its height
 * and style (a box = the same rows), the Α/Α and the name merged as in the other boxes, and "5ο" in the Α/Α. A table
 * next to the same rows that has no box of its own stays empty, without borders. Returns how many rows were inserted
 * and which tables grew.
 */
export function extendFroura(
  wb: Workbook,
  ws: Sheet,
  map: FrouraMap,
  over: Map<FTable, Post[][]>,
): { rows: number; stretched: Set<string> } {
  const last = (t: FTable) => t.nums[t.nums.length - 1];
  const byEnd = new Map<number, { R: number; h: number; tabs: { t: FTable; gs: Post[][] }[] }>();
  for (const [t, gs] of over) {
    const L = last(t);
    const E = L.r + L.h - 1;
    const x = byEnd.get(E) || { R: L.r, h: L.h, tabs: [] };
    x.tabs.push({ t, gs });
    byEnd.set(E, x);
  }
  const cols = (t: FTable) => [Math.min(t.aa ?? t.name, t.name), Math.max(t.name, t.hours ?? t.name, t.note ?? t.name)];
  const numOf = (x: string) => Number((/^(\d+)/.exec(x) || [])[1] || NaN);
  let total = 0;
  const stretchedTabs = new Set<string>();
  // bottom to top, so that the rows not done yet do not move
  for (const E of [...byEnd.keys()].sort((a, b) => b - a)) {
    const { R, h, tabs } = byEnd.get(E)!;
    const K = Math.max(...tabs.map((x) => x.gs.length));
    const merges = ws.merges();
    // Α/Α, name and ΠΑΡ/ΣΕΙΣ merged vertically inside the last box
    const box = merges.filter((m) => m.r1 >= R && m.r2 <= E && m.r2 > m.r1);
    // a box of another table that passes over the line
    const stretched = (c1: number, c2: number) => merges.some((m) => m.r1 <= E && m.r2 > E && m.c1 <= c2 && m.c2 >= c1);
    for (let j = 0; j < K; j++) for (let i = h - 1; i >= 0; i--) ws.insertRows(E, 1, R + i, wb);
    total += K * h;
    for (let j = 0; j < K; j++) {
      const r0 = E + j * h + 1;
      const mine = new Set<FTable>();
      for (const { t, gs } of tabs) {
        if (j >= gs.length) continue;
        mine.add(t);
        const [c1, c2] = cols(t);
        // "5ο" like the "1ο" of the template (the label of the map is in capitals)
        const suf = (/\D+$/.exec(last(t).label)?.[0] || 'ο').toLowerCase();
        const sk = t.kind === 'sk' && Number.isFinite(numOf(gs[j][0].short));
        ws.set(colName(t.aa!) + r0, (sk ? numOf(gs[j][0].short) : t.nums.length + j + 1) + suf, true);
        for (const m of box)
          if (m.c1 >= c1 && m.c2 <= c2)
            ws.addMerge(colName(m.c1) + (m.r1 + r0 - R) + ':' + colName(m.c2) + (m.r2 + r0 - R));
      }
      // other tables on the same rows: empty, without borders
      for (const u of map.tables) {
        if (mine.has(u)) continue;
        const [c1, c2] = cols(u);
        // same columns as a table that grows (e.g. the kitchens under the room guards)
        if ([...mine].some((m) => cols(m)[0] <= c2 && cols(m)[1] >= c1)) continue;
        if (stretched(c1, c2)) {
          stretchedTabs.add(u.hr + ':' + u.name);
          continue;
        } // a box that grew: its hours are written again
        ws.clearBox(c1, c2, r0, r0 + h - 1);
      }
    }
  }
  return { rows: total, stretched: stretchedTabs };
}
