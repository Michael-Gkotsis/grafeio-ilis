/**
 * Golden hashes, part 1: hashing helpers and the report/form outputs (the original `bench:golden` content).
 *
 * Purpose: one place that generates "output key -> hash" pairs for the Excel files and print renderings the app writes.
 * `bench/golden-reports.ts` prints the legacy lines; `test/golden-outputs.test.ts` compares every entry with the
 * baseline.
 *
 * What it does NOT do: it never touches the baseline file, never reads the clock by itself (callers fix the date,
 * see the test), and never changes any output; it only calls the production writers (`src/main`) and hashes what
 * they return.
 *
 * Owner layer: bench/test tooling (no production code imports it).
 * Why: Hard rule 1 in CLAUDE.md says outputs may not change by one byte; this makes the rule machine-checked.
 * Covering test: test/golden-outputs.test.ts.
 *
 * What is hashed (and what is not): see `zipHash` (xlsx/docx content = every zip part name and its uncompressed bytes,
 * so zip container metadata such as entry dates and compression level is NOT part of the hash) and `renderHash`
 * (the print HTML of every sheet plus the page-fit suggestion).
 */
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildTemplate, fillReport, previewReport } from '../src/main/reports';
import { renderBook, PRINT_DEFAULT, type PrintOpts } from '../src/main/print';
import { defaultPick, withBuilt, PRESETS, newTable, type BuildOpts, type Report } from '../src/shared/reports';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { benchState } from './state';
import type { ISODate } from '../src/shared/dates';
import type { AppState } from '../src/shared/domain';

/** One golden line: a stable key (no spaces) and a 12-hex-digit hash (or a short opaque value such as a page count). */
export interface GoldenEntry { key: string; hash: string }
/** A legacy `bench:golden` line plus the structured entries computed in the same pass. */
export interface GoldenRow { line: string; entries: GoldenEntry[] }

/** Last day of the benchmark state (ISODate, local). Every golden output is generated "as of" this day. */
export const GOLDEN_END = '2026-10-22' as ISODate;
/** The three unit sizes (people) the golden outputs are generated for. */
export const GOLDEN_SIZES = [5, 60, 300];

/** The four print layouts used for report outputs; extra books use the first and the last one only. */
export const PRINT_LAYOUTS: [string, PrintOpts][] = [
  ['default', PRINT_DEFAULT],
  ['pages2', { ...PRINT_DEFAULT, pages: 2 }],
  ['pagesAuto', { ...PRINT_DEFAULT, pages: 'auto' }],
  ['landscapeFill', { ...PRINT_DEFAULT, or: 'l', sp: 'fill', keep: false }]
];

/** First 12 hex digits of the SHA-1 of a text. */
export const textHash = (text: string): string => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

/**
 * Content hash of an xlsx/docx: SHA-1 over every non-directory zip part (sorted name, then uncompressed bytes).
 * Same algorithm as `src/main/ziphash.ts` (the one the app uses to decide "file unchanged"), cut to 12 hex digits.
 * Excluded on purpose: zip entry timestamps, compression level and entry order (container metadata, not content).
 */
export async function zipHash(buf: Buffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf); const hash = crypto.createHash('sha1');
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir) continue;
    hash.update(name); hash.update(await zip.files[name].async('nodebuffer'));
  }
  return hash.digest('hex').slice(0, 12);
}

/** Print rendering of a workbook: hash of all sheets' HTML joined, and the hash of the page-fit suggestion JSON. */
export async function renderHash(
  data: Buffer, layout: PrintOpts
): Promise<{ html: string; sug: string; sugJson: string }> {
  const doc = await renderBook(data, { file: 'x.xlsx', layout });
  const sugJson = JSON.stringify(doc.sug || null);
  return { html: textHash(doc.sheets.map(x => x.html).join('')), sug: textHash(sugJson), sugJson };
}

/** The two golden entries of one print rendering: page HTML and page-fit suggestion. */
const printPair = (key: string, layout: string, r: { html: string; sug: string }): GoldenEntry[] => [
  { key: key + '/print.' + layout + '.html', hash: r.html }, { key: key + '/print.' + layout + '.fit', hash: r.sug }
];

/**
 * Entries for one Excel output: the content hash plus the print rendering for each given layout.
 * @param key stable key prefix, e.g. `made/n=60/roster-print`
 */
export async function bookEntries(key: string, data: Buffer, layouts: [string, PrintOpts][]): Promise<GoldenEntry[]> {
  const entries: GoldenEntry[] = [{ key: key + '/xlsx', hash: await zipHash(data) }];
  for (const [name, layout] of layouts) {
    const r = await renderHash(data, layout);
    entries.push(...printPair(key, name, r));
  }
  return entries;
}

/** The benchmark state for a unit size, as of `GOLDEN_END` (60 days of history, 7 days ahead). */
export function goldenState(n: number): AppState {
  const cached = STATES.get(n); if (cached) return cached;
  const state = benchState({ n, days: 60, end: GOLDEN_END }); STATES.set(n, state);
  return state;
}
/** Building the 300-person state is the slowest step; writers never mutate a state, so one copy per size is shared. */
const STATES = new Map<number, AppState>();

/** Read one of the frozen templates in `templates/`. */
export const readTemplate = (file: string): Buffer => fs.readFileSync(path.join(__dirname, '..', 'templates', file));

/** Extra report options of the "extra" variant: more columns, a second table and a signature (as the old bench). */
function extraOpts(base: BuildOpts): BuildOpts {
  const more = [{
    id: 't2', title: 'ΑΔΕΙΕΣ', kind: 'status',
    cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑ', w: 'auto' }],
    lay: { w: '1/2', at: 'center', even: true }
  }] as unknown as BuildOpts['more'];
  const cols = [...base.cols, { f: 'smed', h: 'ΙΑΤΡΙΚΟ', w: 'auto' }, { f: 'phone', h: 'ΤΗΛ', w: 'wide' }] as unknown as
    BuildOpts['cols'];
  return { ...base, cols, more };
}

/**
 * Report outputs (every preset, plain and extra variant) for one unit size: filled Excel, on-screen preview, and print
 * rendering in the four layouts. Legacy `bench:golden` line layout is kept byte for byte in `line`.
 */
export async function reportRows(n: number): Promise<GoldenRow[]> {
  const state = goldenState(n); const ids = state.people.map(p => p.id); const rows: GoldenRow[] = [];
  for (const pre of PRESETS) {
    for (const extra of [false, true]) {
      const opts: BuildOpts = extra ? extraOpts(pre.opts) : pre.opts;
      const kind = (pre as { kind?: Report['kind'] }).kind || 'people';
      const key = 'report/n=' + n + '/' + pre.id + '/extra=' + extra;
      let built;
      try { built = await buildTemplate(opts, kind); } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const entries = [{ key: key + '/build-error', hash: textHash(msg) }];
        rows.push({ line: pre.id + ' build ERR ' + msg, entries });
        continue;
      }
      let report = withBuilt({
        id: 'r', name: pre.id, tpl: 't', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(),
        sort: 'name', day: 'today',
        out: 'file', sigs: extra ? [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] : undefined
      } as Report, built, opts);
      if (report.more) report.more = report.more.map(t => ({ ...t, pick: newTable('status', t.id).pick }));
      const res = await fillReport(built.data, state, report, kind === 'people' ? ids : [], GOLDEN_END);
      const pv = await previewReport(built.data, state, report, ids, GOLDEN_END);
      const xlsx = await zipHash(res.data);
      const line: (string | number | boolean)[] = [n, pre.id, extra, xlsx, textHash(pv.html), pv.pages];
      const entries: GoldenEntry[] = [
        { key: key + '/template', hash: await zipHash(built.data) }, { key: key + '/xlsx', hash: xlsx },
        { key: key + '/preview.html', hash: textHash(pv.html) }, { key: key + '/preview.pages', hash: String(pv.pages) }
      ];
      for (const [name, layout] of PRINT_LAYOUTS) {
        const r = await renderHash(res.data, layout);
        line.push(r.html, r.sugJson);
        entries.push(...printPair(key, name, r));
      }
      const refs = await renderBook(res.data, { file: 'x.xlsx', refs: true, maxPages: 2 });
      const refsHash = textHash(refs.sheets.map(x => x.html).join(''));
      line.push(refsHash); entries.push({ key: key + '/print.refs-2pages.html', hash: refsHash });
      rows.push({ line: line.join(' '), entries });
    }
  }
  return rows;
}

/** The three frozen templates filled by the app (ΦΡΟΥΡΑ, ΗΚΑΙ, Εξοδούχοι) for one unit size, as the old bench did. */
export async function formRows(n: number): Promise<GoldenRow[]> {
  const state = goldenState(n); const rows: GoldenRow[] = [];
  const forms: [string, () => ReturnType<typeof fillFroura>][] = [
    ['froura', () => fillFroura(readTemplate('froura.xlsx'), state, GOLDEN_END)],
    ['hkai', () => fillHkai(readTemplate('hkai.xlsx'), state, GOLDEN_END)],
    ['outs', () => fillOuts(readTemplate('exodouxoi.xlsx'), state, GOLDEN_END)]
  ];
  for (const [name, make] of forms) {
    const key = 'form/n=' + n + '/' + name;
    try {
      const made = await make(); const xlsx = await zipHash(made.data);
      const printed = await renderHash(made.data, PRINT_DEFAULT);
      rows.push({
        line: name + ' ' + n + ' ' + xlsx + ' ' + printed.html,
        entries: [{ key: key + '/xlsx', hash: xlsx }, { key: key + '/print.default.html', hash: printed.html }]
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({ line: name + ' ERR ' + msg, entries: [{ key: key + '/error', hash: textHash(msg) }] });
    }
  }
  return rows;
}

/** Legacy `bench:golden` content for one unit size: report lines, then the three form lines. */
export async function legacyRows(n: number): Promise<GoldenRow[]> {
  return [...(await reportRows(n)), ...(await formRows(n))];
}
