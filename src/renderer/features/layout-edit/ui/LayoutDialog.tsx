// The «Θέσεις στο χαρτί» dialog (Michael, 20/10): the form as it will come out, with the header, the place/date and every
// signature as a box you drag where you want (it snaps to the cells). Keyboard: Tab to a box, then the arrow keys.
// Purpose: `LayoutDialog` draws the dialog; the state and the boxes come from `useLayoutDialog` (model/).
// Does NOT: save the layout (it calls `onSave` with the cleaned layout) or know which form it belongs to beyond `form`.
// Owner layer: renderer/features/layout-edit. Why: moved verbatim from renderer/layout.ts (Phase 5.3b).
// Covering test: test/layout.test.ts, test/layout-fit.test.ts.
import { LAYOUT_SHEETS, blockLabel, cleanLayout, moved } from '../../../../shared/layout';
import { cx } from '../../../shared/lib/cx';
import { Alert, Button, Dialog, Segmented } from '../../../shared/ui';
import { useLayoutDialog, type LayoutDialogProps } from '../model/useLayoutDialog';

export type { LayoutDialogProps };
type Dlg = ReturnType<typeof useLayoutDialog>;

/** The footer: «Αρχικό» (this sheet back to the form's own positions), «Άκυρο», «Αποθήκευση». */
function layoutFoot(d: Dlg, onClose: () => void, save: () => void, any: boolean) {
  const { setLayout, tab } = d;
  return (
    <>
      <Button
        variant="ghost"
        disabled={!any}
        why="Όλα είναι ήδη στη θέση του εντύπου"
        onClick={() =>
          setLayout((l) => {
            const x = { ...l };
            delete x[tab];
            return x;
          })
        }
        style={{ marginRight: 'auto' }}
        data-tip="Όλα στη θέση του εντύπου, σε αυτό το φύλλο"
      >
        Αρχικό
      </Button>
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button onClick={save}>Αποθήκευση</Button>
    </>
  );
}

/** Θέσεις πάνω στο χαρτί. req: η αίτηση για την προεπισκόπηση με τις θέσεις που βλέπεις τώρα· onSave: οι θέσεις ανά φύλλο. */
export function LayoutDialog(props: LayoutDialogProps) {
  const { title, sigs, form, onSave, onClose } = props;
  const d = useLayoutDialog(props);
  const { layout, pv, busy, err, tab, setTab, sel, host, sheet } = d;
  const mine = layout[tab] || {};
  const any = Object.values(mine).some(moved);
  const save = () => {
    onClose();
    onSave(cleanLayout(layout));
  };
  return (
    <Dialog
      title={'Θέσεις στο χαρτί: ' + title}
      description="Σύρε την κεφαλίδα, την ημερομηνία, τον τίτλο ή μια υπογραφή όπου θέλεις. Κουμπώνει στα κελιά του Excel. Με το πληκτρολόγιο: Tab σε ένα κουτάκι και βελάκια."
      onClose={onClose}
      size="xl"
      footer={layoutFoot(d, onClose, save, any)}
    >
      {pv && pv.sheets.length > 1 && (
        <div>
          <Segmented
            small={true}
            value={tab}
            onChange={(v: string) => {
              setTab(v);
              sel.current = '';
            }}
            items={pv.sheets.map((s) => ({
              value: s.key,
              label:
                ((form ? LAYOUT_SHEETS[form] : []).find((x) => x.key === s.key)?.label || s.sheet) +
                (Object.values(layout[s.key] || {}).some(moved) ? ' •' : ''),
            }))}
          />
        </div>
      )}
      {/* the old call passed `variant="destructive"`, which Alert ignores: no tone, as it was drawn */}
      {err && <Alert>{err}</Alert>}
      <div className={cx('rep-pv', 'lay-pv', busy && 'is-busy')}>
        <div ref={host} className="rep-pv__page lay-pv__page" />
        {!pv && !err && <div className="empty">Φτιάχνεται η σελίδα…</div>}
      </div>
      {sheet && (
        <p className="note" style={{ margin: 0 }}>
          {sheet.blocks.length
            ? sheet.blocks.map((b) => blockLabel(b.id, sigs) + (moved(mine[b.id]) ? ' (μετακινήθηκε)' : '')).join(' · ')
            : 'Δεν βρέθηκε τίποτα να μετακινηθεί σε αυτό το φύλλο.'}
        </p>
      )}
      {pv?.warnings.length ? (
        <p className="note" style={{ margin: 0 }}>
          {pv.warnings.join(' ')}
        </p>
      ) : null}
    </Dialog>
  );
}
