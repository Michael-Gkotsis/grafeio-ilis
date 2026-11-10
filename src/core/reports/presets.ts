// The ready-made forms of «Φτιάξ' το εδώ».
//
// Purpose: `PRESETS` (the forms the user can start from: «ονομαστική», «Δυναμολόγιο αξιολόγησης»,
//   «Δυναμολόγιο-Παρουσιολόγιο στελεχών»…) and `blankBuild` (the options of an empty start).
// Does NOT: build the template (src/main/reports.ts does) or hold the field list (fields.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/reports/fields.
// Why: the user's own forms are saved in the settings, but these ones ship with the app, so changing a column here
//   changes what new forms start with, never a saved form.
// Covering tests: test/axiologisi.test.ts, test/head-date-swap.test.ts, test/layout.test.ts, test/perf.test.ts.
import type { ValueTable, Bands, RepKind, RepSort, RepTable, BuildOpts, BuildCol } from '../model/reportTypes';
import { fieldOf } from './fields';

// Ready-made starts («Φτιάξ' το εδώ»)
const bk = (kind: RepKind, f: string, w: BuildCol['w'] = 'auto', h?: string): BuildCol => ({
  f,
  h: h ?? fieldOf(kind, f)!.head,
  w,
});
const bc = (f: string, w: BuildCol['w'] = 'auto', h?: string): BuildCol => ({
  f,
  h: h ?? fieldOf('people', f)!.head,
  w,
});
// cadres per category from the ΗΚΑΙ rows (ΔΕΑ = officers); each row is a «+» in the values table, so the user can
// change it
const HK_AXK = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΔΕΑ'],
  HK_ANTH = ['Ανθυπασπιστές'],
  HK_YPX = ['Αρχιλοχίες', 'Επιλοχίες', 'Λοχίες'];
const hkx = (w: 'row' | 'rowa', rows: string[]) =>
  rows.map((r) => ({ sign: '+' as const, metric: 'hk.' + w + ':' + r }));
/**
 * The ready-made forms offered as a start: name, help and the options of «Φτιάξ' το εδώ», with their values tables,
 * sort, bands and extra tables.
 */
export const PRESETS: {
  id: string;
  name: string;
  help: string;
  opts: BuildOpts;
  vals?: ValueTable[];
  sort?: RepSort;
  bands?: Bands;
  kind?: RepKind;
  more?: Partial<RepTable>[];
}[] = [
  {
    id: 'onomastiki',
    name: 'Ονομαστική κατάσταση',
    help: 'Α/Α, βαθμός, ονοματεπώνυμο, ΑΣΜ, θάλαμος, παρατηρήσεις',
    opts: {
      title: 'ΟΝΟΜΑΣΤΙΚΗ ΚΑΤΑΣΤΑΣΗ',
      cols: [
        bc('aa', 'narrow'),
        bc('rank'),
        bc('name'),
        bc('asm'),
        bc('room', 'narrow'),
        bc('blank', 'auto', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'),
      ],
      head: true,
      date: true,
      sig: 'list',
      land: false,
      sz: 12,
      fill: 'gray',
    },
  },
  {
    id: 'parousiologio',
    name: 'Παρουσιολόγιο με υπογραφή',
    help: 'Α/Α, βαθμός, ονοματεπώνυμο, θάλαμος, υπογραφή',
    opts: {
      title: 'ΠΑΡΟΥΣΙΟΛΟΓΙΟ',
      cols: [bc('aa', 'narrow'), bc('rank'), bc('name'), bc('room', 'narrow'), bc('blank', 'wide')],
      head: true,
      date: true,
      sig: 'list',
      land: false,
      sz: 12,
      fill: 'gray',
    },
  },
  {
    id: 'thalamos',
    name: 'Λίστα θαλάμου',
    help: 'Α/Α, βαθμός, ονοματεπώνυμο, τηλέφωνο, Σ.Ι.',
    opts: {
      title: 'ΚΑΤΑΣΤΑΣΗ ΘΑΛΑΜΟΥ',
      cols: [bc('aa', 'narrow'), bc('rank'), bc('name'), bc('phone'), bc('si', 'narrow')],
      head: true,
      date: true,
      sig: 'none',
      land: false,
      sz: 12,
      fill: 'gray',
    },
  },
  // Evaluation roll (Michael, 3/11): a table of figures (ΤΟΠΟΘΕΤΗΜΕΝΟΙ… from the strength, ΕΚΠΑΙΔΕΥΟΜΕΝΟΙ the user's
  // own value) and below it the soldiers with the day code in ΠΑΡΑΤΗΡΗΣΕΙΣ
  {
    id: 'axiologisi',
    name: 'Δυναμολόγιο αξιολόγησης',
    help: 'Νούμερα (τοποθετημένοι, απόντες, παρόντες…) και οπλίτες με κωδικό μέρας στις παρατηρήσεις',
    sort: 'room',
    bands: [['v1'], ['main']], // the figures on top, as in his own file
    vals: [
      {
        id: 'v1',
        title: '',
        rows: [
          { label: 'ΤΟΠΟΘΕΤΗΜΕΝΟΙ', expr: [{ sign: '+', metric: 'str.total' }] },
          { label: 'ΑΠΟΝΤΕΣ', expr: [{ sign: '+', metric: 'str.away' }] },
          { label: 'ΠΑΡΟΝΤΕΣ', expr: [{ sign: '+', metric: 'str.inside' }] },
          { label: 'ΕΚΠΑΙΔΕΥΟΜΕΝΟΙ ΣμηΕΑ', expr: [], man: '' },
          {
            label: 'ΕΛΕΥΘΕΡΟΙ ΥΠΗΡΕΣΙΑΣ/ΑΣΚΗΣΕΩΝ',
            expr: [
              { sign: '+', metric: 'st.EY' },
              { sign: '+', metric: 'st.EA' },
            ],
          },
          { label: 'ΑΟΠΛΟΙ', expr: [{ sign: '+', metric: 'str.unarmed' }] },
        ],
      },
    ],
    opts: {
      title: 'ΑΞΙΟΛΟΓΗΣΗ ΕΚΠΑΙΔΕΥΣΗΣ ΜΑΧΗΤΗ ΤΩΝ ΟΠΛΙΤΩΝ',
      cols: [
        bc('aa', 'narrow'),
        bc('rank', 'narrow', 'ΒΘΜ'),
        bc('spec', 'narrow'),
        bc('last'),
        bc('first'),
        bc('si', 'narrow', 'ΣΙ'),
        bc('dcode', 'auto', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'),
      ],
      head: true,
      date: true,
      sig: 'list',
      land: false,
      sz: 12,
      fill: 'gray',
    },
  },
  // Cadre roll and presence list (Michael, 3/11): cadres for the next working day, soldiers for the day of the form,
  // breakdowns and figures
  {
    id: 'stelexi',
    name: 'Δυναμολόγιο-Παρουσιολόγιο στελεχών',
    help: 'Στελέχη (επόμενη εργάσιμη), οπλίτες θητείας, ανάλυση απόντων και ελεύθερων, συσσιτιούντες δείπνου',
    kind: 'cadre',
    sort: 'pick',
    more: [
      { pick: { from: 'all', mode: 'all', not: ['present'] }, sort: 'room' },
      { pick: { from: 'all', mode: 'all', cats: ['med'], types: ['EY'] }, sort: 'room' },
    ],
    vals: [
      {
        id: 'v1',
        title: 'ΤΟΠΟΘΕΤΗΜΕΝΗ ΔΥΝΑΜΗ',
        rows: [
          { label: 'ΑΞΚΟΙ', expr: hkx('row', HK_AXK) },
          { label: 'ΑΝΘΣΤΕΣ', expr: hkx('row', HK_ANTH) },
          { label: 'ΥΠΞΚΟΙ', expr: hkx('row', HK_YPX) },
          { label: 'ΦΑΜΥΕΣ', expr: [{ sign: '+', metric: 'str.total' }] },
        ],
      },
      {
        id: 'v2',
        title: 'ΑΠΟΝΤΕΣ',
        rows: [
          { label: 'ΑΞΚΟΙ ΑΠΟΝΤΕΣ', expr: hkx('rowa', HK_AXK) },
          { label: 'ΑΝΘΣΤΕΣ ΑΠΟΝΤΕΣ', expr: hkx('rowa', HK_ANTH) },
          { label: 'ΥΠΞΚΟΙ ΑΠΟΝΤΕΣ', expr: hkx('rowa', HK_YPX) },
          { label: 'ΦΑΜΥΕΣ ΑΠΟΝΤΕΣ', expr: [{ sign: '+', metric: 'str.away' }] },
        ],
      },
      {
        id: 'v3',
        title: 'ΔΥΝΑΜΗ ΣΥΣΣΙΤΙΟΥΝΤΩΝ ΓΙΑ ΔΕΙΠΝΟ (19:00)',
        rows: [
          { label: 'ΠΑΡΑΣΚΕΥΗ', expr: [{ sign: '+', metric: 'str.inside' }], day: 'wd5', time: '19:00' },
          { label: 'ΣΑΒΒΑΤΟ', expr: [{ sign: '+', metric: 'str.inside' }], day: 'wd6', time: '19:00' },
          { label: 'ΚΥΡΙΑΚΗ', expr: [{ sign: '+', metric: 'str.inside' }], day: 'wd0', time: '19:00' },
        ],
      },
    ],
    opts: {
      title: 'ΔΥΝΑΜΟΛΟΓΙΟ - ΠΑΡΟΥΣΙΟΛΟΓΙΟ ΣΤΕΛΕΧΩΝ ΤΗΣ {ΗΜΕΡΟΜΗΝΙΑ ΠΙΝΑΚΑ}',
      tday: 'next',
      head: true,
      date: true,
      sig: 'list',
      land: false,
      sz: 12,
      fill: 'gray',
      cols: [
        bk('cadre', 'aa', 'narrow'),
        bk('cadre', 'rank'),
        bk('cadre', 'last'),
        bk('cadre', 'first'),
        bk('cadre', 'cspec'),
        bk('cadre', 'role'),
        bk('cadre', 'absent', 'narrow'),
        bk('cadre', 'areason'),
        bk('cadre', 'aret'),
      ],
      more: [
        {
          id: 'm1',
          title: 'ΟΠΛΙΤΕΣ ΘΗΤΕΙΑΣ ΤΗΣ {ΗΜΕΡΟΜΗΝΙΑ ΠΙΝΑΚΑ 2} - ΑΝΑΛΥΣΗ ΑΠΟΝΤΩΝ ΣΤΡ/ΤΩΝ',
          kind: 'people',
          cols: [
            bk('people', 'aa', 'narrow'),
            bk('people', 'rank', 'narrow'),
            bk('people', 'spec', 'narrow', 'Ο-Σ'),
            bk('people', 'last'),
            bk('people', 'first'),
            bk('people', 'areason'),
            bk('people', 'aret'),
          ],
        },
        {
          id: 'm2',
          title: 'ΑΝΑΛΥΣΗ ΕΛΕΥΘΕΡΩΝ ΥΠΗΡΕΣΙΑΣ',
          kind: 'status',
          cols: [
            bk('status', 'aa', 'narrow'),
            bk('status', 'rank', 'narrow'),
            bk('status', 'spec', 'narrow', 'Ο-Σ'),
            bk('status', 'last'),
            bk('status', 'first'),
            bk('status', 'days', 'narrow'),
            bk('status', 'from'),
            bk('status', 'to'),
          ],
        },
      ],
    },
  },
];
/** The options of a form built from scratch: title ΚΑΤΑΣΤΑΣΗ with Α/Α, rank and full name. */
export const blankBuild = (): BuildOpts => ({
  title: 'ΚΑΤΑΣΤΑΣΗ',
  cols: [bc('aa', 'narrow'), bc('rank'), bc('name')],
  head: true,
  date: true,
  sig: 'list',
  land: false,
  sz: 12,
  fill: 'gray',
});
