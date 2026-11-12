// «Ρυθμίσεις › Εισαγωγή Δυναμολογίου» card: pick the roster file, see the preview, confirm.
// Purpose: `ImportCard`, the entry to the roster import; the preview and its steps are `RosterPreview`.
// Does NOT: hold state (model/useImportCard.ts) or read the file.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/screens-dialogs-forms.test.ts.
import { Alert, Button, Card } from '../../../../shared/ui';
import { useImportCard } from '../../model/useImportCard';
import { RosterPreview } from './RosterPreview';

/** One text node: the sentence that ends with the space before the «Αρχεία Excel» link. */
const COLUMNS_NOTE = '. Οι στήλες βρίσκονται από τις επικεφαλίδες· αν κάτι δεν βρεθεί σωστά, το δείχνεις στα ';

/** «Εισαγωγή από το Δυναμολόγιο». */
export function ImportCard() {
  const { nav, pv, setPv, err, busy, pick } = useImportCard();
  return (
    <Card title="Εισαγωγή από το Δυναμολόγιο">
      <p style={{ marginTop: 0 }}>
        Διαβάζει το φύλλο <b>ΣΥΝΟΛΙΚΟ</b> (βαθμός, Ο/Σ, ονοματεπώνυμο, πατρώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος),
        τα <b>ΠΟΣΤΑ</b> και το <b>ΕΚΤΟΣ ΔΥΝΑΜΗΣ</b>
        {COLUMNS_NOTE}
        <Button variant="link" onClick={() => nav.set({ tab: 'files' })}>
          Αρχεία Excel
        </Button>
        .
      </p>
      <p className="note">
        Όσοι υπάρχουν ήδη ενημερώνονται (ταίριασμα με ΑΣΜ, αλλιώς ονοματεπώνυμο και πατρώνυμο). Οι υπηρεσίες, τα ιατρικά
        και οι ποινές τους μένουν. Μετά την εισαγωγή, όταν διορθώνεις στοιχεία ατόμου στην εφαρμογή (π.χ. Σ.Ι.,
        τηλέφωνο), η διόρθωση γράφεται και στο κελί του στο Δυναμολόγιο.
      </p>
      {!pv && (
        <Button disabled={busy} onClick={pick}>
          {busy ? 'Ανάγνωση…' : 'Διάλεξε αρχείο Δυναμολογίου…'}
        </Button>
      )}
      {pv && (
        <RosterPreview
          pv={pv}
          onDone={() => {
            setPv(null);
            nav.go('people');
          }}
          onCancel={() => setPv(null)}
        />
      )}
      {err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
    </Card>
  );
}
