// Signature lists on the forms. @decision Michael 20/10: as many as you want, in the order shown left to right.
//
// Purpose: the default and saved signature lists per form (`sigDefaults`, `sigsSaved`, `sigsClean`), the unit words
//   that follow the unit kind (`sigsFor`), the form of an export (`sigFormOf`), the «Εξοδούχοι» page-2 choice and the
//   suggestions for a post.
// Does NOT: write any signature into a file (src/main/exports.ts and excel.ts do), store the lists (Settings do) or
//   move the signature blocks on the paper (core/forms/layout.ts does).
// Owner layer: core/forms (pure: no fs, no Electron, no React); imports core/model, core/lib.
// Why: one list per form in Settings (its default), changeable at the moment of export (only for that time, or for the
//   next ones). The unit words follow the unit kind («ΔΚΤΗΣ ΙΛΗΣ» <-> «ΔΚΤΗΣ ΛΟΧΟΥ»), even in signatures typed before
//   the unit changed from ίλη to λόχος. @decision Michael 22/10: all forms work the same way, so the Excel files the
//   app builds itself (check sheet, roster, cadre, weapons) have a signature list too, empty at first as they were.
// Covering tests: test/sigs.test.ts, test/sigs-all-forms.test.ts, test/report-sigs-fix.test.ts,
//   test/report-sigs-none.test.ts.
import type { Settings } from '../model/settings';
import type { ExportKind } from '../model/exportKind';
import { unitKindOf, unitText } from '../model/unit';
import { upper } from '../lib/text';
import type { Sig, SigForm } from '../model/documents';
export type { SigForm, Sig } from '../model/documents';

/** Every form that has a signature list, in the order of the Settings screen. */
export const SIG_FORMS: SigForm[] = [
  'hkai',
  'froura',
  'outs',
  'check',
  'roster',
  'cadre',
  'weapons',
  'imer',
  'hd',
  'reports',
];
/** The Excel files the app builds from scratch (excel.ts): no signatures until the user adds some. */
export const MADE_FORMS: SigForm[] = ['check', 'roster', 'cadre', 'weapons', 'imer', 'hd'];
/** The words that can stand above a post («Ο», «Η», «ΤΟ») or nothing. */
export const ARTS = ['Ο', 'Η', 'ΤΟ', ''];

const S = (art: string, title: string): Sig => ({ art, title });
// As on the app's templates, with the words of an ίλη.
const BASE: Record<Exclude<SigForm, 'reports'>, Sig[]> = {
  hkai: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ')],
  froura: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ'), S('ΤΟ', '2ο ΓΡΑΦΕΙΟ'), S('Ο', 'ΔΚΤΗΣ ΕΠΧΙΑΣ')],
  outs: [S('Ο', 'ΑΛΧΙΑΣ ΙΛΗΣ'), S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ')],
  check: [],
  roster: [],
  cadre: [],
  weapons: [],
  imer: [S('Ο', 'ΟΥΛΑΜΑΓΟΣ'), S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ')],
  hd: [S('Ο', 'ΔΚΤΗΣ ΙΛΗΣ')],
};
/** The signature form of each export kind (the ΠΣΚ kinds use the form of their single-day kind). */
export const sigFormOf = (k: ExportKind): Exclude<SigForm, 'reports'> =>
  k === 'hkai' ? 'hkai' : k === 'froura' || k === 'frouraPsk' ? 'froura' : k === 'check' ? 'check' : 'outs';
/** The names in Settings and in dialogs; `hk`: the unit's word for «ΗΚΑΙ» («ΗΚΑΙ»/«ΗΚΑΛ»). */
export const sigLabel = (f: SigForm, hk = 'ΗΚΑΙ') =>
  ({
    hkai: hk,
    froura: 'ΦΡΟΥΡΑ',
    outs: 'Εξοδούχοι',
    check: 'Έλεγχος υπηρεσιών',
    roster: 'Δυναμολόγιο',
    cadre: 'Στελέχη',
    weapons: 'Οπλισμός',
    imer: 'Ημερολόγιο κωλυομένων',
    hd: 'Ημερήσια Διαταγή',
    reports: 'Έντυπα',
  })[f];

/** The default list of a form; for «Έντυπα» (reports): sergeant and commander, with the names already typed. */
export function sigDefaults(st: Pick<Settings, 'signers'>, form: SigForm): Sig[] {
  if (form !== 'reports') return BASE[form].map((x) => ({ ...x }));
  return [
    { art: 'Ο', title: 'ΛΟΧΙΑΣ', name: st.signers?.sergeant || '' },
    { art: 'Ο', title: 'ΔΙΟΙΚΗΤΗΣ', name: st.signers?.commander || '' },
  ];
}
/** The list of a form as saved in Settings (or its default), with the words unchanged. */
export const sigsSaved = (st: Pick<Settings, 'signers' | 'sigs'>, form: SigForm): Sig[] =>
  st.sigs?.[form]?.map((x) => ({ ...x })) ?? sigDefaults(st, form);
/** True when the user saved an own list for the form. */
export const sigsCustom = (st: Pick<Settings, 'sigs'>, form: SigForm) => !!st.sigs?.[form];

/**
 * Signatures of page 2 (ΔΥΝΑΜΗ) of the Εξοδούχοι «Όλη η δύναμη»: the same as page 1 (default), none, or an own list.
 * @decision Michael 31/10: page 2 has its own choice.
 */
export type OutsSig2 = 'same' | 'none' | 'own';
/** The choices of `OutsSig2` with the label shown in Settings. */
export const OUTS_SIG2: [OutsSig2, string][] = [
  ['same', 'Οι ίδιες με τη σελίδα 1'],
  ['none', 'Καμία'],
  ['own', 'Δικές της'],
];
/** The page-2 choice from Settings; anything unknown means `same`. */
export const outsSig2Of = (st: Pick<Settings, 'outsSig2'>): OutsSig2 =>
  st.outsSig2 === 'none' || st.outsSig2 === 'own' ? st.outsSig2 : 'same';
/** The own list of page 2 (`outsSigs2`); without one it starts from the Εξοδούχοι signatures. */
export const sigsPage2 = (st: Pick<Settings, 'signers' | 'sigs' | 'outsSigs2'>): Sig[] =>
  st.outsSigs2?.map((x) => ({ ...x })) ?? sigsSaved(st, 'outs');

/** For the Excel file: CAPITALS, no empty entries, with the words of the unit kind. */
export function sigsFor(st: Pick<Settings, 'unitKind'>, list: Sig[]): Sig[] {
  const kind = unitKindOf(st);
  const t = (v?: string) => unitText(upper((v || '').replace(/\s+/g, ' ').trim()), kind);
  return list.map((x) => ({ art: t(x.art), title: t(x.title), name: t(x.name) })).filter((x) => x.title || x.name);
}
/** A clean list for saving: spaces trimmed, empty lines dropped. */
export const sigsClean = (list: Sig[]): Sig[] =>
  list
    .map((x) => ({
      art: (x.art || '').trim(),
      title: (x.title || '').replace(/\s+/g, ' ').trim(),
      ...((x.name || '').trim() ? { name: (x.name || '').replace(/\s+/g, ' ').trim() } : {}),
    }))
    .filter((x) => x.title || x.name);
/** True when two lists are equal after cleaning. */
export const sameSigs = (a: Sig[], b: Sig[]) => JSON.stringify(sigsClean(a)) === JSON.stringify(sigsClean(b));

/** The word above a post: «ΤΟ» for «2ο ΓΡΑΦΕΙΟ», «Ο» otherwise. */
export const artOf = (title: string) => (/ΓΡΑΦΕΙΟ|ΤΜΗΜΑ|ΚΕΝΤΡΟ/.test(upper(title)) ? 'ΤΟ' : 'Ο');
/** Suggestions for a post, in the words of the current unit kind. */
export const sigTitles = (st: Pick<Settings, 'unitKind'>) =>
  [
    'ΑΛΧΙΑΣ ΙΛΗΣ',
    'ΔΚΤΗΣ ΙΛΗΣ',
    'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ',
    'ΥΔΚΤΗΣ ΙΛΗΣ',
    'ΔΚΤΗΣ ΕΠΧΙΑΣ',
    'ΥΔΚΤΗΣ ΕΠΧΙΑΣ',
    '2ο ΓΡΑΦΕΙΟ',
    'ΑΞΚΟΣ ΥΠΗΡΕΣΙΑΣ',
    'ΕΠΟΠΤΗΣ',
    'ΛΟΧΙΑΣ',
    'ΔΙΟΙΚΗΤΗΣ',
  ].map((t) => unitText(t, unitKindOf(st)));
/** One line for lists and buttons: «Ο ΑΛΧΙΑΣ ΙΛΗΣ · Ο ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ». */
export const sigsText = (list: Sig[]) =>
  list.length
    ? list.map((x) => [x.art, x.title].filter(Boolean).join(' ') + (x.name ? ' (' + x.name + ')' : '')).join(' · ')
    : 'καμία';
