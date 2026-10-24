// Οδηγός χρήσης: ποιο θέμα ταιριάζει στην οθόνη που βλέπεις (F1, κουμπί «?» στην πάνω μπάρα).
// Χωριστά από τον οδηγό, για να μη φορτώνεται το κείμενό του στο άνοιγμα της εφαρμογής.
const VIEW_TOPIC: Record<string, string> = { home: 'today', people: 'people', cadre: 'cadre', guard: 'guard', outs: 'outs', records: 'medical', strength: 'strength', hkai: 'hkai', weapons: 'weapons', reports: 'reports', notes: 'notes', history: 'history' };
const TAB_TOPIC: Record<string, string> = { unit: 'set-unit', settings: 'set-unit', rooms: 'set-rooms', duty: 'set-duty', lists: 'set-lists', import: 'set-files', files: 'set-files', templates: 'set-forms', excel: 'set-forms', look: 'set-look', esso: 'set-esso', backup: 'set-backup' };
export function topicFor(view: string, params: Record<string, any>): string {
  if (view === 'templates') return TAB_TOPIC[params.tab] || 'set-unit';
  return VIEW_TOPIC[view] || 'about';
}

// Οι τίτλοι των θεμάτων για την αναζήτηση Ctrl+K («Οδηγός: …»), χωρίς να φορτώνεται το κείμενο. Το test ελέγχει ότι
// ταιριάζουν με τον Οδηγό (guideText.ts)· όταν μπαίνει νέο θέμα εκεί, μπαίνει και εδώ.
export const GUIDE_TITLES: [string, string][] = [
  ['legend', 'Υπόμνημα κωδικών'], ['about', 'Σχετικά με την εφαρμογή'], ['first', 'Πρώτη φορά: από πού ξεκινάω'], ['daily', 'Μια συνηθισμένη μέρα'],
  ['basics', 'Βασικά: μενού, αναζήτηση, αναίρεση'], ['today', 'Σήμερα'], ['people', 'Δυναμολόγιο'], ['declare', 'Δήλωση κατάστασης (Ctrl+N)'], ['cadre', 'Στελέχη'],
  ['guard', 'Υπηρεσίες (Θέσεις, Έλεγχος, Ποιος κάνει τι, Εξαιρέσεις)'], ['rules', 'Κανόνες υπηρεσιών και σειρά δικαιοσύνης'], ['outs', 'Εξοδούχοι'], ['medical', 'Ιατρικά'],
  ['strength', 'Δύναμη'], ['hkai', 'ΗΚΑΙ (και Ποινές, Άδειες, Αιτήσεις)'], ['weapons', 'Οπλισμός'], ['reports', 'Έντυπα (δικά σου Excel)'], ['notes', 'Σημειώσεις'],
  ['print', 'Εκτύπωση και έλεγχος πριν βγει έντυπο'], ['history', 'Ιστορικό και αναίρεση'], ['set-unit', 'Μονάδα και έντυπα'], ['set-rooms', 'Θάλαμοι και ουλαμοί'],
  ['set-duty', 'Υπηρεσίες και αργίες'], ['set-lists', 'Λίστες'], ['set-files', 'Εισαγωγή Δυναμολογίου, Αρχεία Excel και φάκελοι'],
  ['set-forms', 'Πρότυπα εφαρμογής και Γράμματα Excel'], ['set-look', 'Εμφάνιση, τίτλος και λογότυπο'], ['set-esso', 'ΕΣΣΟ: νέα σειρά και επαναφορά'],
  ['set-backup', 'Αντίγραφα ασφαλείας'], ['effects', 'Τι επηρεάζει τι'], ['excel', 'Πώς δουλεύει με τα Excel'], ['problems', 'Κάτι δεν πάει καλά']
];
