// Dialog/Sheet render cases, part 2: Δυναμολόγιο (people), quick add, Έντυπα, Ρυθμίσεις, Excel sources, weapons,
// Ημερολόγιο.
//
// Purpose: one entry per snapshot file `dialog-<name>.html`; `sites` lists the Appendix ΣΤ sites that it shows.
// Does NOT: click or run effects. Dialogs that read data in an effect (Excel preview, report history) show their first,
//   loading render; that is what the snapshot records.
// Covering test: test/screens-dialogs-forms.test.ts.
import { el } from './dialog-fixtures';
import type { DialogCase } from './dialog-cases-shell';
import { TODAY } from './screens-harness';
import { QuickAddDialog } from '../../src/renderer/screens/quickAdd';
import {
  BaselineReviewDialog, DeclareStatusDialog, EditPersonDialog, LeaveEndDialog, LeaveTimesDialog, NewPersonDialog,
  PersonSheet, SaveViewDialog, StatusFixDialog,
} from '../../src/renderer/screens/people';
import { HistDialog, RunDialog } from '../../src/renderer/screens/reports';
import { EditBlockDialog } from '../../src/renderer/screens/settings';
import {
  FormDialog, ImportDialog, MapDialog, MatchDialog, SheetImportDialog, WriteDialog,
} from '../../src/renderer/screens/sources';
import {
  BulkFixDialog, DutyFixDialog, EditMoveDialog, WeaponInDialog, WeaponOutDialog,
} from '../../src/renderer/screens/weaponMoves';
import { CellDialog, CodesDialog } from '../../src/renderer/screens/imerologio';
import { blocksOf } from '../../src/shared/domain';
import type { FormInfo, SourceBook } from '../../src/shared/api';
import type { ListKind, SourceBinding } from '../../src/shared/sources';

const noop = () => {};
const noopAsync = async () => null;

/** The binding the app would store for the first table of `book` that was detected as `list`. */
const bindingOf = (book: SourceBook, list: ListKind): SourceBinding => {
  const hit = book.hits.find(h => h.best === list) ?? book.hits[0];
  return { file: book.file, sheet: hit.sheet, header: hit.header, cols: hit.cols };
};
const missingSheet = (book: SourceBook, list: ListKind): SourceBinding =>
  ({ ...bindingOf(book, list), sheet: 'ΦΥΛΛΟ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ' });

const formInfo: FormInfo = {
  ok: true, file: 'ΕΞΟΔΟΥΧΟΙ.xlsx', custom: false, sheets: ['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ'],
  sheet: 'ΕΞΟΔΟΥΧΟΙ', sheet2: 'ΠΑΡΑΜΕΝΟΝΤΕΣ',
};

export const FORMS_CASES: DialogCase[] = [
  {
    name: 'people-PersonSheet', sites: ['people.ts:259'],
    build: (_w, r) => el(PersonSheet, { pid: r.person.id, onMove: noop, onClose: noop }),
  },
  {
    name: 'people-SaveViewDialog', sites: ['people.ts:220'],
    build: () => el(SaveViewDialog, { onClose: noop, onSave: noop }),
  },
  {
    name: 'people-LeaveTimesDialog', sites: ['people.ts:304'],
    build: (_w, r) => el(LeaveTimesDialog, { st: r.leaveStarted, onClose: noop }),
  },
  {
    name: 'people-StatusFixDialog', sites: ['people.ts:332'],
    build: (_w, r) => el(StatusFixDialog, { st: r.sickness, onClose: noop }),
  },
  {
    name: 'people-LeaveEndDialog-started', sites: ['people.ts:375'],
    build: (_w, r) => el(LeaveEndDialog, { st: r.leaveStarted, onClose: noop }),
  },
  {
    name: 'people-LeaveEndDialog-future', sites: ['people.ts:372'],
    build: (_w, r) => el(LeaveEndDialog, { st: r.leaveFuture, onClose: noop }),
  },
  {
    name: 'people-BaselineReviewDialog', sites: ['people.ts:403'],
    build: () => el(BaselineReviewDialog, { onClose: noop }),
  },
  {
    name: 'people-EditPersonDialog', sites: ['people.ts:451'],
    build: (_w, r) => el(EditPersonDialog, { p: r.person, onClose: noop }),
  },
  {
    name: 'people-NewPersonDialog', sites: ['people.ts:488'],
    build: () => el(NewPersonDialog, { onClose: noop, onMany: noop }),
  },
  {
    name: 'people-DeclareStatusDialog-step1-person', sites: ['people.ts:593'],
    build: () => el(DeclareStatusDialog, { initial: {}, onClose: noop }),
  },
  {
    name: 'people-DeclareStatusDialog-step2-status', sites: ['people.ts:600'],
    build: () => el(DeclareStatusDialog, { initial: { cat: 'med' }, onClose: noop }),
  },
  {
    name: 'people-DeclareStatusDialog-step3-dates', sites: ['people.ts:614'],
    build: (_w, r) =>
      el(DeclareStatusDialog, { initial: { pids: [r.person.id], type: 'EY', from: TODAY }, onClose: noop }),
  },
  { name: 'quickAdd-QuickAddDialog', sites: ['quickAdd.ts:120'], build: () => el(QuickAddDialog, { onClose: noop }) },
  {
    name: 'imerologio-CellDialog', sites: ['imerologio.ts:82'],
    build: (_w, r) =>
      el(CellDialog, { p: r.person, d: TODAY, onClose: noop, run: noopAsync, undoMark: noop, toast: noop }),
  },
  {
    name: 'imerologio-CodesDialog', sites: ['imerologio.ts:104'],
    build: () => el(CodesDialog, { onClose: noop, onPrint: noop }),
  },
  {
    name: 'reports-RunDialog', sites: ['reports.ts:350'],
    build: (w) => el(RunDialog, { r: w.state.settings.reports![0], print: false, onClose: noop, onDone: noop }),
  },
  {
    name: 'reports-HistDialog', sites: ['reports.ts:371'],
    build: (w) => el(HistDialog, { r: w.state.settings.reports![0], onClose: noop }),
  },
  {
    name: 'settings-EditBlockDialog', sites: ['settings.ts:277'],
    build: w =>
      el(EditBlockDialog, { phase: w.state.settings.phase, b: blocksOf(w.state.settings)[0], onClose: noop }),
  },
  {
    name: 'sources-MatchDialog', sites: ['sources.ts:143'],
    build: (w, r) => el(MatchDialog, { book: r.book, onClose: noop, onMap: noop }),
  },
  {
    name: 'sources-MapDialog', sites: ['sources.ts:205'],
    build: (_w, r) =>
      el(MapDialog, {
        list: 'punish', book: r.book, initial: bindingOf(r.book, 'punish'), onClose: noop, onSaved: noop,
      }),
  },
  {
    name: 'sources-ImportDialog', sites: ['sources.ts:283'],
    build: (w, r) => el(ImportDialog, { list: 'punish', book: r.book, b: bindingOf(r.book, 'punish'), onClose: noop }),
  },
  {
    name: 'sources-ImportDialog-no-sheet', sites: ['sources.ts:266'],
    build: (_w, r) =>
      el(ImportDialog, { list: 'punish', book: r.book, b: missingSheet(r.book, 'punish'), onClose: noop }),
  },
  {
    name: 'sources-SheetImportDialog', sites: ['sources.ts:394'],
    build: (_w, r) =>
      el(SheetImportDialog, { list: 'duties', book: r.book, b: bindingOf(r.book, 'duties'), onClose: noop }),
  },
  {
    name: 'sources-SheetImportDialog-no-sheet', sites: ['sources.ts:388'],
    build: (_w, r) =>
      el(SheetImportDialog, { list: 'duties', book: r.book, b: missingSheet(r.book, 'duties'), onClose: noop }),
  },
  {
    name: 'sources-WriteDialog', sites: ['sources.ts:462'],
    build: () => el(WriteDialog, { list: 'punish', onClose: noop }),
  },
  {
    name: 'sources-FormDialog', sites: ['sources.ts:585'],
    build: () => el(FormDialog, { form: 'outs', info: formInfo, current: {}, onClose: noop, onSave: noop }),
  },
  {
    name: 'weaponMoves-WeaponOutDialog', sites: ['weaponMoves.ts:48'],
    build: (_w, r) => el(WeaponOutDialog, { pids: [r.person.id], onClose: noop, onDone: noop }),
  },
  {
    name: 'weaponMoves-WeaponInDialog', sites: ['weaponMoves.ts:78'],
    build: (_w, r) => el(WeaponInDialog, { ids: [r.openMove.id], onClose: noop, onDone: noop }),
  },
  {
    name: 'weaponMoves-EditMoveDialog', sites: ['weaponMoves.ts:106'],
    build: (_w, r) => el(EditMoveDialog, { m: r.openMove, onClose: noop }),
  },
  {
    name: 'weaponMoves-DutyFixDialog', sites: ['weaponMoves.ts:132'],
    build: (_w, r) => el(DutyFixDialog, { row: r.armed, onClose: noop }),
  },
  {
    name: 'weaponMoves-BulkFixDialog', sites: ['weaponMoves.ts:170'],
    build: (_w, r) => el(BulkFixDialog, { ids: [r.openMove.id], onClose: noop, onDone: noop }),
  },
];

