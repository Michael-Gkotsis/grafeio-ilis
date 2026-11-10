// «Φτιάξ' το εδώ»: putting the built template back into the report, and the extra tables.
//
// Purpose: `withBuilt` (the result of the builder into the report), `forBuild` (the options the template builder
//   gets), `BuiltOut`, `sigsNone`, `moreRows` / `tableDay` (tables 2, 3…) and `roomList`.
// Does NOT: build the template (src/main/reports.ts does) or pick the people (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/reports/bands, core/reports/candidates, core/reports/kinds, core/reports/picks, core/reports/rowTypes,
//   core/reports/valueRows.
// Why: a saved report must keep working after the builder runs again, so what the builder returns is merged into the
//   report in one place and old reports are corrected when they come out.
// Covering tests: test/report-blank-more.test.ts, test/stelexi.test.ts, test/report-bands.test.ts,
//   test/report-blank-lists.test.ts.
import { dayFor, type ISODate } from '../lib/dates';
import { roomCfg } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { isHol } from '../duty/holidays';
import type { Spot, Report, RepCol, RepCell, RepPick, RepTpl, BuildOpts } from '../model/reportTypes';
import { MAIN, bandsOf, isDefault } from './bands';
import { rowsOf } from './candidates';
import { blankN } from './kinds';
import { newTable, pickForKind } from './picks';
import type { Row } from './rowTypes';
import { valsUsed } from './valueRows';

/** Tables 2, 3… without random picks: the draw belongs to the first table only. */
export const subPick = (pk: RepPick): RepPick =>
  pk.mode === 'random' ? { ...pk, mode: 'all', even: undefined, fair: undefined, gap: undefined } : pk;
/** After «Φτιάξ' το εδώ»: where the tables ended up in the template, with what was chosen for each (who, order). */
export interface BuiltOut {
  sheet: string;
  head: number;
  cols: RepCol[];
  cells: RepCell[];
  more?: { id: string; head: number; cols: RepCol[] }[];
  fixed?: boolean;
  vals?: ({ id: string } & Spot)[];
}
/**
 * The BuildOpts as `buildTemplate` needs it: with the positions of the tables and the values tables of the form, but
 * only when the layout is not the default (one under the other); otherwise the same object, so the same template as
 * before phase 3.
 */
export function forBuild(o: BuildOpts, r: Pick<Report, 'bands' | 'vals'>): BuildOpts {
  if (o.nopeople && !(o.more || []).length) return o;
  const vs = valsUsed(r.vals);
  const ids = [MAIN, ...(o.more || []).map((t) => t.id), ...vs.map((v) => v.id)];
  const bands = bandsOf(ids, r.bands);
  if (isDefault(ids, bands)) return o;
  return {
    ...o,
    bands,
    vals: vs.map((v) => ({
      id: v.id,
      title: (v.title || '').trim(),
      ...(v.ta ? { ta: v.ta } : {}),
      ...(v.lay ? { lay: v.lay } : {}),
    })),
  };
}
/**
 * The people of the rows as they are saved: only inside the `nrows` rows, without empty ones at the end; nothing =
 * undefined.
 */
export function whoCut(
  who: (string | null)[] | undefined,
  nrows?: number,
  src?: unknown,
): (string | null)[] | undefined {
  const w = (who || []).slice(0, blankN(nrows, src)).map((x) => x || null);
  while (w.length && !w[w.length - 1]) w.pop();
  return w.length ? w : undefined;
}
/**
 * Puts the result of «Φτιάξ' το εδώ» into the report: sheet, header row, columns and cells of the tables (also 2, 3…),
 * the positions of the values tables, and `sigs: []` for «Υπογραφές: Καμία».
 */
export function withBuilt(r: Report, b: BuiltOut, o: BuildOpts): Report {
  const more = (o.more || []).map((t) => {
    const prev = r.more?.find((x) => x.id === t.id);
    const got = b.more?.find((x) => x.id === t.id);
    const base = !prev
      ? newTable(t.kind, t.id)
      : prev.kind === t.kind
        ? prev
        : { ...prev, ...pickForKind(prev.kind, prev.pick, prev.sort, t.kind) };
    const { nohead: _h, who: _w, src: _sr, ...b0 } = base;
    // «Κενός πίνακας»: the rows are the nrows of the table's grid (as in the 1st)
    const pick =
      t.kind === 'blank' && t.nrows != null
        ? { pick: { ...b0.pick, mode: 'all' as const, n: blankN(t.nrows, t.src) } }
        : {};
    const who = t.kind === 'blank' ? whoCut(t.who, t.nrows, t.src) : undefined;
    return {
      ...b0,
      ...pick,
      ...(who ? { who } : {}),
      ...(t.kind === 'blank' && t.src ? { src: t.src } : {}),
      title: t.title,
      ...(t.tday ? { tday: t.tday } : {}),
      kind: t.kind,
      head: got?.head ?? base.head,
      cols: got?.cols || [],
      ...(t.nohead ? { nohead: true } : {}),
    };
  });
  const { more: _, fixed: _f, nohead: _n, who: _w, src: _sr, tday: _td, ...rest } = r;
  // values tables: the place the template gave them (none for the default layout: written at the end, as before)
  const vals = r.vals?.map((v) => {
    const { spot: _s, ...w } = v;
    const p = b.vals?.find((x) => x.id === v.id);
    return p
      ? {
          ...w,
          spot: {
            c1: p.c1,
            c2: p.c2,
            ...(p.row != null ? { row: p.row } : {}),
            ...(p.tt ? { tt: true as const } : {}),
          },
        }
      : w;
  });
  // «Κενό»: the rows are the nrows of the grid (the screen keeps pick.n to know how many rows it has)
  const pick: Partial<Report> =
    r.kind === 'blank' && o.nrows != null ? { pick: { ...r.pick, mode: 'all', n: blankN(o.nrows, o.src) } } : {};
  const who = r.kind === 'blank' ? whoCut(o.who, o.nrows, o.src) : undefined;
  return {
    ...rest,
    ...(o.tday ? { tday: o.tday } : {}),
    ...pick,
    ...(who ? { who } : {}),
    ...(r.kind === 'blank' && o.src ? { src: o.src } : {}),
    ...(vals ? { vals } : {}),
    sheet: b.sheet,
    head: b.head,
    cols: b.cols,
    cells: b.cells,
    ...(more.length ? { more } : {}),
    ...(b.fixed ? { fixed: true } : {}),
    ...(o.nohead && !o.nopeople ? { nohead: true } : {}),
    ...(o.sig === 'none' && !r.sigs ? { sigs: [] } : {}),
  };
}
/**
 * «Υπογραφές: Καμία» in «Φτιάξ' το εδώ».
 * @decision Michael 29/10: «οι υπογραφές δεν φεύγουν». The template has no signature line, and without `sigs` the form
 *   took the signers of the Settings under the table (when they were changed there). Now «Καμία» = none (`withBuilt`
 *   sets `sigs: []`); forms saved before are corrected here when they come out (`edited`: the template was changed
 *   later in the Excel, so it stays as it was).
 */
export function sigsNone(r: Report, tpls: RepTpl[] | undefined, edited = false): Report {
  if (r.sigs || edited) return r;
  return tpls?.find((t) => t.id === r.tpl)?.built?.sig === 'none' ? { ...r, sigs: [] } : r;
}
/** The rows of tables 2, 3… (all or the first N, in their order). */
export const moreRows = (s: AppState, r: Pick<Report, 'more'>, d: ISODate): Row[][] =>
  (r.more || []).map((t) => rowsOf(s, { ...t, pick: subPick(t.pick) }, tableDay(s, t.tday, d)));
/** The day of a table («Για ποια μέρα»): as the form, the next working day, +N days. */
export const tableDay = (s: Pick<AppState, 'settings'>, spec: string | undefined, d: ISODate): ISODate =>
  dayFor(spec, d, (x) => isHol(s.settings, x));
/** The room numbers 1..n of the settings. */
export const roomList = (s: Pick<AppState, 'settings'>) =>
  Array.from({ length: roomCfg(s.settings).n }, (_, i) => i + 1);
