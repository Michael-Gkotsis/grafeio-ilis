// The «ανανέωση από Excel» dialog of the status kinds (ποινές, νοσηλείες, ΔΝ…): what is new, what changes, who was not
// found and which unknown kinds there are, before anything passes.
// Purpose: `ImportDialog`; the blocks are plain functions in ImportParts.tsx.
// Does NOT: hold state (model/useImport.ts) or write to the Excel (that is «Ενημέρωση Excel», WriteDialog.tsx).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-ImportDialog*).
import type { SourceBook } from '../../../../../shared/api';
import { KIND, bindingText, type SourceBinding, type StatusKind } from '../../../../../shared/sources';
import { Alert, Button, Dialog } from '../../../../shared/ui';
import { importDerived } from '../../model/importView';
import { useImport } from '../../model/useImport';
import { addedList, bothSides, importNotes, removedList, unknownTypes, unmatchedPeople } from './ImportParts';

export interface ImportDialogProps {
  list: StatusKind;
  /** The Excel file as read by the main process. */
  book: SourceBook;
  /** The binding (file, sheet, header, columns) to read with. */
  b: SourceBinding;
  onClose: () => void;
}

/** The four numbers on top: new, changed, same, without a person. */
function importTiles(d: { add: unknown[]; update: unknown[]; same: number; unmatched: unknown[] }) {
  return (
    <div className="tiles">
      <div className="tile tile--main">
        <span className="tile__n">{d.add.length}</span>
        <span className="tile__l">Νέες</span>
      </div>
      <div className="tile">
        <span className="tile__n">{d.update.length}</span>
        <span className="tile__l">Αλλάζουν</span>
      </div>
      <div className="tile">
        <span className="tile__n">{d.same}</span>
        <span className="tile__l">Ίδιες</span>
      </div>
      <div className="tile">
        <span className="tile__n">{d.unmatched.length}</span>
        <span className="tile__l">Χωρίς άτομο</span>
      </div>
    </div>
  );
}

/** «Αλλάζουν (n)»: the records that changed only in the Excel (first 60). */
function plainChanges(plain: { id: string; who: string; what: string }[]) {
  return (
    plain.length > 0 && (
      <details className="note" open={plain.length <= 8}>
        <summary>Αλλάζουν ({plain.length})</summary>
        <ul>
          {plain.slice(0, 60).map((u) => (
            <li key={u.id}>
              {u.who}: {u.what}
            </li>
          ))}
        </ul>
      </details>
    )
  );
}

/** The dialog; it shows a message instead when the sheet of the binding is not in the file. */
export function ImportDialog({ list, book, b: initial, onClose }: ImportDialogProps) {
  const m = useImport(list, book, initial, onClose);
  const { state, b, busy, keepApp, del, sheet, parsed, d, go } = m;
  if (!sheet || !parsed || !d)
    return (
      <Dialog title="Ανανέωση από Excel" onClose={onClose}>
        <Alert tone="bad">
          <span>
            Δεν υπάρχει φύλλο «{b.sheet}» στο {book.name}. Πάτα «Στήλες…» και διάλεξε άλλο.
          </span>
        </Alert>
      </Dialog>
    );
  const v = importDerived(list, state, d, keepApp, del);
  const x = { list, m, parsed, d, v };
  return (
    <Dialog
      size="lg"
      title={KIND[list].label + ': ανανέωση από Excel'}
      description={bindingText(b)}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button data-autofocus="" disabled={busy} onClick={go}>
            {v.n ? 'Πέρασε ' + v.n + (v.n === 1 ? ' αλλαγή' : ' αλλαγές') : 'Εντάξει'}
          </Button>
        </>
      }
    >
      {importTiles(d)}
      {unknownTypes(x)}
      {unmatchedPeople(x)}
      {addedList(x)}
      {v.noDnN > 0 && (
        <Alert tone="warn">
          <span>
            {v.noDnN === 1 ? '1 ΔΝ είναι' : v.noDnN + ' ΔΝ είναι'} σε άτομα χωρίς δικαίωμα ΔΝ. Θα βγει ✕ στον προέλεγχο
            των Εξοδούχων μέχρι να δώσεις το δικαίωμα στην καρτέλα τους ή να γίνουν έξοδος.
          </span>
        </Alert>
      )}
      {bothSides(x)}
      {plainChanges(v.plain)}
      {removedList(x)}
      {importNotes(x)}
    </Dialog>
  );
}
