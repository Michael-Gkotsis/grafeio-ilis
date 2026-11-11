// Everything the shell draws above a screen: soldier and cadre cards, dialogs, the «Άλλα» sheet, legend and search.
// Purpose: `Overlays` turns the state of useOverlays.ts into the right card or dialog.
// Does NOT: open or close anything on its own (it only calls the setters it is given), or know the keys.
// Owner layer: renderer/app. Why: the last 12 lines of Shell's markup; the order below is the stacking order.
// Covering test: test/notes.test.ts (note dialog, unsaved-note question), test/screens-dialogs-*.test.ts (markup).
import type { ReactNode } from 'react';
import type { UpdInfo } from '../../shared/api';
import { DiscardAsk, Sheet } from '../ui';
import { LegendDialog } from '../common';
import { UpdateDialog } from '../update';
import { CadreSheet } from '../widgets/cadre-sheet';
import { PersonSheet } from '../widgets/person-sheet';
import { DeclareStatusDialog, BaselineReviewDialog, needsBaselineReview } from '../screens/people';
import { NoteDialog } from '../screens/notes';
import { CommandPalette } from './CommandPalette';
import { MOBILE_MORE } from './routes';
import type { ScreenId } from './screenId';
import { useStore } from './store';
import type { OverlayState } from './useOverlays';

interface OverlaysProps {
  overlays: OverlayState;
  /** One menu button, as the side menu draws it (the «Άλλα» sheet reuses it). */
  renderNavItem: (view: ScreenId) => ReactNode;
  upd: UpdInfo | null;
  updOpen: boolean;
  setUpdOpen: (open: boolean) => void;
}

/** Soldier card, cadre card and the question about an unsaved note. */
function Cards({ overlays: o }: Pick<OverlaysProps, 'overlays'>) {
  const { guard, setPersonId, setCadreId, leaveNote, setLeaveNote } = o;
  return (
    <>
      {o.personId != null && (
        <PersonSheet
          pid={o.personId}
          list={o.personList}
          onMove={(id: number) => guard(() => setPersonId(id))}
          onClose={() => guard(() => setPersonId(null))}
        />
      )}
      {o.cadreId != null && (
        <CadreSheet
          cid={o.cadreId}
          list={o.cadreOrder}
          onMove={(id: string) => guard(() => setCadreId(id))}
          onClose={() => guard(() => setCadreId(null))}
        />
      )}
      {leaveNote && (
        <DiscardAsk
          title="Να φύγεις χωρίς αποθήκευση;"
          text="Η σημείωση δεν αποθηκεύτηκε. Αν συνεχίσεις, χάνεται."
          leave="Συνέχισε χωρίς αποθήκευση"
          stay="Πίσω στη σημείωση"
          onStay={() => setLeaveNote(null)}
          onLeave={() => {
            const go = leaveNote;
            setLeaveNote(null);
            go();
          }}
        />
      )}
    </>
  );
}

/** The declaration and note dialogs, the phone «Άλλα» sheet and the baseline review. */
function Layers({ overlays: o, renderNavItem }: Pick<OverlaysProps, 'overlays' | 'renderNavItem'>) {
  const { state } = useStore();
  const { layer, setLayer } = o;
  return (
    <>
      {layer && layer.kind === 'declare' && (
        <DeclareStatusDialog initial={layer.data || {}} onClose={() => setLayer(null)} />
      )}
      {layer && layer.kind === 'note' && <NoteDialog start={layer.data} onClose={() => setLayer(null)} />}
      {layer && layer.kind === 'more' && (
        <Sheet title={<h2 style={{ fontSize: '18px' }}>Άλλα</h2>} onClose={() => setLayer(null)}>
          <div className="morelist">{MOBILE_MORE.map((v) => renderNavItem(v))}</div>
        </Sheet>
      )}
      {!o.baseLater && !layer && state && needsBaselineReview(state) && (
        <BaselineReviewDialog onClose={() => o.setBaseLater(true)} />
      )}
    </>
  );
}

/** Cards, dialogs, then the update window, the legend and the search palette on top. */
export function Overlays({ overlays, renderNavItem, upd, updOpen, setUpdOpen }: OverlaysProps) {
  const { over, setOver } = overlays;
  return (
    <>
      <Cards overlays={overlays} />
      <Layers overlays={overlays} renderNavItem={renderNavItem} />
      {updOpen && upd && <UpdateDialog u={upd} onClose={() => setUpdOpen(false)} />}
      {over === 'legend' && <LegendDialog onClose={() => setOver(null)} />}
      {over === 'palette' && <CommandPalette onClose={() => setOver(null)} />}
    </>
  );
}
