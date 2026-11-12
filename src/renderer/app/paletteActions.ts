// The actions of the Ctrl+K palette: every screen, tab, «+ New…», setting and guide topic that can be searched by name.
// Purpose: `paletteActions(ctx)` returns the list `{ t: title, k: search keywords, fn: run }` in display order.
// Does NOT: filter by the query, draw the list (CommandPalette.tsx) or add people and notes to the results.
// Owner layer: renderer/app. Why: the list is 60 entries of data; it hid the 40 lines of the palette's own logic.
// Covering test: test/ux-names.test.ts (titles and keywords), test/notes.test.ts (note actions in the palette).
// Frozen (CLAUDE.md rule 3): all Ctrl+K commands. Titles, keywords and targets below are copied unchanged from
//   screens/other.ts; `ΗΚΑΙ` is read through HK() at call time because a company calls it ΗΚΑΛ.
import type { AppState } from '../../shared/domain';
import type { ISODate } from '../../shared/dates';
import { addDays } from '../../shared/dates';
import { norm } from '../../shared/text';
import { HK } from '../../shared/unit';
import { GUIDE_TITLES } from '../guideTopic';
import type { Nav } from './nav';
import type { RouteParams, ScreenId } from './screenId';

/** One command in the palette. */
export interface PaletteAction {
  /** Title shown in the list. */
  t: string;
  /** Upper-case keywords matched without accents (so «δν» finds «Εξοδούχοι σήμερα»). */
  k: string;
  /** Runs the command (the palette closes first). */
  fn: () => void;
}

/** What the actions need from the shell. */
export interface PaletteContext {
  nav: Nav;
  state: AppState;
  /** ISODate, app time. */
  today: ISODate;
  /** ISODate, `today + 1`. */
  tomorrow: ISODate;
  /** The «Αντίγραφο σε USB» command of common.ts (useUsbCopy). */
  usb: () => void;
}

const act = (t: string, k: string, fn: () => void): PaletteAction => ({ t, k, fn });

/** Everyday work: today's lists, declarations, notes, the guide. */
function workActions({ nav, today, tomorrow }: PaletteContext): PaletteAction[] {
  const to = (t: string, k: string, view: ScreenId, params?: RouteParams) => act(t, k, () => nav.go(view, params));
  return [
    to('Εξοδούχοι σήμερα', 'ΕΞΟΔΟΥΧΟΙ ΕΞΟΔΟΣ ΔΝ ΔΙΑΝΥΚΤΕΡΕΥΣΗ ΠΑΡΑΜΕΝΟΝΤΕΣ', 'outs', { outDate: today }),
    to('Υπηρεσίες αύριο', 'ΥΠΗΡΕΣΙΕΣ ΦΡΟΥΡΑ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΜΑΓΕΙΡΕΙΑ ΛΥ', 'guard', { guardDate: tomorrow }),
    to(HK() + ' σήμερα', HK() + ' ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΚΑΤΑΣΤΑΣΗ', 'hkai', { hkaiDate: today }),
    act('Δήλωσε ιατρικό (ΕΑ, ΕΑΡΒ, ΕΥ, ΕΟ, ΝΟΣ)', 'ΙΑΤΡΙΚΑ ΕΑ ΕΑΡΒ ΑΡΒΥΛΩΝ ΕΥ ΕΟ ΝΟΣ', () =>
      nav.declare({ cat: 'med', from: today, to: addDays(today, 2) }),
    ),
    act('Νέα ποινή (αίτηση στην ' + HK() + ')', 'ΠΟΙΝΗ ΤΙΜΩΡΗΜΕΝΟΣ ΚΡΑΤΗΣΗ ΠΕΡΙΟΡΙΣΜΟΣ', () =>
      nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) }),
    ),
    // The old ΗΚΑΙ words stay in the keywords, so a search for «ΗΚΑΙ ποινές» still finds them.
    to('Καταστάσεις › Ιατρικά', 'ΚΑΤΑΣΤΑΣΕΙΣ ΙΑΤΡΙΚΑ ΕΥ ΕΑ ΕΟ ΣΤΕΠ ΛΗΞΗ', 'records', { stTab: 'med', recTab: 'med' }),
    to('Καταστάσεις › Ποινές', 'ΚΑΤΑΣΤΑΣΕΙΣ ' + HK() + ' ΠΟΙΝΕΣ ΤΙΜΩΡΗΜΕΝΟΙ ΣΤΕΡΗΣΗ ΚΡΑΤΗΣΗ', 'records', {
      stTab: 'pun',
    }),
    to('Καταστάσεις › Άδειες', 'ΚΑΤΑΣΤΑΣΕΙΣ ' + HK() + ' ΑΔΕΙΕΣ ΤΙΜΗΤΙΚΗ ΑΝΑΡΡΩΤΙΚΗ ΕΠΙΣΤΡΟΦΗ', 'records', {
      stTab: 'leave',
    }),
    to('Καταστάσεις › Αιτήσεις', 'ΚΑΤΑΣΤΑΣΕΙΣ ' + HK() + ' ΑΙΤΗΣΕΙΣ ΑΙΤΗΣΗ ΑΔΕΙΑΣ ΕΓΚΡΙΣΗ', 'records', {
      stTab: 'req',
    }),
    to('Ημερήσια Διαταγή', 'ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΗΔ WORD ΑΥΔΜ ΙΛΧΟΣ ' + HK(), 'hd'),
    act('Δώσε άδεια', 'ΑΔΕΙΑ', () => nav.declare({ cat: 'abs' })),
    to('Δύναμη σήμερα', 'ΔΥΝΑΜΗ ΚΑΤΑΣΤΑΣΗ', 'strength', { strengthDate: today }),
    to('Εισαγωγή Δυναμολογίου', 'ΕΙΣΑΓΩΓΗ ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ EXCEL', 'templates', { tab: 'import' }),
    to('Αρχεία Excel (από πού διαβάζει, πού γράφει)', 'ΑΡΧΕΙΑ EXCEL ΦΥΛΛΟ ΣΤΗΛΕΣ ΑΝΤΙΣΤΟΙΧΙΣΗ ΠΗΓΕΣ', 'templates', {
      tab: 'files',
    }),
    to('Ιστορικό ενεργειών', 'ΙΣΤΟΡΙΚΟ ΑΝΑΙΡΕΣΗ', 'history'),
    act('Νέα σημείωση (Ctrl+Shift+N)', 'ΝΕΑ ΣΗΜΕΙΩΣΗ ΣΗΜΕΙΩΣΕΙΣ ΧΑΡΤΑΚΙ ΥΠΕΝΘΥΜΙΣΗ ΘΥΜΗΣΟΥ', () => nav.note({})),
    to('Σημειώσεις', 'ΣΗΜΕΙΩΣΕΙΣ ΧΑΡΤΑΚΙΑ ΥΠΕΝΘΥΜΙΣΕΙΣ', 'notes'),
    to('Σημειώσεις › Υπενθυμίσεις', 'ΣΗΜΕΙΩΣΕΙΣ ΥΠΕΝΘΥΜΙΣΕΙΣ ΥΠΕΝΘΥΜΙΣΗ ΣΗΜΕΡΑ', 'notes', { nfilter: 'rem' }),
    to(
      'Οδηγός χρήσης (πώς δουλεύει, τι επηρεάζει τι)',
      'ΟΔΗΓΟΣ ΟΔΗΓΙΕΣ ΒΟΗΘΕΙΑ ΣΧΕΤΙΚΑ ΕΚΔΟΣΗ HELP ABOUT ΠΩΣ',
      'guide',
    ),
  ];
}

/** Forms, backups and the first Settings entries. */
function outputActions({ nav, state, usb }: PaletteContext): PaletteAction[] {
  const to = (t: string, k: string, view: ScreenId, params?: RouteParams) => act(t, k, () => nav.go(view, params));
  return [
    to(
      'Έντυπα (δικά σου Excel)',
      'ΕΝΤΥΠΑ ΕΝΤΥΠΟ ΠΡΟΤΥΠΑ ΠΡΟΤΥΠΟ ΚΑΤΑΣΤΑΣΗ ΟΝΟΜΑΣΤΙΚΗ ΠΑΡΟΥΣΙΟΛΟΓΙΟ ΤΥΧΑΙΑ ΑΓΓΑΡΕΙΑ EXCEL',
      'reports',
    ),
    ...(state.settings.reports || []).map((r) =>
      act('Βγάλε: ' + r.name, 'ΕΝΤΥΠΟ ΕΝΤΥΠΑ ΒΓΑΛΕ ' + norm(r.name), () => nav.go('reports', { repRun: r.id })),
    ),
    act('Αντίγραφο σε USB', 'ΑΝΤΙΓΡΑΦΟ USB BACKUP ΑΣΦΑΛΕΙΑ', () => usb()),
    to('Νέα ΕΣΣΟ / Επαναφορά ΕΣΣΟ', 'ΝΕΑ ΕΣΣΟ ΣΕΙΡΑ ΑΡΧΕΙΟ ΕΠΑΝΑΦΟΡΑ RESTORE', 'templates', { tab: 'esso' }),
    to('Επαναφορά από αντίγραφο', 'ΕΠΑΝΑΦΟΡΑ ΑΝΤΙΓΡΑΦΟ BACKUP', 'templates', { tab: 'backup' }),
    to('Διάγνωση (μνήμη, ταχύτητα)', 'ΔΙΑΓΝΩΣΗ ΜΝΗΜΗ ΤΑΧΥΤΗΤΑ GPU', 'diag'),
    to('Ρυθμίσεις', 'ΡΥΘΜΙΣΕΙΣ ΜΟΝΑΔΑ ΚΕΦΑΛΙΔΑ ΣΤΕΛΕΧΗ', 'templates', { tab: 'unit' }),
    to('Θάλαμοι και ουλαμοί', 'ΘΑΛΑΜΟΙ ΟΥΛΑΜΟΙ ΟΥΛΑΜΟΣ ΕΞΟΔΟΣ ΣΑΒΒΑΤΟ ΚΥΡΙΑΚΗ', 'templates', { tab: 'rooms' }),
    to('Τίτλος και λογότυπο', 'ΤΙΤΛΟΣ ΛΟΓΟΤΥΠΟ LOGO ΕΜΦΑΝΙΣΗ ΒΑΘΜΟΣ', 'templates', { tab: 'brand' }),
    to('Ρυθμίσεις › Υπηρεσίες και αργίες', 'ΘΕΣΕΙΣ ΥΠΗΡΕΣΙΕΣ ΑΡΓΙΕΣ ΒΑΡΔΙΕΣ ΣΙ Σ.Ι. ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ', 'templates', {
      tab: 'duty',
    }),
    to('Ρυθμίσεις › Λίστες', 'ΛΙΣΤΕΣ ΒΑΘΜΟΙ ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΑΔΕΙΕΣ', 'templates', { tab: 'lists' }),
    to('Ρυθμίσεις › Εμφάνιση', 'ΕΜΦΑΝΙΣΗ ΘΕΜΑ ΣΚΟΤΕΙΝΟ ΠΥΚΝΟΤΗΤΑ', 'templates', { tab: 'look' }),
  ];
}

/**
 * Every screen, tab, «+ New…» button and Settings section.
 * @decision UX M8, 22/10: all of them are searchable (before, typing «εκτ» found nothing).
 */
function screenActions({ nav, tomorrow }: PaletteContext): PaletteAction[] {
  const to = (t: string, k: string, view: ScreenId, params?: RouteParams) => act(t, k, () => nav.go(view, params));
  return [
    to('Σήμερα', 'ΣΗΜΕΡΑ ΑΡΧΙΚΗ ΑΠΟΝΤΕΣ ΛΗΓΟΥΝ ΓΥΡΙΖΟΥΝ', 'home'),
    to('Δυναμολόγιο', 'ΔΥΝΑΜΟΛΟΓΙΟ ΣΤΡΑΤΙΩΤΕΣ ΠΡΟΣΩΠΙΚΟ ΛΙΣΤΑ', 'people'),
    to('Νέος στρατιώτης', 'ΝΕΟΣ ΣΤΡΑΤΙΩΤΗΣ ΠΡΟΣΘΗΚΗ ΚΑΤΑΤΑΞΗ', 'people', { quickAdd: 'one' }),
    to(
      'Γρήγορη εισαγωγή στρατιωτών (πολλοί μαζί)',
      'ΓΡΗΓΟΡΗ ΕΙΣΑΓΩΓΗ ΠΟΛΛΟΙ ΣΤΡΑΤΙΩΤΕΣ ΕΠΙΚΟΛΛΗΣΗ ΝΕΑ ΕΣΣΟ',
      'people',
      { quickAdd: 'many' },
    ),
    to('Εκτός δύναμης (Δυναμολόγιο)', 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ ΔΙΑΓΡΑΦΕΣ ΑΠΟΛΥΣΗ ΜΕΤΑΘΕΣΗ ΜΕΤΑΚΙΝΗΣΗ', 'people', {
      filter: 'inactive',
    }),
    to('Στελέχη', 'ΣΤΕΛΕΧΗ ΥΠΑΞΙΩΜΑΤΙΚΟΙ ΑΞΙΩΜΑΤΙΚΟΙ ΕΠΟΠ ΟΒΑ ΔΥΝΑΜΙΚΟ', 'cadre'),
    to('Υπηρεσίες › Έλεγχος υπηρεσιών', 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΙΡΑ ΔΙΚΑΙΟΣΥΝΗΣ ΜΗΝΙΑΙΟ ΠΛΕΓΜΑ', 'guard', {
      gopen: 'check',
    }),
    to('Υπηρεσίες › Εξαιρέσεις', 'ΕΞΑΙΡΕΣΕΙΣ ΕΞΑΙΡΕΣΗ ΥΠΗΡΕΣΙΑ ΕΦΑΠΑΞ ΜΗΝ ΜΠΕΙ ΣΚ ΑΠΟ ΕΩΣ ΑΙΤΙΟΛΟΓΙΑ', 'guard', {
      gopen: 'skips',
    }),
    to('Υπηρεσίες › Ποιος κάνει τι', 'ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ ΠΙΝΑΚΑΣ ΥΠΗΡΕΣΙΕΣ ΑΝΑ ΑΤΟΜΟ', 'guard', { gopen: 'who' }),
    to('Κανόνες υπηρεσιών', 'ΚΑΝΟΝΕΣ ΥΠΗΡΕΣΙΩΝ ΑΝΑΠΑΥΣΗ ΟΡΙΑ ΣΕΙΡΑ ΔΙΚΑΙΟΣΥΝΗΣ ΑΥΣΤΗΡΑ ΑΟΠΛΟΙ', 'guard', {
      gopen: 'rules',
    }),
    to('Εξοδούχοι αύριο', 'ΕΞΟΔΟΥΧΟΙ ΑΥΡΙΟ ΕΞΟΔΟΣ', 'outs', { outDate: tomorrow }),
    to('Ιατρικά που έληξαν', 'ΙΑΤΡΙΚΑ ΕΛΗΞΑΝ ΛΗΞΗ', 'records', { stTab: 'med', recTab: 'expired' }),
    to(HK() + ' (η αναφορά)', HK() + ' ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΕΚΤΥΠΩΣΗ ΜΠΡΟΣΤΙΝΟ ΠΙΣΩ', 'hkai'),
    to('Οπλισμός', 'ΟΠΛΙΣΜΟΣ ΟΠΛΑ ΟΠΛΟ ΟΠΛΟΣΤΑΣΙΟ ΤΥΦΕΚΙΟ', 'weapons'),
    to('Οπλισμός › Κινήσεις', 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ ΕΝΤΟΣ ΕΚΤΟΣ ΧΡΕΩΣΗ', 'weapons', { wtab: 'moves' }),
    to('Έξοδος όπλων…', 'ΕΞΟΔΟΣ ΟΠΛΩΝ ΟΠΛΙΣΜΟΣ ΕΚΤΟΣ ΒΓΑΛΕ ΟΠΛΑ ΣΑΡΩΣΗ ΘΕΣΗ ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'weapons', {
      wtab: 'weapons',
      wfocus: 'scan',
    }),
    to('Είσοδος όλων…', 'ΕΙΣΟΔΟΣ ΟΠΛΩΝ ΟΛΩΝ ΟΠΛΙΣΜΟΣ ΕΝΤΟΣ ΕΠΙΣΤΡΟΦΗ ΟΠΛΑ ΚΙΝΗΣΕΙΣ ΕΚΤΟΣ ΤΩΡΑ', 'weapons', {
      wtab: 'moves',
      wmoves: 'open',
      wmreason: undefined,
      wfocus: 'in',
    }),
    to(
      'Εκτύπωση (ΦΡΟΥΡΑ, ' + HK() + ', Εξοδούχοι, Έντυπα)',
      'ΕΚΤΥΠΩΣΗ ΕΚΤΥΠΩΣΕ ΤΥΠΩΣΕ ΧΑΡΤΙ ΕΚΤΥΠΩΤΗΣ PDF PRINT ΣΕΛΙΔΕΣ',
      'reports',
    ),
    to('Τα έντυπά μου', 'ΤΑ ΕΝΤΥΠΑ ΜΟΥ ΔΙΚΑ ΜΟΥ ΑΠΟΘΗΚΕΥΜΕΝΑ', 'reports', { repTab: undefined }),
  ];
}

/** The Settings tabs, the legend and one entry per guide topic. */
function settingsActions({ nav }: PaletteContext): PaletteAction[] {
  const to = (t: string, k: string, view: ScreenId, params?: RouteParams) => act(t, k, () => nav.go(view, params));
  return [
    to('Ρυθμίσεις › Μονάδα και έντυπα', 'ΜΟΝΑΔΑ ΚΕΦΑΛΙΔΑ ΙΛΗ ΛΟΧΟΣ ΔΙΟΙΚΗΤΗΣ ΣΕΙΡΕΣ ' + HK(), 'templates', {
      tab: 'unit',
    }),
    to('Ρυθμίσεις › Υπογραφές', 'ΥΠΟΓΡΑΦΕΣ ΥΠΟΓΡΑΦΗ ΘΕΩΡΗΘΗΚΕ ΔΙΟΙΚΗΤΗΣ', 'templates', { tab: 'sigs' }),
    to('Ρυθμίσεις › Υπηρεσίες', 'ΘΕΣΕΙΣ ΥΠΗΡΕΣΙΩΝ ΒΑΡΔΙΕΣ ΩΡΕΣ ΕΝΕΡΓΗ ΝΕΑ ΥΠΗΡΕΣΙΑ', 'templates', {
      tab: 'duty',
      dsub: 'blocks',
    }),
    to('Ρυθμίσεις › Σ.Ι.', 'ΣΙ Σ.Ι. ΣΥΝΤΗΡΗΣΗ ΙΚΑΝΟΤΗΤΑ Ι1 Ι2 Ι3 Ι4', 'templates', { tab: 'duty', dsub: 'si' }),
    to('Ρυθμίσεις › Καταστάσεις και υπηρεσίες', 'ΚΑΤΑΣΤΑΣΕΙΣ ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ ΕΞΑΙΡΕΣΕΙΣ', 'templates', {
      tab: 'duty',
      dsub: 'stat',
    }),
    to('Ρυθμίσεις › Αργίες', 'ΑΡΓΙΕΣ ΑΡΓΙΑ ΓΙΟΡΤΕΣ ΠΑΣΧΑ', 'templates', { tab: 'duty', dsub: 'hol' }),
    to('Ρυθμίσεις › Πρότυπα εφαρμογής', 'ΠΡΟΤΥΠΑ ΕΦΑΡΜΟΓΗΣ TEMPLATES ΦΑΚΕΛΟΣ ' + HK() + ' ΦΡΟΥΡΑ', 'templates', {
      tab: 'templates',
    }),
    to('Ρυθμίσεις › Γράμματα Excel', 'ΓΡΑΜΜΑΤΑ EXCEL ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΜΕΓΕΘΟΣ ARIAL ΕΝΤΟΝΑ', 'templates', {
      tab: 'excel',
    }),
    to('Ρυθμίσεις › Αντίγραφα ασφαλείας', 'ΑΝΤΙΓΡΑΦΑ ΑΣΦΑΛΕΙΑΣ BACKUP', 'templates', { tab: 'backup' }),
    to('Υπόμνημα κωδικών', 'ΥΠΟΜΝΗΜΑ ΚΩΔΙΚΟΙ ΣΥΝΤΟΜΟΓΡΑΦΙΕΣ ΤΙ ΣΗΜΑΙΝΕΙ', 'guide', { topic: 'legend' }),
    ...GUIDE_TITLES.map(([id, t]) => {
      const h = t.replace(/ΗΚΑΙ/g, HK());
      return act('Οδηγός: ' + h, 'ΟΔΗΓΟΣ ' + norm(h), () => nav.go('guide', { topic: id }));
    }),
  ];
}

/**
 * All palette commands, in the order they are listed.
 * @param ctx - navigation, state, dates and the USB copy
 */
export function paletteActions(ctx: PaletteContext): PaletteAction[] {
  return [...workActions(ctx), ...outputActions(ctx), ...screenActions(ctx), ...settingsActions(ctx)];
}
