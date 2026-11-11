// The soldier's side card.
// Purpose: `PersonSheet` is the card that opens over every screen for a soldier: data, duties, history, notes and «Προσωπικά»,
//   with Up/Down/PageUp/PageDown through the list it was opened from.
// Does NOT: hold the state (model/usePersonSheet.ts) or derive the texts (model/view.ts); the «Σημειώσεις» and
//   «Προσωπικά» tabs and the dialogs come from features.
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c); `app/Overlays.tsx` drops it in.
// Covering test: test/people.test.ts, test/sheet-nav.test.ts, test/dialog-cases.test.ts.
import { plainName, unitOf } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { noteTxt } from '../../../../shared/rules';
import { RkName, StatusBadge, rkOn } from '../../../entities/person';
import { TodayAlert, notesTabLabel } from '../../../entities/note';
import { StatusFixDialog } from '../../../features/fix-status';
import { LeaveEndDialog, LeaveTimesDialog } from '../../../features/leave-end';
import { NotesTab } from '../../../features/note-compose';
import { EditPersonDialog } from '../../../features/person-edit';
import { PersonalTab } from '../../../features/personal-data';
import { Button, Sheet, SheetNav, Tabs } from '../../../shared/ui';
import { type PersonSheetProps, usePersonSheet } from '../model/usePersonSheet';
import { personSheetView } from '../model/view';
import { dutyTab } from './DutyTab';
import { histTab } from './HistTab';
import { infoTab } from './InfoTab';

const SHEET_TABS = [
  { value: 'info', label: 'Στοιχεία' },
  { value: 'duty', label: 'Υπηρεσίες' },
  { value: 'hist', label: 'Ιστορικό' },
  { value: 'notes', label: 'Σημειώσεις' },
  { value: 'pers', label: 'Προσωπικά' },
];

// list: η λίστα από την οποία άνοιξε η καρτέλα (Δυναμολόγιο με τα φίλτρα του, Οπλισμός, Εξοδούχοι…)· αλλιώς όλοι σε δύναμη αλφαβητικά
export function PersonSheet(props: PersonSheetProps) {
  const { pid, onClose } = props;
  const m = usePersonSheet(props);
  const { state, today, nav, p, tab, setTab, edit, setEdit, fix, setFix, times, setTimes, end, setEnd } = m;
  const { nowM, at, total, move } = m;
  if (!p) return null;
  const view = personSheetView(state, p, pid, today, nowM);
  const { ng, rem, hist, dd, hn, lists, rules } = view;
  // Η καρτέλα (Michael, 17/10): ό,τι έχει το Δυναμολόγιο για τον στρατιώτη, οι υπηρεσίες του (σύνολο, με τις αργίες/ΣΚ από κάτω),
  // το ημερολόγιο υπηρεσιών και το ιστορικό καταστάσεων. Το «Τι κάνει» είναι πλέον στις Υπηρεσίες, η ΕΣΣΟ πάνω δεξιά.
  return (
    <Sheet
      onClose={onClose}
      actions={<SheetNav at={at} n={total} move={move} />}
      title={
        <h2 style={{ fontSize: '18px' }}>
          <RkName p={p} fn={plainName} keep={true} />
        </h2>
      }
      subtitle={
        <>
          <div className="muted" style={{ fontSize: '13px' }}>
            του {p.father || '—'} · {rkOn() ? '' : rankTxt(p) + ' · '}
            {unitOf(p, state.settings)}
            {p.active ? '' : ' · ΕΚΤΟΣ ΔΥΝΑΜΗΣ'}
          </div>
          <div style={{ marginTop: '6px' }}>
            <StatusBadge statuses={state.statuses} pid={pid} date={today} lists={state.settings.lists} />
          </div>
        </>
      }
    >
      <TodayAlert rules={rules} rem={rem} onRem={() => setTab('notes')} />
      {hn.length > 0 && (
        <div className="healthnote">
          <b>Σημειώσεις υγείας:</b> {hn.map((x) => noteTxt(x, lists)).join(' · ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Button onClick={() => nav.declare({ pids: [pid] })}>Δήλωσε κατάσταση</Button>
        <Button variant="outline" onClick={() => setEdit(true)}>
          Διόρθωση στοιχείων
        </Button>
      </div>
      <Tabs
        value={tab}
        onChange={(t: string) => nav.guard(() => setTab(t))}
        items={SHEET_TABS.map((t) => ({
          ...t,
          label:
            t.value === 'duty'
              ? t.label + ' (' + dd.total + ')'
              : t.value === 'hist'
                ? t.label + ' (' + hist.length + ')'
                : t.value === 'notes'
                  ? notesTabLabel(ng)
                  : t.label,
        }))}
      />
      {tab === 'info' && infoTab(m, view)}
      {tab === 'duty' && dutyTab(m, view)}
      {tab === 'hist' && histTab(m, view)}
      {tab === 'notes' && <NotesTab key={pid} who={{ pid }} />}
      {tab === 'pers' && <PersonalTab key={pid} who={{ pid }} rec={p} />}
      {edit && <EditPersonDialog p={p} onClose={() => setEdit(false)} />}
      {times && <LeaveTimesDialog st={times} onClose={() => setTimes(null)} />}
      {end && <LeaveEndDialog st={end} onClose={() => setEnd(null)} />}
      {fix && <StatusFixDialog st={fix} onClose={() => setFix(null)} />}
    </Sheet>
  );
}
