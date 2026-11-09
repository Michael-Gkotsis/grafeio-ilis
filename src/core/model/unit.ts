// Unit kind (ίλη or λόχος): which report name, unit words and officer rows the app uses.
//
// Purpose: UnitKind readers (unitKindOf, reportOf), the screen-wide current kind (setUnitKind, HK, UNIT), the
//   ίλη ↔ λόχος text converter (unitText, formText) and the «ΗΚΑΙ» header.
// Does NOT: store the choice (Settings.unitKind) or define the UnitKind type (it lives in settings.ts to keep the
//   model free of type cycles; this file re-exports it).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: the report is «ΗΚΑΙ» for a squadron and «ΗΚΑΛ» for a company; one switch renames everything the app prints.
// @decision Michael 18/10: the unit kind is chosen in «Νέα ΕΣΣΟ» (and Settings › «Μονάδα και έντυπα»); no choice =
//   ίλη, as before.
// Covering tests: test/unit.test.ts, test/units.test.ts.
import type { Settings, UnitKind } from './settings';

export type { UnitKind };
export const UNIT_KINDS: { id: UnitKind; label: string; report: string }[] = [
  { id: 'ili', label: 'Ίλη / Επιλαρχία', report: 'ΗΚΑΙ' },
  { id: 'lochos', label: 'Λόχος / Τάγμα', report: 'ΗΚΑΛ' },
];
export const unitKindOf = (st?: Pick<Settings, 'unitKind'> | null): UnitKind =>
  st?.unitKind === 'lochos' ? 'lochos' : 'ili';
export const reportOf = (st?: Pick<Settings, 'unitKind'> | null) => (unitKindOf(st) === 'lochos' ? 'ΗΚΑΛ' : 'ΗΚΑΙ');

// The kind in force now, for screen texts (set by the store when the state loads or changes,
// and by the main process for what it writes into the history)
let cur: UnitKind = 'ili';
let names: Record<string, string> = {};
export const setUnitKind = (st?: Pick<Settings, 'unitKind' | 'lists'> | null) => {
  cur = unitKindOf(st);
  names = st?.lists?.hkNames || {};
};
// «ΗΚΑΙ» or «ΗΚΑΛ»
export const HK = () => (cur === 'lochos' ? 'ΗΚΑΛ' : 'ΗΚΑΙ');
// the unit in screen texts: «Ίλη», «Ίλης», «Όλη η Ίλη»
export const UNIT = () =>
  cur === 'lochos'
    ? { nom: 'Λόχος', gen: 'Λόχου', all: 'Όλος ο Λόχος' }
    : { nom: 'Ίλη', gen: 'Ίλης', all: 'Όλη η Ίλη' };

// Officer rows in «ΗΚΑΛ» (the others are the same). The key stays the «ΗΚΑΙ» one: cadre, settings and manual entries
// use it.
const ROW_LOCHOS: Record<string, string> = {
  Επίλαρχοι: 'Ταγματάρχες',
  Ίλαρχοι: 'Λοχαγοί',
  'Ανθυπίλαρχοι-Ανθλγοι': 'Υπολοχαγοί-Ανθυπολοχαγοί',
};
// The name of a row: the user's own (Settings › «Άλλο όνομα», lists.hkNames), otherwise the unit kind's.
// st: the settings (in forms), or just the unit kind with the screen names; nothing: what is in force on screen.
export const hkRowName = (key: string, kind: UnitKind) => (kind === 'lochos' && ROW_LOCHOS[key]) || key;
export function hkRowLabel(key: string, st: UnitKind | Pick<Settings, 'unitKind' | 'lists'> | null = cur): string {
  const kind = typeof st === 'string' ? st : unitKindOf(st);
  const own = (typeof st === 'string' ? names : st?.lists?.hkNames || {})[key]?.trim();
  return own || hkRowName(key, kind);
}
// every name a base row may have in a form (to find it in a template of the user's own)
export const hkRowNames = (key: string) => [key, ...(ROW_LOCHOS[key] ? [ROW_LOCHOS[key]] : [])];

// ------------------------------------------------------------------ unit words in texts
// [ίλη, λόχος, gender in ίλη, gender in λόχος, case]: the ordinal in front changes gender («4ης ΙΛΗΣ» → «4ου ΛΟΧΟΥ»).
// In the order preferred when converting back (ΤΑΓΜΑ → ΕΠΧΙΑ, as in the forms).
type G = 'f' | 'm' | 'n';
type C = 'nom' | 'gen';
const WORDS: [string, string, G, G, C][] = [
  ['ΙΛΗΣ', 'ΛΟΧΟΥ', 'f', 'm', 'gen'],
  ['ΙΛΗ', 'ΛΟΧΟΣ', 'f', 'm', 'nom'],
  ['Ίλης', 'Λόχου', 'f', 'm', 'gen'],
  ['Ίλη', 'Λόχος', 'f', 'm', 'nom'],
  ['ΕΠΧΙΑΣ', 'ΤΑΓΜΑΤΟΣ', 'f', 'n', 'gen'],
  ['ΕΠΧΙΑ', 'ΤΑΓΜΑ', 'f', 'n', 'nom'],
  ['ΕΠΙΛΑΡΧΙΑΣ', 'ΤΑΓΜΑΤΟΣ', 'f', 'n', 'gen'],
  ['ΕΠΙΛΑΡΧΙΑ', 'ΤΑΓΜΑ', 'f', 'n', 'nom'],
  ['Επιλαρχίας', 'Τάγματος', 'f', 'n', 'gen'],
  ['Επιλαρχία', 'Τάγμα', 'f', 'n', 'nom'],
  ['ΗΚΑΙ', 'ΗΚΑΛ', 'n', 'n', 'nom'],
];
const ORD: Record<G, Record<C, string>> = {
  f: { nom: 'η', gen: 'ης' },
  m: { nom: 'ος', gen: 'ου' },
  n: { nom: 'ο', gen: 'ου' },
};
const reOf = (words: string[]) =>
  new RegExp(
    '(?:(?<![\\p{L}\\d])(\\d+)(ΟΣ|ΟΥ|ΗΣ|ος|ου|ης|Ο|Η|ο|η)(\\s+))?(?<!\\p{L})(' +
      [...words].sort((a, b) => b.length - a.length).join('|') +
      ')(?!\\p{L})',
    'gu',
  );
const RE: Record<UnitKind, RegExp> = { lochos: reOf(WORDS.map((w) => w[0])), ili: reOf(WORDS.map((w) => w[1])) };
// Text with the unit words of kind `to`: «2η ΕΠΧΙΑ Ν/Σ» → «2ο ΤΑΓΜΑ Ν/Σ», «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ» (and back)
export function unitText(s: string, to: UnitKind): string {
  if (!s) return s;
  return s.replace(RE[to], (_m, n: string | undefined, suf: string | undefined, sp: string | undefined, w: string) => {
    const e = WORDS.find((x) => x[to === 'lochos' ? 0 : 1] === w)!;
    const word = to === 'lochos' ? e[1] : e[0];
    if (!n) return word;
    const o = ORD[to === 'lochos' ? e[3] : e[2]][e[4]];
    return n + (suf === suf!.toLowerCase() ? o : o.toUpperCase()) + sp + word;
  });
}
// The header and the unit of the title for another unit kind (on a switch, so the user can see and correct them)
export const unitSettingsFor = (
  st: Pick<Settings, 'unit' | 'unitName'>,
  to: UnitKind,
): Pick<Settings, 'unit' | 'unitName'> => ({
  unit: st.unit.map((u) => unitText(u, to)) as Settings['unit'],
  unitName: unitText(st.unitName, to),
});
// Form text (e.g. «ΑΛΧΙΑΣ ΙΛΗΣ» of the template) for the settings' unit kind: for ίλη it stays as it is
export const formText = (st: Pick<Settings, 'unitKind'> | null | undefined, t: string) =>
  unitKindOf(st) === 'lochos' ? unitText(t, 'lochos') : t;
// The «ΗΚΑΙ» header (2 lines, top left): the user's own (settings.hkai.head), otherwise the form's
export const HK_HEAD_FORM = ['ΚΕΤΘ', '2Η ΕΠΧΙΑ'];
export const hkHeadOf = (st: Pick<Settings, 'unitKind' | 'hkai'>) =>
  HK_HEAD_FORM.map((d, i) => formText(st, (st.hkai?.head?.[i] || '').trim() || d));
