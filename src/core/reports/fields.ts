// The fields (columns) of every kind of report.
//
// Purpose: `FIELDS` (key, name, header, width and alignment of each field per kind), `fieldOf` and `DATE_FIELDS`.
//   The «Κενό» kind gets the fields of the people and of the cadres added once, when this file loads.
// Does NOT: know how a field is filled (fieldValue.ts) or guessed from a header (guess.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: the same table drives the field list on the screen, the header written in a new table and the width of the
//   column, so a field is described once. Sharing the arrays (`SOLDIER`, `STATUS`…) keeps the kinds in step.
// Covering tests: test/report-blank-who.test.ts, test/axiologisi.test.ts, test/personal-entypa.test.ts,
//   test/room-extras-totals.test.ts.
import type { RepKind } from '../model/reportTypes';

/** Alignment of the cells of a column. */
export type Align = 'left' | 'center';
/**
 * One field (column) of a kind: `k` the key, `label` the name in the list, `head` the header when the table is built
 * here, `w` the width in characters, `al` the alignment.
 */
export interface FieldDef {
  k: string;
  label: string;
  head: string;
  w: number;
  al: Align;
}
const F = (k: string, label: string, head: string, w: number, al: Align = 'center'): FieldDef => ({
  k,
  label,
  head,
  w,
  al,
});
// Absence on the day (cadres' «Δυναμολόγιο-Παρουσιολόγιο»): ΑΠΩΝ ΝΑΙ, the reason, the return date (a real date in the
// Excel)
const ABS = [
  F('absent', 'Απών (ΝΑΙ αν λείπει ή είναι κωλυόμενος)', 'ΑΠΩΝ', 7),
  F('areason', 'Αιτία απουσίας (π.χ. ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ)', 'ΑΙΤΙΑ ΑΠΟΥΣΙΑΣ', 22, 'left'),
  F('aret', 'Ημερομηνία επιστροφής', 'ΗΜ/ΝΙΑ ΕΠΙΣΤΡΟΦΗΣ', 13),
];
/** The fields whose cell holds a real date in the Excel, not text. */
export const DATE_FIELDS = new Set(['aret']);
// Rank: with the origin in front (ΕΠΟΠ ΛΧΙΑΣ), as the full name joins surname and name; and apart (Michael, 22/10)
const COMMON = [
  F('aa', 'Α/Α (αύξων αριθμός)', 'Α/Α', 5),
  F('rank', 'Βαθμός (με την προέλευση, π.χ. ΕΠΟΠ ΛΧΙΑΣ)', 'ΒΑΘΜΟΣ', 11),
  F('rank1', 'Μόνο βαθμός (χωρίς προέλευση)', 'ΒΑΘΜΟΣ', 10),
  F('origin', 'Προέλευση (ΕΠΟΠ, ΟΒΑ, ΣΜΥ…)', 'ΠΡΟΕΛΕΥΣΗ', 10),
  F('spec', 'Ο/Σ', 'Ο/Σ', 6),
];
// Personal details (Michael 4/11): e-mail, relative's e-mail, blood group, and IBAN, ΑΜΚΑ, ΑΦΜ as columns; plain
// values, always text
const MAILS = [
  F('email', 'E-mail', 'E-MAIL', 28, 'left'),
  F('relEmail', 'E-mail συγγενή', 'E-MAIL ΣΥΓΓΕΝΗ', 28, 'left'),
  F('blood', 'Ομάδα αίματος', 'ΟΜΑΔΑ ΑΙΜΑΤΟΣ', 10),
];
const PERS = [F('iban', 'IBAN', 'IBAN', 29), F('amka', 'ΑΜΚΑ', 'ΑΜΚΑ', 13), F('afm', 'ΑΦΜ', 'ΑΦΜ', 11)];
// the soldier's details in the kinds with one row per status, post or weapon
const SOLDIER = [
  F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'),
  F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
  F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'),
  F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'),
  F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
  F('asm', 'ΑΣΜ', 'ΑΣΜ', 13),
  F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13),
  F('room', 'Θάλαμος', 'ΘΑΛ.', 6),
  F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10),
  F('si', 'Σ.Ι.', 'Σ.Ι.', 8),
  ...MAILS,
  ...PERS,
];
// The statuses of the day as a column, each category apart (Michael, 22/10: «να διαλέξω ιατρικές καταστάσεις, άδεια
// κτλπ»), in the format the user picks (ColOpts.sf: ΕΑ, ΕΥ, ΑΔΕΙΑ…)
const STATUS = [
  F('smed', 'Ιατρικό τη μέρα (ΕΑ, ΕΥ…)', 'ΙΑΤΡΙΚΟ', 12),
  F('sabs', 'Άδεια τη μέρα (ΚΑ, τιμητική…)', 'ΑΔΕΙΑ', 12),
  F('spun', 'Ποινή τη μέρα', 'ΠΟΙΝΗ', 14),
  F('sother', 'ΣΤΕΠ ή νοσοκομείο τη μέρα', 'ΣΤΕΠ / ΝΟΣ.', 12),
  F('sout', 'Έξοδος τη μέρα (εξοδούχος, ΔΝ)', 'ΕΞΟΔΟΣ', 11),
];
// Combination: several fields in one column, in the format the user writes (ColOpts.parts, fmt: «{1} ({2})» → ΣΤΡ
// (ΜΧ))
const TAIL = [
  F('combo', 'Συνδυασμός στοιχείων (π.χ. ΣΤΡ (ΜΧ))', 'ΒΑΘΜΟΣ (Ο/Σ)', 16),
  F('blank', 'Κενή (π.χ. για υπογραφή)', 'ΥΠΟΓΡΑΦΗ', 18),
  F('text', 'Σταθερό κείμενο', '', 12),
];
/**
 * The fields of every kind, in the order of the list the user sees. «Κενό» also gets the fields of the people and of
 * the cadres (see the `push` below).
 */
export const FIELDS: Record<RepKind, FieldDef[]> = {
  people: [
    ...COMMON,
    F('name', 'Επώνυμο Όνομα (του πατρώνυμο, μόνο σε συνονόματους)', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 28, 'left'),
    F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 34, 'left'),
    F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'),
    F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'),
    F('father', 'Πατρώνυμο', 'ΠΑΤΡΩΝΥΜΟ', 14, 'left'),
    F('asm', 'ΑΣΜ', 'ΑΣΜ', 13),
    F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13),
    F('room', 'Θάλαμος', 'ΘΑΛ.', 6),
    F('unit', 'Ουλαμός', 'ΟΥΛΑΜΟΣ', 10),
    F('si', 'Σ.Ι.', 'Σ.Ι.', 8),
    F('dcode', 'Κωδικός μέρας (Κ.Α, ΑΝ.ΑΔ, Ε.Υ, ΣΤΕΠ, ΑΟΠΛΟΣ…)', 'ΚΩΔΙΚΟΣ ΜΕΡΑΣ', 12),
    ...ABS,
    ...MAILS,
    ...PERS,
    F('post', 'Πόστο', 'ΠΟΣΤΟ', 14),
    F('role', 'Ρόλος', 'ΡΟΛΟΣ', 14),
    F('essos', 'ΕΣΣΟ', 'ΕΣΣΟ', 10),
    F('dn', 'Δικαίωμα ΔΝ', 'ΔΝ', 6),
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12),
    F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12),
    F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11),
    F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('status', 'Κατάσταση την ημέρα (όλες: ΚΑ, ΕΑ, ποινή…)', 'ΚΑΤΑΣΤΑΣΗ', 16),
    ...STATUS,
    F('duty', 'Υπηρεσία την ημέρα', 'ΥΠΗΡΕΣΙΑ', 16),
    F('notes', 'Σημειώσεις', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 20, 'left'),
    ...TAIL,
  ],
  cadre: [
    ...COMMON,
    F('name', 'Επώνυμο Όνομα', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 26, 'left'),
    F('who', 'Βαθμός και ονοματεπώνυμο', 'ΒΑΘΜΟΣ - ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 32, 'left'),
    F('last', 'Επώνυμο', 'ΕΠΩΝΥΜΟ', 18, 'left'),
    F('first', 'Όνομα', 'ΟΝΟΜΑ', 14, 'left'),
    F('am', 'ΑΜ', 'ΑΜ', 12),
    F('phone', 'Τηλέφωνο', 'ΤΗΛΕΦΩΝΟ', 13),
    ...PERS,
    F('cspec', 'Ειδικότητα', 'ΕΙΔΙΚΟΤΗΤΑ', 18, 'left'),
    F('role', 'Θέση', 'ΘΕΣΗ', 18, 'left'),
    F('status', 'Κατάσταση την ημέρα', 'ΚΑΤΑΣΤΑΣΗ', 18),
    ...ABS,
    ...TAIL,
  ],
  // Statuses (phase 2): the details of the soldier and of the status
  status: [
    ...COMMON,
    ...SOLDIER,
    F('stype', 'Είδος (ΚΑ, ΕΥ, ποινή…)', 'ΕΙΔΟΣ', 16),
    F('from', 'Από', 'ΑΠΟ', 11),
    F('to', 'Έως', 'ΕΩΣ', 11),
    F('days', 'Ημέρες', 'ΗΜΕΡΕΣ', 7),
    F('note', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', 22, 'left'),
    F('by', 'Ποιος τιμώρησε', 'ΤΙΜΩΡΗΣΕ', 18, 'left'),
    F('reason', 'Διότι', 'ΔΙΟΤΙ', 30, 'left'),
    F('on', 'Ημερομηνία τιμωρίας', 'ΗΜ. ΤΙΜΩΡΙΑΣ', 11),
    ...TAIL,
  ],
  // Phase 3: the duty posts of the day, weapons, weapon moves
  duty: [
    ...COMMON,
    F('seat', 'Θέση (π.χ. Θαλαμοφύλακας 1ος)', 'ΘΕΣΗ', 24, 'left'),
    F('code', 'Κωδικός θέσης (Θ1α, Μ2…)', 'ΚΩΔ.', 7),
    F('block', 'Υπηρεσία (ομάδα θέσεων)', 'ΥΠΗΡΕΣΙΑ', 20, 'left'),
    F('hours', 'Ώρες', 'ΩΡΕΣ', 16),
    F('armed', 'Ένοπλη (ΝΑΙ)', 'ΕΝΟΠΛΗ', 8),
    ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12),
    F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12),
    ...STATUS,
    ...TAIL,
  ],
  weapon: [
    ...COMMON,
    ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12),
    F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12),
    F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11),
    F('wpos', 'Θέση όπλου', 'ΘΕΣΗ ΟΠΛΟΥ', 11),
    F('inout', 'Εντός ή εκτός (με τον λόγο)', 'ΕΝΤΟΣ / ΕΚΤΟΣ', 26, 'left'),
    ...STATUS,
    ...TAIL,
  ],
  wmove: [
    ...COMMON,
    ...SOLDIER,
    F('weapon', 'Αριθμός όπλου', 'ΑΡ. ΟΠΛΟΥ', 12),
    F('wtype', 'Τύπος όπλου', 'ΤΥΠΟΣ ΟΠΛΟΥ', 12),
    F('rack', 'Οπλοβαστός', 'ΟΠΛΟΒΑΣΤΟΣ', 11),
    F('mreason', 'Λόγος εξόδου (ΕΚΠ, βολή…)', 'ΛΟΓΟΣ ΕΞΟΔΟΥ', 16),
    F('mout', 'Έξοδος (ημερομηνία και ώρα)', 'ΕΞΟΔΟΣ', 17),
    F('minr', 'Λόγος εισόδου', 'ΛΟΓΟΣ ΕΙΣΟΔΟΥ', 16),
    F('min', 'Είσοδος (ημερομηνία και ώρα)', 'ΕΙΣΟΔΟΣ', 17),
    F('mnote', 'Παρατήρηση', 'ΠΑΡΑΤΗΡΗΣΗ', 22, 'left'),
    ...STATUS,
    ...TAIL,
  ],
  // Blank: only Α/Α and columns with the user's own header and cells
  blank: [F('aa', 'Α/Α (αύξων αριθμός)', 'Α/Α', 5), F('col', 'Στήλη (δική σου επικεφαλίδα και κελιά)', '', 16, 'left')],
};
/** The field `k` of a kind; undefined when the kind has no such field. */
export const fieldOf = (kind: RepKind, k: string) => FIELDS[kind].find((x) => x.k === k);
/**
 * The fields that cannot go into a combination column (they have no value of their own to join); combo.ts builds the
 * combinations.
 */
export const COMBO_NO = new Set(['aa', 'blank', 'text', 'combo', 'col']);
// «Κενός πίνακας», a person per row (Michael, 30/10): FIELDS.blank also has the fields of the people. Keys: the
// soldier's as they are (rank, name, asm…), the cadre's when both have them (rank, name, who, phone, role, status) and
// only what the cadre has under its own key ('am'), so they do not clash. A cadre in a field it does not have (ΑΣΜ,
// room…) gives an empty cell, and so does a soldier in 'am'
FIELDS.blank.push(
  ...FIELDS.people.filter((f) => !COMBO_NO.has(f.k)),
  ...FIELDS.cadre.filter((f) => !COMBO_NO.has(f.k) && !FIELDS.people.some((x) => x.k === f.k)),
);
