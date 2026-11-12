// The «ανανέωση από Excel» dialog of the sheet kinds (πόστα, εκτός δύναμης, δυνατότητες, στελέχη, έλεγχος υπηρεσιών):
// what is read from this sheet, with its own numbers.
// Purpose: `SheetImportDialog`; the plan comes from model/sheetPlan.ts.
// Does NOT: hold state (model/useSheetImport.ts) or build the command.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-SheetImportDialog*).
import type { ChangeEvent } from 'react';
import type { SourceBook } from '../../../../../shared/api';
import { KIND, bindingText, type ListKind, type SourceBinding } from '../../../../../shared/sources';
import { Alert, Button, Dialog, MonthField, type ValueEvent } from '../../../../shared/ui';
import { useSheetImport } from '../../model/useSheetImport';
import { DutyAliases } from './DutyAliases';
import { DutyDays } from './DutyDays';
import { List, Tiles, Unmatched } from './SheetBits';

export interface SheetImportDialogProps {
  list: ListKind;
  /** The Excel file as read by the main process. */
  book: SourceBook;
  /** The binding to read with. */
  b: SourceBinding;
  onClose: () => void;
}

/** «Σβήστηκαν από το Excel» for cadre absences, with the box that removes them from the app too. */
function removedBlock(removed: string[] | undefined, del: boolean, setDel: (on: boolean) => void) {
  return (
    (removed?.length || 0) > 0 && (
      <div className="field">
        <span className="field__label">Σβήστηκαν από το Excel ({removed!.length})</span>
        <ul className="note" style={{ margin: 0 }}>
          {removed!.slice(0, 40).map((t: string) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={del}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDel(e.target.checked)}
          />
          <span>
            <b>Σβήσε τες και από την εφαρμογή</b>
            <small>Αλλιώς μένουν στην εφαρμογή και ξαναγράφονται στο Excel.</small>
          </span>
        </label>
      </div>
    )
  );
}

/** The dialog; it shows a message instead when the sheet of the binding is not in the file. */
export function SheetImportDialog({ list, book, b, onClose }: SheetImportDialogProps) {
  const { choices, setChoices, busy, month, setMonth, del, setDel, sheet, res, go } = useSheetImport(
    list,
    book,
    b,
    onClose,
  );
  if (!sheet || !res)
    return (
      <Dialog title="Ανανέωση από Excel" onClose={onClose}>
        <Alert tone="bad">
          <span>
            Δεν υπάρχει φύλλο «{b.sheet}» στο {book.name}. Πάτα «Στήλες…» και διάλεξε άλλο.
          </span>
        </Alert>
      </Dialog>
    );
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
            {res.n ? 'Πέρασε ' + res.n + (res.n === 1 ? ' αλλαγή' : ' αλλαγές') : 'Εντάξει'}
          </Button>
        </>
      }
    >
      {list === 'duties' && (
        <div className="field" style={{ maxWidth: '220px' }}>
          <label className="field__label" htmlFor="sd-m">
            Μήνας του φύλλου
          </label>
          <MonthField
            id="sd-m"
            value={month}
            onChange={(e: ValueEvent) => e.target.value && setMonth(e.target.value)}
          />
        </div>
      )}
      <Tiles items={res.tiles} />
      {!res.n && !res.sp.unmatched.length && !res.duties?.errors.length && !res.duties?.days.length && (
        <Alert tone="ok">
          <span>✓ Η εφαρμογή έχει ήδη ό,τι γράφει αυτό το φύλλο.</span>
        </Alert>
      )}
      <Unmatched rows={res.sp.unmatched} choices={choices} setChoices={setChoices} />
      {res.duties && (
        <>
          <DutyAliases codes={res.duties.unknown} />
          <DutyDays p={res.duties} />
        </>
      )}
      {res.lists.map((l) => (
        <List key={l.title} title={l.title} items={l.items} />
      ))}
      {removedBlock(res.removed, del, setDel)}
      {res.notes.map((t) => (
        <p key={t} className="note">
          {t}
        </p>
      ))}
      {res.sp.dup > 0 && (
        <p className="note">
          {res.sp.dup === 1 ? '1 άτομο είναι' : res.sp.dup + ' άτομα είναι'} δύο φορές στο φύλλο· κρατήθηκε η πρώτη
          γραμμή.
        </p>
      )}
      <p className="note">
        Από εκεί και πέρα ό,τι αλλάζεις στην εφαρμογή γράφεται και σε αυτό το φύλλο
        {b.write === false ? ' με την «Ενημέρωση Excel»' : ''}.
      </p>
    </Dialog>
  );
}
