// Ίλη ή Λόχος (Michael, 18/10): η αναφορά λέγεται ΗΚΑΙ σε επιλαρχία/ίλη και ΗΚΑΛ σε τάγμα/λόχο. Ο τύπος της μονάδας
// διαλέγεται στη Νέα ΕΣΣΟ (και στις Ρυθμίσεις › Μονάδα και έντυπα) και αλλάζει μόνος του τα ονόματα στην εφαρμογή,
// την κεφαλίδα, τις υπογραφές και τις γραμμές των αξιωματικών στα έντυπα. Χωρίς επιλογή: Ίλη, όπως πριν.
import type { Settings } from './domain';

export type UnitKind = 'ili' | 'lochos';
export const UNIT_KINDS: { id: UnitKind; label: string; report: string }[] = [
  { id: 'ili', label: 'Ίλη / Επιλαρχία', report: 'ΗΚΑΙ' },
  { id: 'lochos', label: 'Λόχος / Τάγμα', report: 'ΗΚΑΛ' }
];
export const unitKindOf = (st?: Pick<Settings, 'unitKind'> | null): UnitKind => (st?.unitKind === 'lochos' ? 'lochos' : 'ili');
export const reportOf = (st?: Pick<Settings, 'unitKind'> | null) => (unitKindOf(st) === 'lochos' ? 'ΗΚΑΛ' : 'ΗΚΑΙ');

// Ο τύπος που ισχύει τώρα, για τα κείμενα της οθόνης (το ορίζει το store όταν φορτώνει ή αλλάζει η κατάσταση,
// και η διεργασία main για ό,τι γράφει στο ιστορικό)
let cur: UnitKind = 'ili';
let names: Record<string, string> = {};
export const setUnitKind = (st?: Pick<Settings, 'unitKind' | 'lists'> | null) => { cur = unitKindOf(st); names = st?.lists?.hkNames || {}; };
// «ΗΚΑΙ» ή «ΗΚΑΛ»
export const HK = () => (cur === 'lochos' ? 'ΗΚΑΛ' : 'ΗΚΑΙ');
// η μονάδα σε κείμενα της οθόνης: «Ίλη», «Ίλης», «Όλη η Ίλη»
export const UNIT = () => (cur === 'lochos' ? { nom: 'Λόχος', gen: 'Λόχου', all: 'Όλος ο Λόχος' } : { nom: 'Ίλη', gen: 'Ίλης', all: 'Όλη η Ίλη' });

// Γραμμές των αξιωματικών στην ΗΚΑΛ (οι άλλες ίδιες). Το κλειδί μένει της ΗΚΑΙ: με αυτό είναι γραμμένα στελέχη, ρυθμίσεις, χειροκίνητα.
const ROW_LOCHOS: Record<string, string> = { 'Επίλαρχοι': 'Ταγματάρχες', 'Ίλαρχοι': 'Λοχαγοί', 'Ανθυπίλαρχοι-Ανθλγοι': 'Υπολοχαγοί-Ανθυπολοχαγοί' };
// Το όνομα μιας γραμμής: το δικό σου (Ρυθμίσεις › «Άλλο όνομα», lists.hkNames), αλλιώς του τύπου μονάδας.
// st: οι ρυθμίσεις (στα έντυπα), ή μόνο ο τύπος μονάδας με τα ονόματα της οθόνης· χωρίς τίποτα, ό,τι ισχύει στην οθόνη.
export const hkRowName = (key: string, kind: UnitKind) => (kind === 'lochos' && ROW_LOCHOS[key]) || key;
export function hkRowLabel(key: string, st: UnitKind | Pick<Settings, 'unitKind' | 'lists'> | null = cur): string {
  const kind = typeof st === 'string' ? st : unitKindOf(st);
  const own = (typeof st === 'string' ? names : st?.lists?.hkNames || {})[key]?.trim();
  return own || hkRowName(key, kind);
}
// όλα τα ονόματα που μπορεί να έχει μια βασική γραμμή σε ένα έντυπο (για να βρεθεί σε δικό σου template)
export const hkRowNames = (key: string) => [key, ...(ROW_LOCHOS[key] ? [ROW_LOCHOS[key]] : [])];

// ------------------------------------------------------------------ λέξεις της μονάδας σε κείμενα
// [ίλη, λόχος, γένος στην ίλη, γένος στον λόχο, πτώση]: το τακτικό από μπροστά αλλάζει γένος («4ης ΙΛΗΣ» → «4ου ΛΟΧΟΥ»).
// Με τη σειρά που προτιμάται όταν γυρνά πίσω (ΤΑΓΜΑ → ΕΠΧΙΑ, όπως στα έντυπα).
type G = 'f' | 'm' | 'n'; type C = 'nom' | 'gen';
const WORDS: [string, string, G, G, C][] = [
  ['ΙΛΗΣ', 'ΛΟΧΟΥ', 'f', 'm', 'gen'], ['ΙΛΗ', 'ΛΟΧΟΣ', 'f', 'm', 'nom'], ['Ίλης', 'Λόχου', 'f', 'm', 'gen'], ['Ίλη', 'Λόχος', 'f', 'm', 'nom'],
  ['ΕΠΧΙΑΣ', 'ΤΑΓΜΑΤΟΣ', 'f', 'n', 'gen'], ['ΕΠΧΙΑ', 'ΤΑΓΜΑ', 'f', 'n', 'nom'], ['ΕΠΙΛΑΡΧΙΑΣ', 'ΤΑΓΜΑΤΟΣ', 'f', 'n', 'gen'], ['ΕΠΙΛΑΡΧΙΑ', 'ΤΑΓΜΑ', 'f', 'n', 'nom'],
  ['Επιλαρχίας', 'Τάγματος', 'f', 'n', 'gen'], ['Επιλαρχία', 'Τάγμα', 'f', 'n', 'nom'],
  ['ΗΚΑΙ', 'ΗΚΑΛ', 'n', 'n', 'nom']
];
const ORD: Record<G, Record<C, string>> = { f: { nom: 'η', gen: 'ης' }, m: { nom: 'ος', gen: 'ου' }, n: { nom: 'ο', gen: 'ου' } };
const reOf = (words: string[]) => new RegExp('(?:(?<![\\p{L}\\d])(\\d+)(ΟΣ|ΟΥ|ΗΣ|ος|ου|ης|Ο|Η|ο|η)(\\s+))?(?<!\\p{L})(' + [...words].sort((a, b) => b.length - a.length).join('|') + ')(?!\\p{L})', 'gu');
const RE: Record<UnitKind, RegExp> = { lochos: reOf(WORDS.map(w => w[0])), ili: reOf(WORDS.map(w => w[1])) };
// Κείμενο με τις λέξεις της μονάδας για τον τύπο to: «2η ΕΠΧΙΑ Ν/Σ» → «2ο ΤΑΓΜΑ Ν/Σ», «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ» (και αντίστροφα)
export function unitText(s: string, to: UnitKind): string {
  if (!s) return s;
  return s.replace(RE[to], (_m, n: string | undefined, suf: string | undefined, sp: string | undefined, w: string) => {
    const e = WORDS.find(x => x[to === 'lochos' ? 0 : 1] === w)!;
    const word = to === 'lochos' ? e[1] : e[0];
    if (!n) return word;
    const o = ORD[to === 'lochos' ? e[3] : e[2]][e[4]];
    return n + (suf === suf!.toLowerCase() ? o : o.toUpperCase()) + sp + word;
  });
}
// Η κεφαλίδα και η μονάδα του τίτλου για άλλον τύπο μονάδας (στην αλλαγή, για να τα δει και να τα διορθώσει ο χρήστης)
export const unitSettingsFor = (st: Pick<Settings, 'unit' | 'unitName'>, to: UnitKind): Pick<Settings, 'unit' | 'unitName'> => ({
  unit: st.unit.map(u => unitText(u, to)) as Settings['unit'], unitName: unitText(st.unitName, to)
});
// Κείμενο εντύπου (π.χ. «ΑΛΧΙΑΣ ΙΛΗΣ» του template) για τη μονάδα των ρυθμίσεων: στην ίλη μένει όπως είναι
export const formText = (st: Pick<Settings, 'unitKind'> | null | undefined, t: string) => (unitKindOf(st) === 'lochos' ? unitText(t, 'lochos') : t);
// Η κεφαλίδα της ΗΚΑΙ (2 γραμμές πάνω αριστερά): η δική σου (settings.hkai.head), αλλιώς αυτή του εντύπου
export const HK_HEAD_FORM = ['ΚΕΤΘ', '2Η ΕΠΧΙΑ'];
export const hkHeadOf = (st: Pick<Settings, 'unitKind' | 'hkai'>) => HK_HEAD_FORM.map((d, i) => formText(st, (st.hkai?.head?.[i] || '').trim() || d));
