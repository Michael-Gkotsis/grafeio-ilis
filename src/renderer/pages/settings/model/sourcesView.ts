// Pure rules of the «Αρχεία Excel» section: which kinds are read with the people, what a chosen file becomes, and the
// toast after «Νέο αρχείο…».
// Purpose: constants and helpers shared by `useSources` and the dialogs of the section.
// Does NOT: render anything, touch React or call `window.api`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6) so the rules are
//   testable without a render.
// Covering test: test/settings-sources-view.test.ts.
import {
  KIND,
  bestFor,
  defaultBinding,
  suggestCols,
  type FormKind,
  type ListKind,
  type SourceBinding,
} from '../../../../shared/sources';
import { HK } from '../../../../shared/unit';
import type { SourceBook } from '../../../../shared/api';
import { addDays } from '../../../../shared/dates';
import { KIND_NAME, type AppState, type DutyKind, type Settings } from '../../../../shared/domain';
import { postBy } from '../../../../shared/rules';
import { base } from '../../../widgets/sources-alert';

/** Kinds that are also read together with the people (from the same Δυναμολόγιο), besides having their own preview. */
export const WITH_PEOPLE: ListKind[] = ['posts', 'outside'];

/** Kinds whose preview is the sheet dialog (`SheetImportDialog`); the others use the status-records dialog. */
export const SHEET_KINDS: ListKind[] = ['posts', 'outside', 'caps', 'duties', 'cadres', 'cadreAbs'];

/** Value of the «+ Νέο φύλλο» option of the sheet list; a NUL character so it can never be a real sheet name. */
export const NEW_SHEET = '\u0000new';

/**
 * The month before `today`, the default month of a duty-check sheet that does not say which month it is.
 * @param today - ISODate, local time
 * @returns `YYYY-MM` of the last day of the previous month
 */
export const prevMonth = (today: string): string => addDays(today.slice(0, 8) + '01', -1).slice(0, 7);

/**
 * The binding the mapping dialog starts from after the sergeant picked a file for `kind`.
 * @param kind - the kind the file was picked for
 * @param r - the book read from the file
 * @returns the best table the recognition found (writes on, only what is valid from today), else a default binding
 */
export function bindingForPick(kind: ListKind, r: SourceBook): SourceBinding {
  const best = bestFor(kind, r.sheets);
  return best
    ? { file: r.file, sheet: best.sheet, header: best.header, cols: best.cols, write: true, scope: 'active' }
    : defaultBinding(kind, r.file, r.sheets[0]?.name);
}

/** What `srcNewFile` answers when it worked. */
export interface NewFileResult {
  file: string;
  sheet: string;
  sheets?: string[];
  found?: boolean;
  inRoster?: boolean;
}

/**
 * The toast text after «Νέο αρχείο…» / «Νέο φύλλο…».
 * @param kind - the kind the file was made for
 * @param r - the answer of the main process
 * @returns «already has a sheet», «sheet added to the Δυναμολόγιο» or «file made» (the people file lists its sheets)
 */
export function newFileText(kind: ListKind, r: NewFileResult): string {
  return r.found
    ? 'Το ' +
        base(r.file) +
        ' έχει ήδη φύλλο «' +
        r.sheet +
        '» με ' +
        KIND[kind].label.toLowerCase() +
        ': ορίστηκε αυτό. Πάτα «Ανανέωση από Excel» για να διαβαστεί.'
    : r.inRoster
      ? 'Μπήκε φύλλο «' + r.sheet + '» στο ' + base(r.file) + '. Από εδώ και πέρα κάθε αλλαγή γράφεται εκεί.'
      : kind === 'people'
        ? 'Φτιάχτηκε το ' +
          base(r.file) +
          ' (' +
          ['ΣΥΝΟΛΙΚΟ', 'ΘΑΛΑΜΟΙ', ...(r.sheets || [])].join(', ') +
          '). Από εδώ και πέρα κάθε αλλαγή γράφεται εκεί.'
        : 'Φτιάχτηκε το ' + base(r.file) + '. Από εδώ και πέρα κάθε αλλαγή γράφεται εκεί.';
}

/**
 * Whether a binding moved in the file compared with the stored one (then the settings are refreshed first).
 * @param b - the binding the main process found now
 * @param stored - the binding in the settings, if any
 */
export const bindingMoved = (b: SourceBinding, stored: SourceBinding | undefined): boolean =>
  b.header !== stored?.header || JSON.stringify(b.cols) !== JSON.stringify(stored?.cols);

/**
 * The binding for table number `i` found in a new Excel file, with the columns the recognition suggests for `kind`.
 * @param book - the book that was read
 * @param i - index into `book.hits`
 * @param kind - the kind the sergeant gave the table
 */
export function hitBinding(book: SourceBook, i: number, kind: ListKind): SourceBinding {
  const h = book.hits[i];
  const sh = book.sheets.find((s) => s.name === h.sheet);
  return {
    file: book.file,
    sheet: h.sheet,
    header: h.header,
    cols: suggestCols(kind, sh, h.header),
    write: true,
    scope: 'active',
  };
}

/**
 * The tables of a new file that got a kind, and the first kind that got two tables.
 * @param pick - table index → chosen kind (`''` for «Δεν χρειάζεται»)
 * @returns `chosen` as `[index, kind]` pairs in index order, and `dupe`, a kind chosen twice (else undefined)
 */
export function matchChoice(pick: Record<number, ListKind | ''>): {
  chosen: [string, ListKind][];
  dupe: ListKind | undefined;
} {
  const chosen = Object.entries(pick).filter(([, k]) => k) as [string, ListKind][];
  const dupe = chosen.map(([, k]) => k).find((k, i, a) => a.indexOf(k) !== i);
  return { chosen, dupe };
}

/**
 * The history text after the sergeant says what an unknown code of the duty check means.
 * @param state - the app state (for the name of a post)
 * @param raw - the code as written in the Excel
 * @param v - `'ignore'`, `'kind:<duty kind>'` or the key of a post
 */
export function aliasText(state: AppState, raw: string, v: string): string {
  return (
    'ο κωδικός «' +
    raw +
    '» στον έλεγχο υπηρεσιών σημαίνει ' +
    (v === 'ignore'
      ? '«δεν είναι υπηρεσία»'
      : v.startsWith('kind:')
        ? KIND_NAME[v.slice(5) as DutyKind].toLowerCase() + ' χωρίς θέση'
        : postBy(state, v)?.label || v)
  );
}

/**
 * A form label with the user's own service phases that share its template.
 * @param st - the settings (phases)
 * @param phaseBase - `'sven'` or `'spen'`: the form the phases are printed with
 * @param label - the form's own label
 * @returns «ΦΡΟΥΡΑ ΣΒΕΝ (και Α, Β)» when phases use it, else `label`
 */
export const withOwn = (st: Settings, phaseBase: string, label: string): string => {
  const o = (st.phases || []).filter((x) => x.base === phaseBase).map((x) => x.name);
  return o.length ? label + ' (και ' + o.join(', ') + ')' : label;
};

/**
 * The forms with their labels, in the order of the «Έντυπα» and «Φάκελοι αρχείων» cards.
 * @param st - the settings (the own phases show next to ΦΡΟΥΡΑ ΣΒΕΝ / ΣΠΕΝ)
 */
export const formList = (st: Settings): [FormKind, string][] => [
  ['froura', withOwn(st, 'sven', 'ΦΡΟΥΡΑ ΣΒΕΝ')],
  ['frouraSpen', withOwn(st, 'spen', 'ΦΡΟΥΡΑ ΣΠΕΝ')],
  ['hkai', HK()],
  ['outs', 'Εξοδούχοι / Παραμένοντες'],
  ['check', 'Έλεγχος υπηρεσιών (μηνιαίο)'],
];
