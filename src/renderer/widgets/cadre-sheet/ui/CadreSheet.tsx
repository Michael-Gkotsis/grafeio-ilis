// The cadre member's side card.
// Purpose: `CadreSheet` is the card that opens over every screen for a cadre member: statuses, data (+ delete), notes and
//   «Προσωπικά», with Up/Down/PageUp/PageDown through the list it was opened from.
// Does NOT: hold the state (model/useCadreSheet.ts) or derive the texts (model/view.ts); the «Σημειώσεις» and «Προσωπικά»
//   tabs and the edit dialogs come from features.
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c); `app/Overlays.tsx` drops it in.
// Covering test: test/cadre.test.ts, test/sheet-nav.test.ts, test/dialog-cases.test.ts.
import type { Cadre } from '../../../../shared/domain';
import { HK, hkRowLabel } from '../../../../shared/unit';
import { rankTxt } from '../../../../shared/ranks';
import { CadreDialog, StatusDialog } from '../../../features/cadre-edit';
import { NotesTab } from '../../../features/note-compose';
import { PersonalTab } from '../../../features/personal-data';
import { TodayAlert, notesTabLabel } from '../../../entities/note';
import { Button, Dialog, Sheet, SheetNav, Tabs } from '../../../shared/ui';
import { deleteMember } from '../model/actions';
import { type CadreSheetModel, type CadreSheetProps, useCadreSheet } from '../model/useCadreSheet';
import { cadreSheetView } from '../model/view';
import { absTab } from './AbsTab';
import { infoTab } from './InfoTab';

const CADRE_TABS = [
  { value: 'abs', label: 'Καταστάσεις' },
  { value: 'info', label: 'Στοιχεία' },
  { value: 'notes', label: 'Σημειώσεις' },
  { value: 'pers', label: 'Προσωπικά' },
];

/** The «Διαγραφή: …;» confirmation. */
function deleteDialog(m: CadreSheetModel, c: Cadre, onClose: () => void) {
  return (
    <Dialog
      role="alertdialog"
      title={'Διαγραφή: ' + rankTxt(c) + ' ' + c.last + ';'}
      description={
        'Φεύγει από τη λίστα και από την ' +
        HK() +
        ", μαζί με τις καταστάσεις του. Αν απλώς έφυγε από τη μονάδα, βάλ' τον «εκτός δύναμης» από τα «Στοιχεία»."
      }
      onClose={() => m.setDel(false)}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={() => m.setDel(false)}>
            Άκυρο
          </Button>
          <Button onClick={() => deleteMember(m, c, onClose)}>Διαγραφή</Button>
        </>
      }
    />
  );
}

export function CadreSheet(props: CadreSheetProps) {
  const { cid, onClose } = props;
  const m = useCadreSheet(props);
  const { c, tab, setTab, edit, setEdit, stFor, setStFor, del, nav, state, today, at, total, move } = m;
  if (!c) return null;
  const view = cadreSheetView(state, c, today);
  const { ng, rem, wtxt } = view;
  return (
    <Sheet
      onClose={onClose}
      actions={<SheetNav at={at} n={total} move={move} />}
      title={
        <h2 style={{ fontSize: '18px' }}>
          {rankTxt(c)} {c.last} {c.first}
        </h2>
      }
      subtitle={
        <div className="muted" style={{ fontSize: '13px' }}>
          {[
            c.origin && 'Προέλευση ' + c.origin,
            c.spec,
            c.role,
            HK() + ': ' + hkRowLabel(c.hk),
            !c.active && 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ',
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      }
    >
      <TodayAlert rules={[]} rem={rem} onRem={() => setTab('notes')} />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {c.active && <Button onClick={() => setStFor({})}>+ Κατάσταση</Button>}
        <Button variant="outline" onClick={() => setEdit(true)}>
          Διόρθωση στοιχείων
        </Button>
      </div>
      <Tabs
        value={tab}
        onChange={(t: string) => nav.guard(() => setTab(t))}
        items={CADRE_TABS.map((t) => (t.value === 'notes' ? { ...t, label: notesTabLabel(ng) } : t))}
      />
      {tab === 'abs' && absTab(m, c, view)}
      {tab === 'info' && infoTab(c, wtxt, () => m.setDel(true))}
      {tab === 'notes' && <NotesTab key={cid} who={{ cid }} />}
      {tab === 'pers' && <PersonalTab key={cid} who={{ cid }} rec={c} />}
      {edit && <CadreDialog c={c} onClose={() => setEdit(false)} />}
      {stFor && <StatusDialog c={c} abs={stFor.abs} onClose={() => setStFor(null)} />}
      {del && deleteDialog(m, c, onClose)}
    </Sheet>
  );
}
