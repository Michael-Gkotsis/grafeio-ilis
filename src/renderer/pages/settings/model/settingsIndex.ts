// Search index of the «Ρυθμίσεις» screen: one entry per setting of checklist §16 and one per section.
// Purpose: `SETTINGS_INDEX`, `searchSettings`, `pathOf` and `markParts` for the search box in the screen header.
// Does NOT: render anything or navigate (ui/SettingsSearch.tsx does), and does not import app/ (a page may not): the
//   routes of the settings that live inside other screens are copied from app/paletteActions.ts (see `ROUTES`).
// Owner layer: renderer/pages/settings. Why: U11b, «βρες ρύθμιση» by office words, also by the old location names.
// @decision Michael 12/11: «Αναζήτηση σε κάθε ρύθμιση χωριστά»; nothing is moved, the result opens where it lives.
// Covering test: test/settings-index.test.ts.
import { normGreek, translit } from '../../../../core/lib/text';
import { SET_SECTIONS, dutySubOf, groupOf, sectionLabel } from './screenView';

/** A setting inside «Ρυθμίσεις»: the section key (`tab` route parameter) and, for «Υπηρεσίες και αργίες», the part. */
export interface TabWhere {
  tab: string;
  dsub?: string;
}

/** A setting that lives inside another screen: the route to open it and how the path names it. */
export interface ScreenWhere {
  view: string;
  params?: Record<string, string>;
  /** Name of the screen as the menu shows it, e.g. «Υπηρεσίες». */
  screen: string;
  /** The button or dialog inside it, e.g. «Κανόνες». */
  part: string;
}

/** One searchable setting. `words` are extra Greek words (the old location names), `where` is the card that holds it. */
export interface SettingEntry {
  label: string;
  words: string;
  where: TabWhere | ScreenWhere;
  /** Key of the `SET_GROUPS` group that is this setting's home (checklist §16); missing on the section entries. */
  home?: string;
}

/** @returns true when the entry opens a card of «Ρυθμίσεις» itself */
export const isTabWhere = (where: SettingEntry['where']): where is TabWhere => 'tab' in where;

/**
 * Routes of the settings that stay inside other screens (shortcuts). Copied from app/paletteActions.ts (Ctrl+K) where
 * a command exists there; test/settings-index.test.ts reads that file and checks that the two stay equal.
 */
export const ROUTES = {
  rules: { view: 'guard', params: { gopen: 'rules' }, screen: 'Υπηρεσίες', part: 'Κανόνες' },
  order: { view: 'guard', params: { gopen: 'order' }, screen: 'Υπηρεσίες', part: 'Κανόνες › Σειρά δικαιοσύνης' },
  hours: { view: 'guard', params: { gopen: 'hours' }, screen: 'Υπηρεσίες', part: 'Κανόνες › Ώρες' },
  fixed: { view: 'guard', screen: 'Υπηρεσίες', part: 'Μόνιμοι Λ/Υ' },
  hkai: { view: 'hkai', screen: 'ΗΚΑΙ', part: 'Ενότητες' },
  outs: { view: 'outs', screen: 'Εξοδούχοι', part: 'Μορφή' },
  codes: { view: 'people', params: { ptab: 'imer' }, screen: 'Δυναμολόγιο', part: 'Ημερολόγιο › Κωδικοί' },
  layout: { view: 'guard', screen: 'Υπηρεσίες', part: 'Θέσεις στο χαρτί…' },
  hd: { view: 'hd', screen: 'Ημερήσια Διαταγή', part: 'Πρότυπο Word' },
  reports: { view: 'reports', screen: 'Έντυπα', part: 'Πρότυπα και έτοιμα' },
  views: { view: 'people', screen: 'Δυναμολόγιο', part: 'Αποθηκευμένες λίστες' },
  diag: { view: 'diag', screen: 'Διάγνωση', part: 'Μνήμη και ταχύτητα' },
} satisfies Record<string, ScreenWhere>;

const at = (tab: string, dsub?: string): TabWhere => (dsub ? { tab, dsub } : { tab });

/** The rows of checklist §16 (44 user settings; «Εσωτερικά» is not a user setting and is left out). */
const SETTING_ROWS: SettingEntry[] = [
  { label: 'Τύπος μονάδας: Ίλη ή Λόχος', words: 'Μονάδα και έντυπα', where: at('unit'), home: 'me' },
  { label: 'Κεφαλίδα εντύπων, 3 γραμμές', words: 'Μονάδα και έντυπα τίτλος εντύπων', where: at('unit'), home: 'me' },
  { label: 'Μονάδα στον τίτλο της ΗΚΑΙ', words: 'Μονάδα και έντυπα Ίλη Λόχος', where: at('unit'), home: 'me' },
  { label: 'Τόπος στις υπογραφές', words: 'Μονάδα και έντυπα πόλη', where: at('unit'), home: 'me' },
  { label: 'Τίτλος και λογότυπο', words: 'Θάλαμοι και ουλαμοί εικόνα logo', where: at('brand'), home: 'me' },
  { label: 'ΕΣΣΟ, νέα ΕΣΣΟ, επαναφορά ΕΣΣΟ', words: 'ESSO σειρά κατάταξη', where: at('esso'), home: 'me' },
  { label: 'Θάλαμοι, ουλαμοί, ποιοι ανήκουν πού', words: 'Θάλαμοι και ουλαμοί', where: at('rooms'), home: 'me' },
  { label: 'Στελέχη ανά βαθμό για την ΗΚΑΙ', words: 'Μονάδα και έντυπα Τοποθετημένοι', where: at('unit'), home: 'me' },
  {
    label: 'Έντυπο υπηρεσιών που ισχύει και δικά έντυπα',
    words: 'Θέσεις φάση Υπηρεσίες',
    where: at('duty', 'blocks'),
    home: 'duty',
  },
  {
    label: 'Υπηρεσίες ΣΒΕΝ και ΣΠΕΝ: όνομα, νούμερα, άτομα, ώρες, ένοπλη, ενεργή, σειρά',
    words: 'Υπηρεσίες και αργίες βάρδιες θέσεις νέα υπηρεσία',
    where: at('duty', 'blocks'),
    home: 'duty',
  },
  {
    label: 'Σ.Ι.: σε ποιες υπηρεσίες μπαίνει',
    words: 'Υπηρεσίες και αργίες συντήρηση ικανότητα',
    where: at('duty', 'si'),
    home: 'duty',
  },
  {
    label: 'Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν',
    words: 'Υπηρεσίες και αργίες ιατρικά ποινές άδειες',
    where: at('duty', 'stat'),
    home: 'duty',
  },
  { label: 'Αργίες', words: 'Υπηρεσίες και αργίες γιορτές Πάσχα', where: at('duty', 'hol'), home: 'duty' },
  { label: 'Μόνιμοι Λ/Υ και Δ/Υ', words: 'Υπηρεσίες', where: ROUTES.fixed, home: 'duty' },
  { label: 'Κύκλος υπηρεσιών, ώρα αλλαγής', words: 'Κανόνες Ώρες 14:00', where: ROUTES.hours, home: 'duty' },
  {
    label: 'Ανάπαυση, ΣΚ σε δύο εβδομάδες, ίδιο νούμερο',
    words: 'Κανόνες ημέρες ανάπαυσης Σαββατοκύριακο',
    where: ROUTES.rules,
    home: 'duty',
  },
  {
    label: 'Εναλλαγή υπηρεσιών και νέοι από μέσο όρο',
    words: 'Κανόνες Σειρά δικαιοσύνης',
    where: ROUTES.order,
    home: 'duty',
  },
  { label: 'Αυστηρά άοπλοι και αυστηρή σειρά', words: 'Κανόνες', where: ROUTES.rules, home: 'duty' },
  {
    label: 'Όπλο πριν και μετά από ένοπλη υπηρεσία',
    words: 'Κανόνες Ώρες οπλισμός',
    where: ROUTES.hours,
    home: 'duty',
  },
  { label: 'Θάλαμοι εξόδου Σαββατοκύριακου', words: 'Θάλαμοι και ουλαμοί', where: at('rooms'), home: 'outs' },
  {
    label: 'Ώρες εξόδου, επιστροφής και εκπαίδευσης ανά ημέρα',
    words: 'Κανόνες Ώρες Εξοδούχοι ώρες μέρας',
    where: ROUTES.hours,
    home: 'outs',
  },
  { label: 'Ώρα ΗΚΑΙ', words: 'Κανόνες Ώρες 08:00', where: ROUTES.hours, home: 'outs' },
  {
    label: 'Ενότητες ΗΚΑΙ, οχήματα, «Προβλέπονται», κεφαλίδα',
    words: 'Ενότητες',
    where: ROUTES.hkai,
    home: 'outs',
  },
  {
    label: 'Γραμμές (βαθμοί) της ΗΚΑΙ',
    words: 'Μονάδα και έντυπα Γραμμές και ονόματα',
    where: at('hkrows'),
    home: 'outs',
  },
  { label: 'Μορφή Excel των Εξοδούχων', words: 'Εξοδούχοι Μορφή', where: ROUTES.outs, home: 'outs' },
  {
    label: 'Υπογραφές στη σελίδα 2 των Εξοδούχων',
    words: 'Μονάδα και έντυπα Υπογραφές Εξοδούχοι',
    where: at('sigs'),
    home: 'outs',
  },
  {
    label: 'Λίστες: βαθμοί, Ο/Σ, είδη άδειας, ιατρικών και ποινών, κείμενο στην ΗΚΑΙ',
    words: 'Λίστες στήλη ΗΚΑΙ μόνο σημείωση',
    where: at('lists'),
    home: 'lists',
  },
  {
    label: 'Κωδικοί ημερολογίου κωλυομένων, τίτλος, φύλλα',
    words: 'Δυναμολόγιο Ημερολόγιο Κωδικοί',
    where: ROUTES.codes,
    home: 'lists',
  },
  { label: 'Εισαγωγή Δυναμολογίου', words: 'ΕΣΣΟ Excel', where: at('import'), home: 'files' },
  {
    label: 'Αρχεία Excel ανά είδος: φύλλο, στήλες, εγγραφή',
    words: 'πηγές διαβάζει γράφει',
    where: at('files'),
    home: 'files',
  },
  { label: 'Φάκελοι αρχείων και φάκελος ανά είδος', words: 'Αρχεία Excel Φάκελοι', where: at('files'), home: 'files' },
  {
    label: 'Πρότυπο και φάκελος ανά έντυπο',
    words: 'Πρότυπα εφαρμογής template',
    where: at('templates'),
    home: 'files',
  },
  {
    label: 'Άγνωστοι κωδικοί στον έλεγχο υπηρεσιών',
    words: 'Αρχεία Excel Έλεγχος υπηρεσιών',
    where: at('files'),
    home: 'files',
  },
  {
    label: 'Γράμματα Excel: γραμματοσειρά, μέγεθος, στοίχιση ανά κομμάτι',
    words: 'Γράμματα Excel',
    where: at('excel'),
    home: 'files',
  },
  {
    label: 'Υπογραφές ανά έντυπο',
    words: 'Μονάδα και έντυπα Υπογραφές… θεωρήθηκε διοικητής',
    where: at('sigs'),
    home: 'paper',
  },
  {
    label: 'Θέσεις στο χαρτί, κεφαλίδα αριστερά και δεξιά',
    words: 'Θέσεις στο χαρτί… σε κάθε έντυπο περιθώρια',
    where: ROUTES.layout,
    home: 'paper',
  },
  { label: 'Πρότυπο Word της Ημερήσιας Διαταγής', words: 'ΗΔ ΗΚΑΙ docx', where: ROUTES.hd, home: 'paper' },
  { label: 'Έντυπα: πρότυπα και έτοιμα', words: 'δικά σου Excel', where: ROUTES.reports, home: 'files' },
  { label: 'Αποθηκευμένες λίστες του Δυναμολογίου', words: 'φίλτρα προβολές', where: ROUTES.views, home: 'lists' },
  {
    label: 'Εμφάνιση: θέμα, πυκνότητα, μενού, ζουμ Excel, βαθμός μπροστά',
    words: 'σκοτεινό φωτεινό μέγεθος',
    where: at('look'),
    home: 'pc',
  },
  { label: 'Ώρα και ζώνη ώρας', words: 'ρολόι ώρα του PC', where: at('clock'), home: 'pc' },
  { label: 'Αντίγραφα ασφαλείας, USB, επαναφορά', words: 'backup', where: at('backup'), home: 'pc' },
  { label: 'Ενημερώσεις', words: 'νέα έκδοση update', where: at('update'), home: 'pc' },
  { label: 'Διάγνωση', words: 'Ctrl+Shift+D μνήμη ταχύτητα', where: ROUTES.diag, home: 'pc' },
];

/** One entry per section of the screen, so every tab name finds its own card (old names included). */
const SECTION_ROWS: SettingEntry[] = SET_SECTIONS.map(([tab, label]) => ({ label, words: '', where: { tab } }));

/** Every searchable setting: the sections first (a tab name beats a longer sentence), then checklist §16 in order. */
export const SETTINGS_INDEX: SettingEntry[] = [...SECTION_ROWS, ...SETTING_ROWS];

/** @returns the «Ομάδα › Ενότητα» or «Οθόνη X › Y» path under a result */
export function pathOf(where: SettingEntry['where']): string {
  if (!isTabWhere(where)) return `Οθόνη ${where.screen} › ${where.part}`;
  const base = `${groupOf(where.tab).label} › ${sectionLabel(where.tab)}`;
  if (where.tab !== 'duty') return base;
  const sub = dutySubOf(where.dsub);
  const names: Record<string, string> = { blocks: 'Υπηρεσίες', si: 'Σ.Ι.', stat: 'Καταστάσεις', hol: 'Αργίες' };
  return `${base} › ${names[sub]}`;
}

/** Search texts of an entry: [label, words, path], each in the form the query is compared with. */
const keysOf = (entry: SettingEntry): [string, string, string] => [
  normGreek(entry.label),
  normGreek(entry.words),
  normGreek(pathOf(entry.where)),
];

const KEYS = SETTINGS_INDEX.map(keysOf);

/** The words of a query, accents and case ignored. */
export const wordsOf = (query: string): string[] => normGreek(query).split(/\s+/).filter(Boolean);

/** A word is found in a text as typed, or as Latin letters for a Greek text («esso» finds «ΕΣΣΟ»). */
const has = (text: string, word: string): boolean => text.includes(word) || translit(text).includes(translit(word));

/**
 * Finds settings by their office words.
 * @param query - what the user typed (any case, with or without accents, Latin look-alike letters allowed)
 * @returns matching entries, label hits first and then words/path hits, each group in index order;
 *   empty for an empty query. Every word of the query must be found (AND).
 */
export function searchSettings(query: string): SettingEntry[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  const seen = new Set<string>();
  const found = SETTINGS_INDEX.flatMap((entry, i) => {
    const [label, extra, path] = KEYS[i] as [string, string, string];
    if (!words.every((w) => has(`${label} ${extra} ${path}`, w))) return [];
    // a section and a row with the same name and home are one result (the section is listed first)
    const same = `${label}|${path}`;
    if (seen.has(same)) return [];
    seen.add(same);
    return [{ entry, byLabel: words.every((w) => has(label, w)) }];
  });
  return [...found.filter((f) => f.byLabel), ...found.filter((f) => !f.byLabel)].map((f) => f.entry);
}

/** A piece of a line: plain text or the part that matched. */
export interface MarkPart {
  text: string;
  hit: boolean;
}

/**
 * Splits a line so the typed words can be highlighted (accents ignored: positions are found in the normalised text,
 * which has the same length).
 * @param text - the line to show
 * @param words - the words of the query as `wordsOf` returns them
 * @returns one unmarked part when nothing matches or the normalised length differs
 */
export function markParts(text: string, words: string[]): MarkPart[] {
  const n = normGreek(text).replace(/\s/g, ' ');
  if (n.length !== text.length) return [{ text, hit: false }];
  // the last start at or before this letter covers it, or no start does
  const hit = Array.from({ length: n.length }, (_, i) =>
    words.some((w) => n.lastIndexOf(w, i) + w.length > i && n.lastIndexOf(w, i) >= 0),
  );
  return [...text].reduce<MarkPart[]>((parts, ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[i]) last.text += ch;
    else parts.push({ text: ch, hit: hit[i] as boolean });
    return parts;
  }, []);
}

/**
 * @param group - a `SET_GROUPS` key
 * @returns how many of the 44 settings of checklist §16 have their home in that group (the number on its overview card).
 * @decision UX U11c: the two rows that stay inside their own screen (Έντυπα: πρότυπα και έτοιμα, Αποθηκευμένες λίστες)
 *   are counted in the nearest group (Αρχεία Excel, Λίστες και κωδικοί), so the seven counts add up to 44.
 */
export const groupCount = (group: string): number => SETTING_ROWS.filter((row) => row.home === group).length;
