// The «ενημέρωση Excel» dialog: what will be written, row by row, before it is written.
// Purpose: `WriteDialog`; the body is a plain function of the preview.
// Does NOT: hold state (model/useWrite.ts) or plan the write (the main process does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-WriteDialog*).
import type { Fail, WritePreview } from '../../../../../shared/api';
import { KIND, type ListKind } from '../../../../../shared/sources';
import { Alert, Button, Dialog } from '../../../../shared/ui';
import { useWrite } from '../../model/useWrite';
import { base } from '../../../../widgets/sources-alert';

export interface WriteDialogProps {
  list: ListKind;
  onClose: () => void;
}

/** The part of the preview that says how many changes there are and lists the first 80 lines. */
function changeLines(pv: WritePreview) {
  return !pv.total && !pv.create ? (
    <Alert tone="ok">
      <span>✓ Το Excel έχει ήδη ό,τι έχει η εφαρμογή.</span>
    </Alert>
  ) : (
    <>
      <p style={{ marginTop: 0 }}>
        <b>{pv.total}</b> {pv.total === 1 ? 'αλλαγή θα γραφτεί' : 'αλλαγές θα γραφτούν'}. Η προηγούμενη έκδοση μένει στο
        _προηγούμενα.
      </p>
      <ul className="hist">
        {pv.lines.slice(0, 80).map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the list is positional and keyed by index as before
          <li key={i}>
            <span className="nw">Γρ. {l.r + 1}</span> <b>{l.who}</b> {l.text}
          </li>
        ))}
      </ul>
      {pv.lines.length > 80 && <p className="note">… και {pv.lines.length - 80} ακόμα</p>}
    </>
  );
}

/** The dialog body: loading, the read error, or the preview with its notes. */
function previewBody(pv: WritePreview | Fail | null) {
  return !pv ? (
    <p>Ανάγνωση…</p>
  ) : !pv.ok ? (
    <Alert tone="bad">
      <span>{pv.error}</span>
    </Alert>
  ) : (
    <div>
      {pv.create && (
        <Alert tone="info">
          <span>Δεν υπάρχει ακόμα· θα φτιαχτεί με τίτλο και επικεφαλίδες στο {base(pv.file)}.</span>
        </Alert>
      )}
      {changeLines(pv)}
      {!!pv.tidy?.length && (
        <details className="note" open>
          <summary>Μορφή που λείπει από το φύλλο (μπαίνει μαζί)</summary>
          <ul>
            {pv.tidy.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}
      {pv.foreign > 0 && (
        <p className="note">
          {pv.foreign === 1 ? '1 γραμμή του Excel δεν είναι' : pv.foreign + ' γραμμές του Excel δεν είναι'} στην
          εφαρμογή (γράφτηκαν με το χέρι): δεν αγγίζονται. Πάτα «Ανανέωση από Excel» για να περάσουν.
        </p>
      )}
      {!!pv.ambiguous?.length && (
        <Alert tone="warn">
          <span>
            {pv.ambiguous
              .slice(0, 10)
              .map((l) => 'Γρ. ' + (l.r + 1) + ' ' + l.who)
              .join(', ')}
            {pv.ambiguous.length > 10 ? ' …' : ''}: αμφίσημη γραμμή (συνονόματοι χωρίς ΑΣΜ), δεν αγγίζεται. Βάλε ΑΣΜ ή
            πατρώνυμο για να ξεχωρίζουν.
          </span>
        </Alert>
      )}
      {(pv.warn || []).map((t) => (
        <Alert key={t} tone="warn">
          <span>{t}</span>
        </Alert>
      ))}
      {pv.notFound.length > 0 && (
        <Alert tone="warn">
          <span>
            Δεν βρέθηκαν στο φύλλο: {pv.notFound.slice(0, 10).join(', ')}
            {pv.notFound.length > 10 ? ' …' : ''}
          </span>
        </Alert>
      )}
    </div>
  );
}

/** The dialog that previews and then runs «Γράψε στο Excel» for one kind. */
export function WriteDialog({ list, onClose }: WriteDialogProps) {
  const { pv, busy, go } = useWrite(list, onClose);
  return (
    <Dialog
      size="lg"
      title={KIND[list].label + ': ενημέρωση Excel'}
      description={pv?.ok ? base(pv.file) : ''}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button
            disabled={busy || !pv || !pv.ok || (!pv.total && !pv.create && !pv.tidy?.length)}
            why={pv?.ok ? 'Το Excel έχει ήδη όσα ξέρει η εφαρμογή· δεν χρειάζεται αλλαγή' : 'Το Excel δεν διαβάστηκε'}
            onClick={go}
          >
            {busy ? 'Γράφεται…' : 'Γράψε στο Excel'}
          </Button>
        </>
      }
    >
      {previewBody(pv)}
    </Dialog>
  );
}
