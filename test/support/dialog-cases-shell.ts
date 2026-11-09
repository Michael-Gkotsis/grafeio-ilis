// Dialog/Sheet render cases, part 1: shell, shared dialogs, updates, cadre, ΕΣΣΟ, duties, notes, ΗΚΑΙ, outs, day forms.
//
// Purpose: one entry per snapshot file `dialog-<name>.html`; `sites` lists the Appendix ΣΤ sites (file:line) that the
//   snapshot shows, so test/screens-dialogs-coverage.test.ts can build COVERAGE.md from data, not from memory.
// Does NOT: click. A dialog is rendered by mounting its component directly in its open state with props.
// Covering test: test/screens-dialogs-shell.test.ts.
import { el, updInfo, type Rows } from './dialog-fixtures';
import { TODAY, TOMORROW, type World } from './screens-harness';
import { LegendDialog, UnsavedDialog } from '../../src/renderer/common';
import { DiscardAsk } from '../../src/renderer/ui';
import { UpdateDialog } from '../../src/renderer/update';
import { LayoutDialog } from '../../src/renderer/layout';
import { SigsDialog } from '../../src/renderer/sigs';
import { CadreDialog, CadreSheet, StatusDialog } from '../../src/renderer/screens/cadre';
import { DayFormsDialog } from '../../src/renderer/screens/dayForms';
import { EssoDone, NewEssoWizard, RestoreDialog } from '../../src/renderer/screens/esso';
import { AddBlockDialog, FixedDialog, PhaseDialog, RulesDialog } from '../../src/renderer/screens/guard';
import { EditDialog, NoteDialog } from '../../src/renderer/screens/notes';
import { ApproveDialog, PunTextDialog, RequestDialog } from '../../src/renderer/screens/other';
import { BackFixDialog } from '../../src/renderer/screens/outsPlan';
import { planStatusChange } from '../../src/shared/rules';
import type { ReactElement } from 'react';
import type { LayoutReq } from '../../src/shared/api';
import type { EssoInfo } from '../../src/shared/api';

export interface DialogCase {
  /** File name part: test/__snapshots__/screens/dialog-<name>.html */
  name: string;
  /** Appendix ΣΤ sites shown by this snapshot, "file:line". */
  sites: string[];
  /** View name the app would be on (nav.view), only matters for GoLink/nav reads. */
  view?: string;
  params?: Record<string, unknown>;
  build(world: World, rows: Rows): ReactElement;
}

const noop = () => {};
const essoInfo: EssoInfo = {
  people: 12, files: [{ label: 'Δυναμολόγιο', file: 'C:\\Ίλη\\ΔΥΝΑΜΟΛΟΓΙΟ.xlsx', exists: true }],
  outDirs: ['C:\\Ίλη\\Έντυπα'], archiveRoot: 'C:\\Ίλη\\Αρχείο', newRoot: 'C:\\Ίλη',
  archives: [{ dir: 'C:\\Ίλη\\Αρχείο\\2026 Β', name: '2026 Β ΕΣΣΟ', at: '2026-05-01 10:00', people: 120, files: 4 }],
};

export const SHELL_CASES: DialogCase[] = [
  { name: 'common-LegendDialog', sites: ['common.ts:462'], build: () => el(LegendDialog, { onClose: noop }) },
  {
    name: 'common-UnsavedDialog', sites: ['common.ts:478'],
    build: () => el(UnsavedDialog, {
      title: 'Να φύγεις;', children: 'Έχεις αλλαγές που δεν αποθηκεύτηκαν.', saveLabel: 'Αποθήκευση και έξοδος',
      canSave: true, onSave: noop, discardLabel: 'Έξοδος χωρίς αποθήκευση', onDiscard: noop, onBack: noop,
    }),
  },
  {
    name: 'ui-DiscardAsk', sites: ['ui.ts:138'],
    build: () => el(DiscardAsk, { text: 'Η σημείωση δεν αποθηκεύτηκε.', onStay: noop, onLeave: noop }),
  },
  {
    name: 'layout-LayoutDialog', sites: ['layout.ts:99'],
    build: () => el(LayoutDialog, {
      title: 'ΦΡΟΥΡΑ', req: (): LayoutReq => ({ form: 'froura', date: TOMORROW }), onSave: noop, onClose: noop,
    }),
  },
  {
    name: 'sigs-SigsDialog', sites: ['sigs.ts:36'],
    build: () => el(SigsDialog, {
      title: 'ΦΡΟΥΡΑ',
      initial: [{ art: 'Ο', title: 'ΑΡΧΙΛΟΧΙΑΣ', name: 'ΠΑΡΑΔΕΙΓΜΑΤΑΣ ΚΩΣΤΑΣ' }, { art: 'Ο', title: 'ΙΛΑΡΧΟΣ' }],
      keepText: 'Να μείνουν για τα επόμενα', onGo: noop, onClose: noop, onLayout: noop,
    }),
  },
  {
    name: 'update-ready', sites: ['update.ts:43'],
    build: () => el(UpdateDialog, { u: updInfo({ phase: 'ready', readyVersion: '0.1.240' }), onClose: noop }),
  },
  {
    name: 'update-working', sites: ['update.ts:52'],
    build: () => el(UpdateDialog, {
      u: updInfo({
        phase: 'working', step: 2, got: 5242880, total: 17825792, backup: 'ilh_2026-11-09_1.db',
      }),
      onClose: noop,
    }),
  },
  {
    name: 'update-none', sites: ['update.ts:59'],
    build: () => el(UpdateDialog, { u: updInfo({ avail: null, offer: false }), onClose: noop }),
  },
  {
    name: 'update-available', sites: ['update.ts:62'],
    build: () => el(UpdateDialog, { u: updInfo({}), onClose: noop }),
  },
  {
    name: 'cadre-CadreSheet', sites: ['cadre.ts:118'],
    build: (_w, r) => el(CadreSheet, { cid: r.cadre.id, onMove: noop, onClose: noop }),
  },
  {
    name: 'cadre-CadreDialog-edit', sites: ['cadre.ts:156'],
    build: (_w, r) => el(CadreDialog, { c: r.cadre, onClose: noop }),
  },
  {
    name: 'cadre-CadreDialog-new', sites: ['cadre.ts:156'],
    build: () => el(CadreDialog, { c: { id: '', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: '', first: '' }, onClose: noop }),
  },
  {
    name: 'cadre-StatusDialog', sites: ['cadre.ts:192'],
    build: (_w, r) => el(StatusDialog, { c: r.cadre, onClose: noop }),
  },
  { name: 'dayForms-DayFormsDialog', sites: ['dayForms.ts:65'], build: () => el(DayFormsDialog, { onClose: noop }) },
  {
    name: 'esso-NewEssoWizard', sites: ['esso.ts:90'],
    build: () => el(NewEssoWizard, { info: essoInfo, onClose: noop, onDone: noop }),
  },
  {
    name: 'esso-EssoDone', sites: ['esso.ts:136'],
    build: () => el(EssoDone, {
      r: {
        ok: true, archive: 'C:\\Ίλη\\Αρχείο\\2026 Β', dir: 'C:\\Ίλη\\2027 Α',
        files: ['C:\\Ίλη\\2027 Α\\ΔΥΝΑΜΟΛΟΓΙΟ.xlsx'], warnings: ['Δεν φτιάχτηκε το ΗΚΑΙ'],
      },
      onClose: noop,
    }),
  },
  {
    name: 'esso-RestoreDialog', sites: ['esso.ts:150'],
    build: () => el(RestoreDialog, { a: essoInfo.archives[0], onClose: noop }),
  },
  {
    name: 'guard-RulesDialog', sites: ['guard.ts:255'],
    build: () => el(RulesDialog, { onClose: noop, onTab: noop, onFixed: noop }),
  },
  { name: 'guard-FixedDialog', sites: ['guard.ts:496'], build: () => el(FixedDialog, { onClose: noop }) },
  { name: 'guard-PhaseDialog-new', sites: ['guard.ts:526'], build: () => el(PhaseDialog, { onClose: noop }) },
  {
    name: 'guard-PhaseDialog-rename', sites: ['guard.ts:526'],
    build: () => el(PhaseDialog, { edit: 'sven', onClose: noop }),
  },
  { name: 'guard-AddBlockDialog', sites: ['guard.ts:540'], build: () => el(AddBlockDialog, { onClose: noop }) },
  { name: 'notes-NoteDialog', sites: ['notes.ts:118'], build: () => el(NoteDialog, { start: {}, onClose: noop }) },
  {
    name: 'notes-EditDialog', sites: ['notes.ts:166'],
    build: (_w, r) => el(EditDialog, { note: r.note, onClose: noop }),
  },
  {
    name: 'other-PunTextDialog', sites: ['other.ts:236'],
    build: (_w, r) => el(PunTextDialog, { st: r.punishment, onClose: noop }),
  },
  {
    name: 'other-ApproveDialog', sites: ['other.ts:518'],
    build: (w, r) => {
      const leave = { type: 'LEAVE' as const, kind: 'Κανονική', from: TOMORROW, to: TOMORROW };
      const req = { id: 'rq1', pid: r.person.id, date: TODAY, text: 'ΓΙΑ ΛΟΓΟΥΣ ΥΓΕΙΑΣ', leave };
      const cmd = { type: 'LEAVE' as const, kind: 'Κανονική', pids: [r.person.id], from: TOMORROW, to: TOMORROW };
      const plan = planStatusChange(w.state, cmd, TODAY);
      return el(ApproveDialog, { r: req, plan, onClose: noop, onGo: noop });
    },
  },
  {
    name: 'other-RequestDialog-new', sites: ['other.ts:548'],
    build: () => el(RequestDialog, { req: { date: TODAY }, onClose: noop }),
  },
  {
    name: 'other-RequestDialog-leave', sites: ['other.ts:548'],
    build: (_w, r) => el(RequestDialog, {
      req: {
        id: 'rq2', pid: r.person.id, date: TODAY, text: '',
        leave: { type: 'LEAVE', kind: 'Κανονική', from: TOMORROW, to: TOMORROW },
      },
      onClose: noop,
    }),
  },
  {
    name: 'outsPlan-BackFixDialog', sites: ['outsPlan.ts:69'],
    build: (_w, r) => el(BackFixDialog, { b: r.back, date: TODAY, onClose: noop }),
  },
];
