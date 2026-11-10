// Computing the values tables: terms, rows, tables and the text of a value.
//
// Purpose: `evalValue` (add up the terms), `rowValue` / `valueText` / `rowText`, `manOf` (the user's own value),
//   `evalTables` (all the tables of a form), `ValueOut`, `exprText` and `valsMissing`.
// Does NOT: define the measures (metrics.ts) or choose the moment (valueAt.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/reports/metricLookup, core/reports/valueAt, core/reports/valueCtx, core/reports/valueFilters,
//   core/reports/valueRows, core/reports/valueTags.
// Why: people count once in a sum whatever the order of the terms, and numbers add up, so the totals match the
//   screens the measures come from.
// Covering tests: test/value-manual.test.ts, test/values.test.ts, test/axiologisi.test.ts, test/note-only.test.ts.
import { dayFor, type ISODate } from '../lib/dates';
import type { TabLay, ValueTable, TAlign, VRow, VExpr, VFmt, Spot } from '../model/reportTypes';
import type { AppState } from '../model/state';
import { isHol } from '../duty/holidays';
import { upper } from '../lib/text';
import { metricOf, metricLabel } from './metricLookup';
import { AT_CUSTOM } from './valueAt';
import { type VCtx, vctx } from './valueCtx';
import { applyFilter, filterText } from './valueFilters';
import { hasFilter, valsUsed } from './valueRows';
import { rowTag } from './valueTags';

/**
 * The number of a list of terms. People: the + terms are united and those in a − term go out (each person once,
 * whatever the order). Numbers: added and subtracted. If there is no + term with people, the − terms are subtracted as
 * a count (e.g. strength ΗΚΑΙ − absent).
 */
export function evalValue(s: AppState, d: ISODate, at: number, expr: VExpr, cx?: VCtx): number {
  const c = cx || vctx(s, d, at);
  const plus = new Set<string>(),
    neg = new Set<string>();
  let hasPlus = false,
    num = 0;
  for (const t of expr) {
    const m = metricOf(s, t.metric);
    if (!m) continue;
    let v = m.fn(c);
    if (typeof v === 'number') {
      num += t.sign === '-' ? -v : v;
      continue;
    }
    if (hasFilter(t.filter)) v = applyFilter(c, v, t.filter);
    if (t.sign === '-') v.forEach((k) => neg.add(k));
    else {
      hasPlus = true;
      v.forEach((k) => plus.add(k));
    }
  }
  if (!hasPlus) return num - neg.size;
  let n = 0;
  plus.forEach((k) => {
    if (!neg.has(k)) n++;
  });
  return n + num;
}
/** The format of a row: integer for the user's own value, else its `fmt`, else percent when it has `percentOf`. */
export const fmtOf = (r: Pick<VRow, 'fmt' | 'percentOf' | 'man'>): VFmt =>
  r.man != null ? 'int' : (r.fmt ?? (r.percentOf?.length ? 'pct' : 'int'));
// The user's own value: a number if it is a number (also with a comma, «3,5»; not «007» or more than 15 digits, which
// lose the zeros or the precision), otherwise text in capitals; empty: neither (written «—» like a missing value).
// «1.234» / «12.345,5»: thousands dots as we write in Greek (not 1,234)
const MAN_NUM = /^[-+]?(?:(?:0|[1-9]\d*)(?:[.,]\d+)?|[.,]\d+)$/,
  MAN_K = /^[-+]?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
/** The user's own value of a row: a number or a text in capitals; both missing when it is empty. */
export function manOf(man: string): { v: number | null; txt?: string } {
  let t = man.trim();
  if (!t) return { v: null };
  if (MAN_K.test(t)) t = t.replace(/\./g, '');
  if (MAN_NUM.test(t) && t.replace(/\D/g, '').length <= 15) return { v: +t.replace(',', '.') };
  return { v: null, txt: upper(t) };
}
/**
 * The value of a row: a number, or (with «ως ποσοστό του…») a fraction 0–1; null when the denominator is 0 (or the
 * user's own value is empty or text).
 */
export function rowValue(s: AppState, d: ISODate, at: number, row: VRow, cx?: VCtx): number | null {
  if (row.man != null) return manOf(row.man).v;
  const c = cx || vctx(s, d, at);
  const n = evalValue(s, d, at, row.expr, c);
  if (!row.percentOf?.length) return n;
  const den = evalValue(s, d, at, row.percentOf, c);
  return den ? n / den : null;
}
/** A value as text: «—» for none, a rounded number or a percent, with a comma as the decimal sign. */
export function valueText(v: number | null, fmt: VFmt): string {
  if (v == null) return '—';
  if (fmt === 'pct') return Math.round(v * 100) + '%';
  if (fmt === 'pct1') return (Math.round(v * 1000) / 10).toFixed(1).replace('.', ',') + '%';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}
/** The text of a value: `txt` when the user's own value is text (then `v` = null), otherwise the formatted number. */
export const rowText = (x: { v: number | null; fmt: VFmt; txt?: string }): string => x.txt ?? valueText(x.v, x.fmt);
/**
 * A values table ready to write: `id`, `tag` and the place (`spot`), so it goes to its place (phase 3) and into the
 * {LABEL} cells of the Excel.
 */
export interface ValueOut {
  id: string;
  title: string;
  ta?: TAlign;
  rows: { label: string; v: number | null; fmt: VFmt; tag?: string; txt?: string }[];
  lay?: TabLay;
  spot?: Spot;
  tagsOnly?: boolean;
}
/** All the values tables of a form for day `d` and moment `at` (minutes), with the results of the measures shared. */
export function evalTables(
  s: AppState,
  d: ISODate,
  at: number,
  vals: ValueTable[] | undefined,
  today: ISODate = d,
): ValueOut[] {
  const c = vctx(s, d, at, today);
  // a row with its own day and time (e.g. Friday 19:00 dinner): measured at that moment, with the same rules
  const own = (r: VRow): { d: ISODate; at: number; c: VCtx } => {
    if (!r.day && !r.time) return { d, at, c };
    const d2 = dayFor(r.day, d, (x) => isHol(s.settings, x));
    const m = r.time && AT_CUSTOM.test(r.time) ? Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3)) : at;
    return { d: d2, at: m, c: vctx(s, d2, m, today) };
  };
  return valsUsed(vals).map((t) => ({
    id: t.id,
    title: (t.title || '').trim(),
    ...(t.ta ? { ta: t.ta } : {}),
    rows: t.rows.map((r) => {
      const o = own(r);
      return {
        label: r.label.trim(),
        v: rowValue(s, o.d, o.at, r, o.c),
        fmt: fmtOf(r),
        ...(rowTag(r) ? { tag: rowTag(r) } : {}),
        ...(r.man != null && manOf(r.man).txt ? { txt: manOf(r.man).txt } : {}),
      };
    }),
    ...(t.lay ? { lay: t.lay } : {}),
    ...(t.spot ? { spot: t.spot } : {}),
    ...(t.tagsOnly ? { tagsOnly: true } : {}),
  }));
}
/** «ΚΑ + Τιμητική + ΔΝ» for the list and the tooltip. */
export function exprText(s: AppState, e: VExpr): string {
  return e
    .map(
      (t, i) =>
        (i ? (t.sign === '-' ? ' − ' : ' + ') : t.sign === '-' ? '−' : '') +
        metricLabel(s, t.metric) +
        (hasFilter(t.filter) ? ' (' + filterText(t.filter) + ')' : ''),
    )
    .join('');
}
/** The measures of the tables that no longer exist (e.g. a duty deleted from the Settings). */
export function valsMissing(s: AppState, vals: ValueTable[] | undefined): string[] {
  const out = new Set<string>();
  for (const t of valsUsed(vals))
    for (const r of t.rows)
      if (r.man == null)
        for (const x of [...r.expr, ...(r.percentOf || [])]) if (!metricOf(s, x.metric)) out.add(x.metric);
  return [...out];
}
