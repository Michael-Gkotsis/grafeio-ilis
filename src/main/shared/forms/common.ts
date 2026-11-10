// Small helpers that every form uses.
//
// Purpose: `who`, `titleDate`, `withDate`, `refOf`, `headCells`, `sheetWith` and `unitWords`.
// Does NOT: fill a form or sign a sheet (froura.ts, hkai.ts, outs.ts, sign.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: the helpers do not belong to one form; they moved verbatim from src/main/exports.ts (Phase 4.9a). Texts that go
//   into Excel stay in capitals and dates as dd/mm/yyyy, as before.
// Covering test: test/exports.test.ts, test/head-date-swap.test.ts and the golden hashes of `npm run bench:golden`.
import { parseD, MON_SHORT, type ISODate } from '../../../shared/dates';
import { fullName, type AppState, type Person } from '../../../shared/domain';
import { rankTxt } from '../../../shared/ranks';
import { unitKindOf, unitText } from '../../../shared/unit';
import { type Workbook, colName } from '../excel/xlsx';
import { textCells, tnorm } from '../../tplmap';

/** Rank, specialty in parentheses and full name of a person, e.g. "ΑΣΤΡ (ΠΖ) ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ". */
export const who = (p: Person) => [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ');

/** A date as "05 ΟΚΤ 26" (`longYear`: "05 ΟΚΤ 2026") for the titles of the forms. */
export const titleDate = (d: ISODate, longYear: boolean) => {
  const x = parseD(d);
  return (
    String(x.getDate()).padStart(2, '0') +
    ' ' +
    MON_SHORT[x.getMonth()] +
    ' ' +
    (longYear ? x.getFullYear() : String(x.getFullYear()).slice(2))
  );
};

/**
 * Turns the unit words of the template texts ("ΔΚΤΗΣ ΙΛΗΣ", "2Η ΕΠΧΙΑ") into those of the company, before anything is
 * written (what the app writes, e.g. the heading, already has the right ones). And the other way round: a template of
 * the company used by a squadron gets the words of the squadron. The templates of the app belong to the squadron and
 * are not changed there.
 * @decision Michael 18/10: Λόχος/Τάγμα words in the template texts.
 * @decision Michael 20/10: the reverse, a company template used by a squadron.
 */
export async function unitWords(wb: Workbook, s: AppState) {
  const kind = unitKindOf(s.settings);
  await wb.mapTexts((t) => unitText(t, kind));
}

/**
 * The sheet of a form inside the template: the one the user chose, else the first whose name matches `re`, else the
 * first that has a cell text matching `re`, else the first sheet.
 */
export async function sheetWith(wb: Workbook, want: string | undefined, re: RegExp): Promise<string> {
  if (want && wb.hasSheet(want)) return want;
  const names = wb.sheetNames();
  for (const n of names) if (re.test(tnorm(n))) return n;
  for (const n of names) if (textCells(await wb.values(n, 60, 30)).some((x) => re.test(x.t))) return n;
  return names[0];
}

/**
 * "ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ" gives "ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 12 ΟΚΤ 2026"; a text with no article at the end gets `art`
 * ("ΤΗΝ" by default) before the date. An old date at the end is replaced.
 */
export const withDate = (raw: string, date: string, art = 'ΤΗΝ') => {
  const t = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\d{1,2}([/.\-]\d{1,2}[/.\-]\d{2,4}| [Α-ΩA-Zα-ω]{3,} \d{2,4})\s*$/, '')
    .trim();
  return /(^|\s)(ΤΗΝ|ΤΗΣ|ΓΙΑ|ΣΤΙΣ|ΗΜΕΡΑΣ|ΗΜΕΡΟΜΗΝΙΑ:?)$/i.test(t) || !t
    ? (t + ' ' + date).trim()
    : t + ' ' + art + ' ' + date;
};

/** A1-style reference of 1-based column `c` and row `r`. */
export const refOf = (c: number, r: number) => colName(c) + r;

/**
 * The heading cells: those of the template and, if it has fewer than 3, the empty cells below them, down to (not
 * including) row `stop`; `busy` says a cell is taken.
 */
export function headCells(
  head: { r: number; c: number }[],
  stop: number,
  busy: (r: number, c: number) => boolean,
): { r: number; c: number }[] {
  const out = [...head];
  while (out.length && out.length < 3) {
    const l = out[out.length - 1];
    const r = l.r + 1;
    if ((stop && r >= stop) || busy(r, l.c)) break;
    out.push({ r, c: l.c });
  }
  return out;
}
