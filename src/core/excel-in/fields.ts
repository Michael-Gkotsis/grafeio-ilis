// The fields of the Ίλη's Excel tables and the kinds of list (Michael, 11/10).
//
// Purpose: `FieldDef`, `PERSON_FIELDS`, `KINDS` / `KIND` (what each list kind reads: sheet and title patterns,
//   header patterns, the status types it holds) and the helpers that answer questions about a kind (`fieldsOf`,
//   `isStatusKind`, `canCreate`…).
// Does NOT: recognize a table in a sheet (tableFind.ts) or read its rows (tableRows.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/roster.
// Why: for each kind of data (punishments, medical, leave…) the app reads which file, sheet and table; the header
//   patterns are the only place that says what a column is called, so the recognition, the mapping screen and the
//   writing all use these definitions. Header patterns are regular expressions on `headText` (capitals, no accents).
// Covering tests: test/sources.test.ts, test/new-files.test.ts, test/cadre-excel.test.ts, test/column-heads.test.ts.
import type { DutyKind } from '../model/duty';
import type { TypeKey } from '../model/status';
import { DN_HEAD } from './rosterColumns';
import type { ListKind, FormKind } from '../model/bindings';
export type { HkaiMap, FormBinding, SourceBinding, FormKind, ListKind } from '../model/bindings';

/**
 * The kinds of list that hold one `Status` per row: the ones the app both reads from and writes to the Ίλη's Excel
 * files.
 */
export type StatusKind = 'punish' | 'medical' | 'hospital' | 'step' | 'leave' | 'dn';
/** Every form kind the app fills from a template (`FormKind`), in the order of the forms screen. */
export const FORM_KINDS: FormKind[] = ['froura', 'frouraSpen', 'hkai', 'outs', 'check'];
/**
 * One field of a table. `k`: key in the column map; `label`: the name the user sees; `head`: the header written in a
 * new table; `re`: recognizes the header in a file (tested on `headText`); `req`: must be mapped; `date`: holds a
 * date.
 */
export interface FieldDef {
  k: string;
  label: string;
  re: RegExp;
  head: string;
  req?: boolean;
  date?: boolean;
}
const F = (k: string, label: string, head: string, re: RegExp, o: Partial<FieldDef> = {}): FieldDef => ({
  k,
  label,
  head,
  re,
  ...o,
});
/** The person fields every table can have (rank, name, ΑΣΜ, phone, room…); `fieldsOf` adds the ones of the kind. */
export const PERSON_FIELDS: FieldDef[] = [
  F('aa', 'Α/Α', 'Α/Α', /^Α\s*\/\s*Α$|^Α\.?\s*Α\.?$/),
  F('rank', 'Βαθμός', 'Βαθμός', /^ΒΑΘΜΟΣ$|^ΒΘΜ$|^ΒΑΘΜ$/),
  // origin (ΕΠΟΠ, ΟΒΑ…): if the table has no such column, it is written in front of the rank («ΕΠΟΠ ΛΧΙΑΣ»)
  F('origin', 'Προέλευση (ΕΠΟΠ, ΟΒΑ…)', 'Προέλευση', /^ΠΡΟΕΛΕΥΣΗ$|^ΠΡΟΕΛ$/),
  F('spec', 'Ο/Σ (ειδικότητα)', 'Ο/Σ', /^Ο\s*[/\-]\s*Σ$|^ΕΙΔΙΚΟΤΗΤΑ$/),
  F('last', 'Επώνυμο', 'Επώνυμο', /^ΕΠΩΝΥΜΟ$|^ΕΠΙΘΕΤΟ$/),
  F('first', 'Όνομα', 'Όνομα', /^ΟΝΟΜΑ$/),
  F('name', 'Ονοματεπώνυμο (σε ένα κελί)', 'Ονοματεπώνυμο', /^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$|^ΕΠΩΝΥΜΟ\s*[-–,]?\s*ΟΝΟΜΑ$/),
  F('father', 'Πατρώνυμο', 'Πατρώνυμο', /^ΠΑΤΡΩΝΥΜΟ$/),
  F('asm', 'ΑΣΜ', 'ΑΣΜ', /^ΑΣΜ$|^Α\s*\.?\s*Σ\s*\.?\s*Μ$|ΑΡ.*ΜΗΤΡΩΟΥ/),
  F('phone', 'Τηλέφωνο', 'Τηλέφωνο', /ΚΙΝΗΤΟ|ΤΗΛΕΦΩΝΟ|^ΤΗΛ$/),
  F('room', 'Θάλαμος', 'Θάλαμος', /^ΘΑΛΑΜΟΣ$|^ΘΑΛ$/),
];
const FROM = (head = 'ΑΠΟ') =>
  F('from', 'Από (ημερομηνία)', head, /^ΑΠΟ$|^ΕΝΑΡΞΗ|^ΕΙΣ$|^ΕΙΣΟΔΟΣ$|^ΗΜ\w* ΕΙΣ/, { req: true, date: true });
const TO = (head = 'ΕΩΣ') => F('to', 'Έως (ημερομηνία)', head, /^ΕΩΣ$|^ΛΗΞΗ|^ΕΞ$|^ΕΞΟΔΟΣ$|^ΗΜ\w* ΕΞ/, { date: true });
const NOTE = F('note', 'Παρατηρήσεις', 'Παρατηρήσεις', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΣΗΜΕΙΩΣΕΙΣ$/);
// Leave hours (Michael, 13/10): optional columns; when missing and a leave has a time, the app adds them (timeCols)
const TOUT = F('tout', 'Ώρα αναχώρησης', 'ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ', /^ΩΡΑ ΑΝΑΧ|^ΩΡΑ ΑΠΟ$|^ΩΡΑ ΕΝΑΡΞ|^ΩΡΑ ΕΞΟΔ/);
const TIN = F('tin', 'Ώρα επιστροφής', 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ', /^ΩΡΑ ΕΠΙΣΤΡ|^ΩΡΑ ΕΩΣ$|^ΩΡΑ ΛΗΞ|^ΩΡΑ ΕΠΑΝ/);
/** Keys of the optional time columns (leave departure and return). */
export const TIME_FIELDS = ['tout', 'tin'];
// Hospital, sick leave and ΣΤΕΠ (Michael, 18/10): admission time and discharge time, the same way
const HOUT = F('tout', 'Ώρα εισαγωγής', 'ΩΡΑ ΕΙΣΑΓΩΓΗΣ', /^ΩΡΑ ΕΙΣ|^ΩΡΑ ΑΠΟ$/);
const HIN = F('tin', 'Ώρα εξόδου', 'ΩΡΑ ΕΞΟΔΟΥ', /^ΩΡΑ ΕΞ|^ΩΡΑ ΕΩΣ$/);
// Leave direction (1/11): optional column, appended only when some leave has a direction (like the hours, timeCols)
const DEST = F('dest', 'Κατεύθυνση', 'ΚΑΤΕΥΘΥΝΣΗ', /ΚΑΤΕΥΘΥΝΣ|ΠΡΟΟΡΙΣΜ/);

/**
 * How the app finds and reads one kind of list. `help`: the line of the mapping screen; `sheetRe` / `titleRe`:
 * recognize the sheet name and the title above the table; `types`: the status types it holds; `title`: the title of a
 * new table; `write`: the app writes to it.
 */
export interface KindDef {
  id: ListKind;
  label: string;
  help: string;
  fields: FieldDef[];
  sheetRe: RegExp;
  titleRe?: RegExp;
  types?: TypeKey[];
  title: string;
  write: boolean;
}
/**
 * Every kind of list with its fields, in the order of the mapping screen.
 * @decision Michael 3/11: cadres have their own Excel (ΣΤΕΛΕΧΗ.xlsx) with the two kinds `cadres` and `cadreAbs`.
 */
export const KINDS: KindDef[] = [
  {
    id: 'people',
    label: 'Προσωπικό (Δυναμολόγιο)',
    help: 'Βαθμός, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος, δικαίωμα ΔΝ, IBAN, ΑΜΚΑ, ΑΦΜ',
    title: 'ΣΥΝΟΛΙΚΟ',
    write: false,
    sheetRe: /ΣΥΝΟΛΙΚΟ|ΔΥΝΑΜΟΛΟΓΙΟ/,
    fields: [
      F('si', 'Σ.Ι.', 'Σ.Ι', /^Σ\s*\.?\s*Ι\.?$/),
      F('remarks', 'Παρατηρήσεις (ρόλος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$/),
      F('dn', 'Δικαίωμα ΔΝ', 'ΔΝ', DN_HEAD),
      // IBAN, ΑΜΚΑ, ΑΦΜ (3/11): optional columns; when missing and someone has a value, the app appends them (timeCols)
      F('iban', 'IBAN', 'IBAN', /^[ΙI][ΒB][ΑA][ΝN]$/),
      F('amka', 'ΑΜΚΑ', 'ΑΜΚΑ', /^ΑΜΚΑ$/),
      F('afm', 'ΑΦΜ', 'ΑΦΜ', /^Α[ΦF]Μ$/),
    ],
  },
  {
    id: 'punish',
    label: 'Ποινές (τιμωρημένοι)',
    help: 'Από, έως, είδος ποινής',
    title: 'ΤΙΜΩΡΗΜΕΝΟΙ',
    write: true,
    types: ['PUN'],
    sheetRe: /ΤΙΜΩΡ|ΠΟΙΝ/,
    titleRe: /ΤΙΜΩΡ|ΠΟΙΝ/,
    fields: [
      FROM(),
      TO(),
      F('kind', 'Είδος ποινής', 'ΕΙΔΟΣ ΠΟΙΝΗΣ', /ΕΙΔΟΣ ΠΟΙΝΗΣ|^ΠΟΙΝΗ$/),
      F('days', 'Ημέρες', 'ΗΜΕΡΕΣ', /^ΗΜΕΡΕΣ$/),
      F('by', 'Ποιος την επέβαλε', 'ΕΠΕΒΑΛΕ', /ΕΠΕΒΑΛΕ|ΕΠΙΒΛΗΘΗΚΕ|ΤΙΜΩΡΗΣΕ|ΑΠΟ ΠΟΙΟΝ|ΔΙΑΤΑΚΤΗΣ/),
      F('reason', 'Αιτία (διότι…)', 'ΑΙΤΙΑ', /ΑΙΤΙΑ|ΑΙΤΙΟΛΟΓΙΑ|^ΔΙΟΤΙ|ΠΑΡΑΠΤΩΜΑ/),
      NOTE,
    ],
  },
  {
    id: 'medical',
    label: 'ΕΑ / ΕΥ / ΕΟ',
    help: 'Είδος (ΕΑ, ΕΥ, ΕΟ, ΕΑΡΒ…), από, έως',
    title: 'ΕΑ-ΕΥ',
    write: true,
    types: ['EA', 'EARV', 'EY', 'EO'],
    sheetRe: /IATR|ΙΑΤΡ|ΕΑ.?ΕΥ/,
    titleRe: /ΕΑ\s*[-–/]?\s*ΕΥ|ΕΛΕΥΘΕΡ/,
    fields: [
      F('kind', 'Είδος (ΕΑ, ΕΥ, ΕΟ…)', 'ΕΑ-ΕΥ', /^ΕΑ\s*[-–/]\s*ΕΥ|^ΕΙΔΟΣ|ΕΞΑΙΡΕΣΗ/, { req: true }),
      FROM(),
      TO(),
      NOTE,
    ],
  },
  {
    id: 'hospital',
    label: 'Νοσοκομείο / αναρρωτικές',
    help: 'Πού (νοσοκομείο ή ΑΝ.ΑΔ), είσοδος, έξοδος',
    title: 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ-ΑΝ.ΑΔ.',
    write: true,
    types: ['NOS', 'SICK'],
    sheetRe: /IATR|ΙΑΤΡ|ΝΟΣΟΚ/,
    titleRe: /ΝΟΣΟΚΟΜ|ΑΝ\s*\.?\s*ΑΔ|ΑΝΑΡΡΩΤ/,
    fields: [
      F('where', 'Εισαγωγή (νοσοκομείο / ΑΝ.ΑΔ)', 'Εισαγωγή', /^ΕΙΣΑΓΩΓΗ$|^ΝΟΣΟΚΟΜΕΙΟ$/),
      FROM('ΕΙΣ'),
      HOUT,
      TO('ΕΞ'),
      HIN,
      NOTE,
    ],
  },
  {
    id: 'step',
    label: 'Εισαγωγές ΣΤΕΠ',
    help: 'Είσοδος, έξοδος',
    title: 'ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ',
    write: true,
    types: ['STEP'],
    sheetRe: /IATR|ΙΑΤΡ|ΣΤΕΠ/,
    titleRe: /ΣΤΕΠ/,
    fields: [FROM('ΕΙΣ'), HOUT, TO('ΕΞ'), HIN, NOTE],
  },
  {
    id: 'leave',
    label: 'Άδειες',
    help: 'Είδος άδειας, από, έως',
    title: 'ΑΔΕΙΕΣ',
    write: true,
    types: ['LEAVE', 'HON'],
    sheetRe: /ΑΔΕΙ/,
    titleRe: /ΑΔΕΙ/,
    fields: [F('kind', 'Είδος άδειας', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', /ΕΙΔΟΣ ΑΔΕΙΑΣ|^ΑΔΕΙΑ$/), FROM(), TOUT, TO(), TIN, NOTE, DEST],
  },
  {
    id: 'dn',
    label: 'ΔΝ (διανυκτερεύσεις)',
    help: 'Από, έως',
    title: 'ΔΝ',
    write: true,
    types: ['DN'],
    sheetRe: /^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΑΝΥΚΤ/,
    titleRe: /^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΑΝΥΚΤ/,
    fields: [FROM(), TO(), NOTE],
  },
  {
    id: 'posts',
    label: 'Πόστα',
    help: 'Μόνιμες αναθέσεις (ΚΨΜ, ιατρείο…)· διαβάζονται μαζί με το προσωπικό',
    title: 'ΠΟΣΤΑ',
    write: false,
    sheetRe: /ΠΟΣΤΑ/,
    titleRe: /ΠΟΣΤΑ/,
    fields: [F('post', 'Πόστο', 'Πόστο', /^ΠΟΣΤΟ$/, { req: true })],
  },
  {
    id: 'outside',
    label: 'Εκτός δύναμης',
    help: 'Αναβολές κ.λπ.· διαβάζονται μαζί με το προσωπικό',
    title: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ',
    write: false,
    sheetRe: /ΕΚΤΟΣ/,
    titleRe: /ΕΚΤΟΣ ΔΥΝΑΜ/,
    fields: [F('remarks', 'Παρατηρήσεις (λόγος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΑΙΤΙΑ$/)],
  },
  {
    id: 'caps',
    label: 'Δυνατότητες υπηρεσιών',
    help: 'Ποιος δεν κάνει θαλαμοφύλακας, οπλοφύλακας, μαγειρεία, σκοπιά, ή μια δική σου υπηρεσία όπως η πύλη («-» στη στήλη της)',
    title: 'ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ',
    write: false,
    sheetRe: /ΔΥΝΑΤΟΤ/,
    titleRe: /ΔΥΝΑΤΟΤ/,
    fields: [
      F('th', 'Θαλαμοφύλακας', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', /^ΘΑΛΑΜΟΦΥΛ/),
      F('op', 'Οπλοφύλακας', 'ΟΠΛΟΦΥΛΑΚΑΣ', /^ΟΠΛΟΦΥΛ/),
      F('mg', 'Μαγειρεία', 'ΜΑΓΕΙΡΕΙΑ', /^ΜΑΓΕΙΡ/),
      F('sk', 'Σκοπιά', 'ΣΚΟΠΙΑ', /^ΣΚΟΠ/),
      F('tae', 'ΤΑΕ', 'ΤΑΕ', /^ΤΑΕ$/),
      F('capnote', 'Παρατηρήσεις (λόγος)', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', /^ΠΑΡΑΤΗΡΗΣΕΙΣ$|^ΛΟΓΟΣ$/),
    ],
  },
  {
    id: 'duties',
    label: 'Έλεγχος υπηρεσιών (μηνιαίο)',
    help: 'Μηνιαίο πλέγμα με Θ/Μ/Σ ανά μέρα: περνούν οι υπηρεσίες που έκανε ο καθένας',
    title: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ',
    write: false,
    sheetRe: /ΕΛΕΓΧΟΣ ΥΠΗΡ/,
    titleRe: /ΕΛΕΓΧΟΣ ΥΠΗΡ/,
    fields: [F('d1', 'Στήλη της 1ης του μήνα', '1', /^1$/, { req: true })],
  },
  // Cadres (3/11, Michael): their own Excel (ΣΤΕΛΕΧΗ.xlsx) with their details and their statuses, apart from the soldiers' roster
  {
    id: 'cadres',
    label: 'Στελέχη',
    help: 'Δικό τους Excel: βαθμός, όνομα, ΑΜ, τηλέφωνο, θέση, γραμμή ΗΚΑΙ, σε δύναμη, όπλο, IBAN, ΑΜΚΑ, ΑΦΜ',
    title: 'ΣΤΕΛΕΧΗ',
    write: true,
    sheetRe: /ΣΤΕΛΕΧ/,
    titleRe: /ΣΤΕΛΕΧ/,
    fields: [
      F('am', 'ΑΜ', 'ΑΜ', /^ΑΜ$|^Α\s*\.\s*Μ$/),
      F('role', 'Θέση', 'ΘΕΣΗ', /^ΘΕΣΗ$/),
      F('hk', 'Γραμμή ΗΚΑΙ', 'ΓΡΑΜΜΗ ΗΚΑΙ', /^ΓΡΑΜΜΗ(\s+ΗΚΑ[ΙΛ])?$|^ΗΚΑ[ΙΛ]$/),
      F('active', 'Σε δύναμη', 'ΣΕ ΔΥΝΑΜΗ', /^ΣΕ ΔΥΝΑΜΗ$|^ΕΝΕΡΓΟΣ$/),
      // optional: appended to the table only when some cadre has a value (timeCols)
      F('eid', 'Ειδικότητα', 'ΕΙΔΙΚΟΤΗΤΑ', /^ΕΙΔΙΚΟΤΗΤΑ$/),
      F('monthMax', 'Όριο υπηρεσιών το μήνα', 'ΟΡΙΟ ΥΠΗΡΕΣΙΩΝ ΤΟ ΜΗΝΑ', /^ΟΡΙΟ ΥΠΗΡ/),
      F('weapon', 'Όπλο', 'ΟΠΛΟ', /^ΟΠΛΟ$/),
      F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', /^ΤΥΠΟΣ ΟΠΛ/),
      F('rack', 'Οπλοβάστης', 'ΟΠΛΟΒΑΣΤΗΣ', /^ΟΠΛΟΒΑΣΤ/),
      F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', /^ΘΕΣΗ ΟΠΛΟΥ$/),
      F('iban', 'IBAN', 'IBAN', /^[ΙI][ΒB][ΑA][ΝN]$/),
      F('amka', 'ΑΜΚΑ', 'ΑΜΚΑ', /^ΑΜΚΑ$/),
      F('afm', 'ΑΦΜ', 'ΑΦΜ', /^Α[ΦF]Μ$/),
    ],
  },
  {
    id: 'cadreAbs',
    label: 'Καταστάσεις στελεχών',
    help: 'Στο ίδιο Excel με τα στελέχη: κατάσταση (άδεια, νοσοκομείο, υπηρεσία…), από, έως',
    title: 'ΚΑΤΑΣΤΑΣΕΙΣ',
    write: true,
    sheetRe: /ΚΑΤΑΣΤΑΣ/,
    titleRe: /ΚΑΤΑΣΤΑΣ.*ΣΤΕΛΕΧ|ΣΤΕΛΕΧ.*ΚΑΤΑΣΤΑΣ/,
    fields: [
      F('kind', 'Κατάσταση', 'ΚΑΤΑΣΤΑΣΗ', /^ΚΑΤΑΣΤΑΣΗ$|^ΕΙΔΟΣ$/, { req: true }),
      F('hkcol', 'Στήλη ΗΚΑΙ', 'ΣΤΗΛΗ ΗΚΑΙ', /^ΣΤΗΛΗ(\s+ΗΚΑ[ΙΛ])?$/),
      FROM(),
      TO(),
      F('note', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', /^ΠΑΡΑΤΗΡΗΣΕΙ?Σ?$|^ΣΗΜΕΙΩΣΕΙΣ$/),
    ],
  },
];
/** `KINDS` by kind id. */
export const KIND: Record<ListKind, KindDef> = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<
  ListKind,
  KindDef
>;
/** The `StatusKind`s, in the order the app handles them. */
export const STATUS_KINDS: StatusKind[] = ['punish', 'medical', 'hospital', 'step', 'leave', 'dn'];
/** The kinds with hours (hours.ts): the time columns the app adds when they are needed (`timeCols`). */
export const TIME_KINDS: StatusKind[] = ['leave', 'hospital', 'step'];
/** True when the list kind holds statuses (`StatusKind`). */
export const isStatusKind = (k: ListKind): k is StatusKind => (STATUS_KINDS as string[]).includes(k);
/** The kinds the app creates from scratch («Νέο αρχείο…»): title, headers and everything it has itself. */
export const NEW_KINDS: ListKind[] = [
  'people',
  ...STATUS_KINDS,
  'posts',
  'outside',
  'caps',
  'duties',
  'cadres',
  'cadreAbs',
];
/** True for the two cadre kinds (`cadres`, `cadreAbs`), which live in their own file. */
export const isCadreKind = (k: ListKind): k is 'cadres' | 'cadreAbs' => k === 'cadres' || k === 'cadreAbs';
/** True when the app can create the kind from scratch (`NEW_KINDS`). */
export const canCreate = (k: ListKind) => NEW_KINDS.includes(k);
/** True for the kinds that go in as sheets of the roster, like in the Ίλη's file (ΑΔΕΙΕΣ, ΤΙΜΩΡΗΜΕΝΟΙ, ΠΟΣΤΑ…). */
export const inRoster = (k: ListKind) => canCreate(k) && k !== 'people' && k !== 'duties' && !isCadreKind(k);
/**
 * The kind whose file «hosts» this kind as a sheet: the roster sheets in the personnel, the statuses of the cadres in
 * the file of the cadres; null when the kind has its own file.
 */
export const sheetHost = (k: ListKind): ListKind | null =>
  inRoster(k) ? 'people' : k === 'cadreAbs' ? 'cadres' : null;
// The personnel have no «full name in one cell» (the roster has them apart) nor an Α/Α that counts
const CADRE_PERSON = ['aa', 'rank', 'origin', 'spec', 'last', 'first', 'phone'];
/** The fields a table of `kind` can have: the person fields plus the fields of the kind. */
export const fieldsOf = (k: ListKind): FieldDef[] =>
  isCadreKind(k)
    ? [
        ...PERSON_FIELDS.filter(
          (f) => CADRE_PERSON.includes(f.k) && (k === 'cadres' || (f.k !== 'phone' && f.k !== 'origin')),
        ).map((f) => (f.k === 'spec' ? { ...f, re: /^Ο\s*[/\-]\s*Σ$/ } : f)),
        ...KIND[k].fields,
      ] // for cadres «ΕΙΔΙΚΟΤΗΤΑ» is a field of its own, not Ο/Σ
    : [
        ...PERSON_FIELDS.filter((f) => !(k === 'people' || k === 'posts' || k === 'outside') || f.k !== 'name'),
        ...KIND[k].fields,
      ];
/** The status kind that holds a status of type `t` (null when no kind does). */
export const kindOfType = (t: TypeKey): StatusKind | null =>
  STATUS_KINDS.find((k) => KIND[k].types!.includes(t)) || null;
/**
 * The duty kinds that have a built-in column in the «Δυνατότητα υπηρεσιών» sheet; the user's own duties and «Άλλες»
 * are added by `capExtras`.
 */
export const CAP_COLS: DutyKind[] = ['th', 'op', 'mg', 'sk', 'tae'];
