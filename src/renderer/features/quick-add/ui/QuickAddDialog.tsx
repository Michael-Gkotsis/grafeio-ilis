// The «Γρήγορη εισαγωγή στρατιωτών» dialog: a table like Excel, one soldier per row, one add for everyone.
// Purpose: `QuickAddDialog` draws the dialog; the rows, the draft and the keys come from `useQuickAdd` (model/).
// Does NOT: hold logic, or change the draft key `grafeio.quickAdd` / its format (model/draft.ts).
// Owner layer: renderer/features/quick-add. Why: moved verbatim from screens/quickAdd.ts; opened from the people list.
// Covering test: test/screens-dialogs-forms.test.ts (quickAdd-QuickAddDialog), test/ux-names.test.ts.
import type { ChangeEvent } from 'react';
import { QA_COLS, isFilled } from '../../../../shared/quickAdd';
import { Alert, Button, Dialog, UnsavedDialog } from '../../../shared/ui';
import { LABEL } from '../model/draft';
import { useQuickAdd, type QuickAdd } from '../model/useQuickAdd';
import { QuickAddRow } from './QuickAddRow';

/** Props of `QuickAddDialog`. */
export interface QuickAddDialogProps {
  onClose: () => void;
}

/** The footer: the count (or the problems), «Καθάρισμα», «Κλείσιμο» and the add button. */
function quickAddFoot(d: QuickAdd) {
  const { n, bad, busy, clear, close, save } = d;
  return (
    <>
      <span className="qa__sum">
        {bad ? (
          <span className="qa__err">{bad === 1 ? '1 γραμμή θέλει διόρθωση' : bad + ' γραμμές θέλουν διόρθωση'}</span>
        ) : n ? (
          n + (n === 1 ? ' στρατιώτης' : ' στρατιώτες')
        ) : (
          ''
        )}
      </span>
      {n > 0 && (
        <Button variant="ghost" disabled={busy} onClick={clear}>
          Καθάρισμα
        </Button>
      )}
      <Button variant="outline" disabled={busy} onClick={close}>
        Κλείσιμο
      </Button>
      <Button disabled={!n || bad > 0 || busy} onClick={save} data-tip="Ctrl+Enter">
        {busy ? 'Γίνεται…' : n ? 'Πρόσθεσε ' + (n === 1 ? '1 στρατιώτη' : n + ' στρατιώτες') : 'Πρόσθεσε'}
      </Button>
    </>
  );
}

/** The ΕΣΣΟ field and the list of keys. */
function quickAddTop(d: QuickAdd) {
  const { essos, setEssos } = d;
  return (
    <div className="qa__top">
      <div className="field" style={{ width: '150px', flex: 'none' }}>
        <label className="field__label" htmlFor="qa-essos">
          ΕΣΣΟ για όλους
        </label>
        <input
          id="qa-essos"
          className="ui-input"
          placeholder="π.χ. 2026 Γ΄"
          value={essos}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setEssos(e.target.value)}
        />
      </div>
      <ul className="qa__keys">
        <li>
          <kbd className="ui-kbd">Tab</kbd> επόμενο κελί
        </li>
        <li>
          <kbd className="ui-kbd">Enter</kbd> επόμενος στρατιώτης
        </li>
        <li>
          <kbd className="ui-kbd">↑</kbd>
          <kbd className="ui-kbd">↓</kbd> πάνω, κάτω
        </li>
        <li>
          <kbd className="ui-kbd">Ctrl</kbd>+<kbd className="ui-kbd">V</kbd> πολλές γραμμές από Excel ή Word
        </li>
        <li>
          <kbd className="ui-kbd">Ctrl</kbd>+<kbd className="ui-kbd">Enter</kbd> προσθήκη όλων
        </li>
      </ul>
    </div>
  );
}

/** The table with its header and one memo row per soldier. */
function quickAddTable(d: QuickAdd) {
  const { rows, errs, lists, onCell, onKey, onPaste, onDel } = d;
  return (
    <div className="qa">
      <table>
        <thead>
          <tr>
            <th className="qa__n">#</th>
            {QA_COLS.map((k) => (
              <th key={k} className={'qa__' + k}>
                {LABEL[k]}
              </th>
            ))}
            <th className="qa__st"></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <QuickAddRow
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id; the row number is its identity, as before
              key={i}
              r={r}
              i={i}
              err={errs[i] || null}
              lists={lists}
              tail={i === rows.length - 1 && !isFilled(r)}
              af={i === rows.length - 1}
              onCell={onCell}
              onKey={onKey}
              onPaste={onPaste}
              onDel={onDel}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** «Ο στρατιώτης δεν προστέθηκε»: the question when closing with filled rows. */
function quickAddAsk(d: QuickAdd, onClose: () => void) {
  const { n, bad, setAsking, save } = d;
  return (
    <UnsavedDialog
      title={n === 1 ? 'Ο στρατιώτης δεν προστέθηκε' : 'Οι ' + n + ' στρατιώτες δεν προστέθηκαν'}
      saveLabel={'Πρόσθεσε ' + (n === 1 ? '1 στρατιώτη' : n + ' στρατιώτες')}
      canSave={!bad}
      onSave={() => {
        setAsking(false);
        save();
      }}
      discardLabel="Κλείσε χωρίς προσθήκη"
      onDiscard={() => {
        setAsking(false);
        onClose();
      }}
      onBack={() => setAsking(false)}
    >
      <p style={{ margin: 0 }}>
        {bad ? (
          <>
            <b>{bad === 1 ? '1 γραμμή θέλει' : bad + ' γραμμές θέλουν'} διόρθωση</b> πριν από την προσθήκη. Πάτα «Πίσω»
            για να τις διορθώσεις.
          </>
        ) : (
          <>Πάτα «Πρόσθεσε» για να μπουν τώρα στο Δυναμολόγιο.</>
        )}
      </p>
      <p className="note" style={{ margin: 0 }}>
        Αν κλείσεις χωρίς προσθήκη, ό,τι έγραψες μένει στο πρόχειρο και το βρίσκεις την επόμενη φορά που θα ανοίξεις τη
        Γρήγορη εισαγωγή.
      </p>
    </UnsavedDialog>
  );
}

/**
 * Adds many soldiers at once: write one under the other like in Excel, Enter goes to the next, and at the end one add
 * for all (one undo, one entry in the Δυναμολόγιο). What is written is kept in a draft if the window closes before the add.
 * @decision Michael, 19/10: quick entry in the new ΕΣΣΟ.
 * @see test/screens-dialogs-forms.test.ts
 */
export function QuickAddDialog({ onClose }: QuickAddDialogProps) {
  const d = useQuickAdd(onClose);
  const { store, draft, asking, clear, close } = d;
  const people = store.state.settings.sources?.people;
  const writes = people && people.write !== false;
  return (
    <Dialog
      title="Γρήγορη εισαγωγή στρατιωτών"
      size="xl"
      closeOnOverlay={false}
      onClose={close}
      footer={quickAddFoot(d)}
      description="Γράψε τον έναν κάτω από τον άλλον, σαν στο Excel. Στο τέλος μία προσθήκη για όλους."
    >
      {quickAddTop(d)}
      {draft && (
        <Alert tone="info">
          <span>
            Συνεχίζεις από εκεί που είχες μείνει: {draft.rows.length} {draft.rows.length === 1 ? 'γραμμή' : 'γραμμές'}{' '}
            από το πρόχειρο.{' '}
            <Button variant="link" onClick={clear}>
              Ξεκίνα από την αρχή
            </Button>
          </span>
        </Alert>
      )}
      {quickAddTable(d)}
      <p className="note">
        Πατρώνυμο, ΑΣΜ, τηλέφωνο και θάλαμος δεν είναι υποχρεωτικά. Το Σ.Ι. ξεκινά Ι1 σε κάθε γραμμή. Πόστο, ρόλος και
        όπλο μπαίνουν μετά από την καρτέλα του καθενός ή από την οθόνη Οπλισμός.{' '}
        {writes ? 'Γράφονται όλοι μαζί στο Δυναμολόγιο, ο καθένας στον θάλαμό του.' : ''}
      </p>
      {asking && quickAddAsk(d, onClose)}
    </Dialog>
  );
}
