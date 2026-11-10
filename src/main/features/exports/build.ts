// Builds the forms and Excel books of the app in memory: the filled ΦΡΟΥΡΑ / ΗΚΑΙ / Εξοδούχοι and the app's own books.
//
// Purpose: `produce` (a filled form for an export kind), `made` (an own book, signed), `X` (the heavy fillers on the
//   worker thread) and `excel` (the lazily loaded Excel module).
// Does NOT: write any file, ask for confirmation, run commands or remember what was made (service.ts / outs.ts).
// Owner layer: main (architecture), `features/exports`. Imports app/*, shared/*, core files and `forms.ts`.
// Why: the export button, the saved-forms refresh, the print preview of own books and the ESSO copy all need the same
//   bytes. Moved verbatim from main.ts (Phase 4.2b); the output must not change by one byte (CLAUDE.md rule 1).
// Covering test: test/exports*.test.ts, test/golden*.test.ts; `npm run bench:golden` (hashes identical).
import fs from 'fs';
import path from 'path';
import { dm, dow, pskDays, type ISODate } from '../../../shared/dates';
import { frouraFile, isOutsAll, type AppState } from '../../../shared/domain';
import type { ImerReq } from '../../../shared/imer';
import type { LayoutSheet } from '../../../shared/layout';
import type { Sig } from '../../../shared/sigs';
import type { ExportKind } from '../../../shared/api';
import type { FormKind } from '../../../shared/sources';
import { fillFroura, fillHkai, fillOuts, signMade } from '../../exports';
import { off } from '../../offload';
import { valuesHash } from '../../sources';
import { mergeFirstSheets, mergeSheets } from '../../xlsx';
import { zipHash } from '../../ziphash';
import { MADE_FORM, type MadeKind } from '../../app/tables';
import { formBinding, formOf, formTpl } from './forms';

// the heavy ExcelJS is loaded only when it is needed
const nodeRequire: NodeRequire = require;
/** The Excel-making module (`excel.ts`), loaded on first use. */
export const excel = (): typeof import('../../excel') => nodeRequire(path.join(__dirname, 'excel.js'));
// The heavy form work on the Excel thread (offload.ts), with state s; when the thread is not running, here as before
/** The form fillers and hashes, each run on the Excel worker thread when it is up, else in this process. */
export const X = {
  froura: (buf: Buffer, s: AppState, d: ISODate, sheet?: string, sigs?: Sig[] | null) =>
    off('fillFroura', [buf, d, undefined, sheet, sigs], () => fillFroura(buf, s, d, undefined, sheet, sigs), s),
  hkai: (buf: Buffer, s: AppState, d: ISODate, opts: Parameters<typeof fillHkai>[3]) =>
    off('fillHkai', [buf, d, opts], () => fillHkai(buf, s, d, opts), s),
  outs: (buf: Buffer, s: AppState, d: ISODate, sheets: Parameters<typeof fillOuts>[3], sigs?: Sig[] | null) =>
    off('fillOuts', [buf, d, sheets, sigs], () => fillOuts(buf, s, d, sheets, sigs), s),
  merge: (bufs: Buffer[], names: string[], pick?: string) =>
    off('mergeFirstSheets', [bufs, names, pick], () => mergeFirstSheets(bufs, names, pick)),
  mergeSheets: (bufs: Buffer[], picks: string[][], names: string[][]) =>
    off('mergeSheets', [bufs, picks, names], () => mergeSheets(bufs, picks, names)),
  zipHash: (b: Buffer) => off('zipHash', [b], () => zipHash(b)),
  valuesHash: (b: Buffer) => off('valuesHash', [b], () => valuesHash(b)),
};
// The Excel files the app makes (excel.ts), with their signatures and whatever was moved on the paper (Michael, 22/10)
/**
 * Builds one of the app's own Excel books and signs it.
 * @param date ISODate, local time
 * @param sigs signatures for this time only (else Settings')
 */
export async function made(
  what: MadeKind,
  date: ISODate,
  s: AppState,
  sigs?: Sig[] | null,
  imer?: ImerReq,
): Promise<{ name: string; data: Buffer; warnings: string[]; layout: LayoutSheet[] }> {
  const m =
    what === 'check'
      ? await off('dutyCheck', [date.slice(0, 7)], () => excel().dutyCheck(s, date.slice(0, 7)), s)
      : what === 'lists'
        ? await excel().rosterLists(s, date)
        : what === 'rosterPrint'
          ? await excel().rosterPrint(s, date)
          : what === 'rosterPreview'
            ? await excel().rosterPreview(s, date)
            : what === 'cadre'
              ? await excel().cadreLists(s, date)
              : what === 'imer'
                ? await excel().imerBook(s, imer!)
                : await excel().weaponsBook(s, date);
  const form = MADE_FORM[what];
  const r = await off('signMade', [m.data, form, m.marks, sigs], () => signMade(m.data, s, form, m.marks, sigs), s);
  return { name: m.name, ...r };
}
// The filled form (without writing it): the same for the button and for the automatic refresh of those already made
// sigs: signatures for this time only (else Settings' or the form's)
/** Fills the form of `kind` for `date` from `s` and answers the file name and bytes; writes nothing. */
export async function produce(
  kind: ExportKind,
  date: ISODate,
  s: AppState,
  sigs?: Sig[] | null,
): Promise<{ name: string; data: Buffer; warnings?: string[]; layout?: LayoutSheet[] }> {
  const form = formOf(kind, s);
  if (kind === 'check') return made('check', date, s, sigs);
  const b = formBinding(form);
  const buf = await fs.promises.readFile(formTpl(form as Exclude<FormKind, 'check'>));
  if (kind === 'frouraPsk' || kind === 'outsPsk') {
    // ΠΣΚ: one file, one sheet per day (Fri, Sat, Sun)
    const fr = kind === 'frouraPsk';
    const days = pskDays(date);
    const parts = await Promise.all(
      days.map((d) =>
        fr ? X.froura(buf, s, d, b.sheet, sigs) : X.outs(buf, s, d, { outs: b.sheet, stay: b.sheet2 }, sigs),
      ),
    );
    const tabs = days.map((d) => dow(d).toUpperCase() + ' ' + dm(d).replace('/', '-'));
    // «Όλη η δύναμη»: two sheets per day, «ΠΑΡ 30-10» (outs) and «ΠΑΡ 30-10 ΔΥΝ» (the rest of the force); else the
    // first sheet of each day
    const two = !fr && isOutsAll(s.settings) && parts.every((x) => x.sheets && x.sheets.length === 2);
    const data = two
      ? await X.mergeSheets(
          parts.map((x) => x.data),
          parts.map((x) => x.sheets!),
          tabs.map((n) => [n, n + ' ΔΥΝ']),
        )
      : await X.merge(
          parts.map((x) => x.data),
          tabs,
          parts[0].sheet || (fr ? b.sheet : undefined),
        );
    return {
      name:
        (fr ? frouraFile(s.settings) : isOutsAll(s.settings) ? 'ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ ' : 'ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ ') +
        'ΠΣΚ ' +
        dm(days[0]).replace('/', '-') +
        ' έως ' +
        dm(days[2]).replace('/', '-') +
        '-' +
        days[2].slice(0, 4) +
        '.xlsx',
      data,
      warnings: [...new Set(parts.flatMap((x) => x.warnings || []))],
    };
  }
  if (kind === 'froura') return X.froura(buf, s, date, b.sheet, sigs);
  // ΗΚΑΙ: the positions are found from the texts of the form (and of your own in the templates folder), and on top of
  // that whatever you corrected
  if (kind === 'hkai') return X.hkai(buf, s, date, { front: b.sheet, back: b.sheet2, cells: b.cells, sigs });
  return X.outs(buf, s, date, { outs: b.sheet, stay: b.sheet2 }, sigs);
}
