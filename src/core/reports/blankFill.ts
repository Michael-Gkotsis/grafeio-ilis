// Filling the cells of a «Κενός πίνακας» that hold {LABELS}.
//
// Purpose: `blankFill` (a cell text with labels to its value: a number or capitals) and `metricFn` (one measure on a
//   day, shared between the cells).
// Does NOT: find the value of a label (blankTags.ts) or write the Excel.
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model,
//   core/reports/blankTags, core/reports/cells, core/reports/valueCtx, core/reports/valueEval.
// Why: the cell is either entirely a label (a number, in the format of the row) or text with labels inside; both
//   must give capitals except numbers, so it is done in one place.
// Covering tests: test/report-blank-lists.test.ts, test/report-blank-tags.test.ts.
import type { ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import type { AppState } from '../model/state';
import type { VFmt } from '../model/reportTypes';
import type { BlankTags } from './blankTags';
import { tagKey, TAG_RE } from './cells';
import { type VCtx, vctx } from './valueCtx';
import { rowValue, valueText } from './valueEval';

/**
 * The value of a measure (an id of the catalogue) on day `d` at moment `at` (minutes), with the results shared between
 * the cells.
 */
export function metricFn(s: AppState, d: ISODate, at: () => number, today: ISODate = d): (id: string) => number | null {
  let c: VCtx | undefined;
  const memo = new Map<string, number | null>();
  return (id) => {
    if (!memo.has(id)) {
      const a = at();
      c ||= vctx(s, d, a, today);
      memo.set(id, rowValue(s, d, a, { label: '', expr: [{ sign: '+', metric: id }] }, c));
    }
    return memo.get(id)!;
  };
}
/**
 * Fills a cell text that holds {LABELS}. `bad`: the labels that matched nothing (for the warning). `wrap`: has a list
 * of names (a long text: wrap it in the cell).
 */
export function blankFill(
  raw: string,
  x: BlankTags,
  bad?: Set<string>,
): { v: string | number | null; fmt?: VFmt; wrap?: true } {
  let wrap = false;
  const one = (tg: string): { s: string; n?: number; fmt?: VFmt } | null => {
    const w = x.row(tg);
    if (w)
      return w.txt != null ? { s: w.txt } : w.v == null ? { s: '—' } : { s: valueText(w.v, w.fmt), n: w.v, fmt: w.fmt };
    const k = tagKey(tg);
    if (k) {
      const v = x.std(k);
      return typeof v === 'number' ? { s: String(v), n: v } : { s: String(v ?? '').replace(/\n/g, ' ') };
    }
    const m = x.met(tg);
    if (m != null) return { s: valueText(m, 'int'), n: m };
    const l = x.list?.(tg);
    if (!l) return null;
    return l.cnt ? { s: String(l.n), n: l.n } : ((wrap = true), { s: l.s });
  };
  const t = raw.trim();
  const whole = /^\{([^{}]{1,40})\}$/.exec(t);
  if (whole) {
    const o = one(whole[1]);
    if (!o) {
      bad?.add(whole[1].trim());
      return { v: upper(t) || null };
    }
    return o.n != null
      ? { v: o.n, ...(o.fmt && o.fmt !== 'int' ? { fmt: o.fmt } : {}) }
      : { v: upper(o.s.trim()) || null, ...(wrap ? { wrap: true as const } : {}) };
  }
  const out = t.replace(TAG_RE, (m, tg: string) => {
    const o = one(tg);
    if (!o) {
      bad?.add(tg.trim());
      return m;
    }
    return o.s;
  });
  return { v: upper(out.trim()) || null, ...(wrap ? { wrap: true as const } : {}) };
}
