// The preview before a roster import: how many soldiers are in the file, what changes, what looks wrong.
// Purpose: `RosterPreview`, shown in «Αρχεία Excel» (Ανάγνωση προσωπικού) and in the Δυναμολόγιο import card.
// Does NOT: read the file (the main process made `pv`) or hold state (model/useRoster.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered. The tiles and the lists are plain functions.
// Covering test: test/screens-settings-guide.test.ts.
import type { ChangeEvent } from 'react';
import type { ImportPreview } from '../../../../../shared/api';
import { Alert, Badge, Button } from '../../../../shared/ui';
import { useRoster } from '../../model/useRoster';

export interface RosterPreviewProps {
  /** The preview the main process made of the roster file. */
  pv: ImportPreview;
  onDone: () => void;
  onCancel: () => void;
}

/** The five numbers on top. */
function rosterTiles(pv: ImportPreview) {
  return (
    <div className="tiles">
      <div className="tile tile--main">
        <span className="tile__n">{pv.active}</span>
        <span className="tile__l">Σε δύναμη</span>
      </div>
      <div className="tile">
        <span className="tile__n">{pv.added}</span>
        <span className="tile__l">Νέοι</span>
      </div>
      <div className="tile">
        <span className="tile__n">{pv.changes.length}</span>
        <span className="tile__l">Αλλάζουν</span>
      </div>
      <div className="tile">
        <span className="tile__n">{pv.same}</span>
        <span className="tile__l">Ίδιοι</span>
      </div>
      <div className="tile">
        <span className="tile__n">{pv.total - pv.active}</span>
        <span className="tile__l">Εκτός δύναμης</span>
      </div>
    </div>
  );
}

/** What the file says: the matching total, the changes (first 120), the warnings and the rows that look wrong. */
function rosterFindings(pv: ImportPreview) {
  return (
    <>
      {pv.declared != null && pv.declared === pv.found && (
        <Alert tone="ok">
          <span>
            ✓ Το Δυναμολόγιο γράφει <b>ΣΥΝΟΛΟ {pv.declared}</b> και βρέθηκαν <b>{pv.found}</b> άτομα. Ταιριάζουν.
          </span>
        </Alert>
      )}
      {pv.changes.length > 0 && (
        <details className="note" open={pv.changes.length <= 12}>
          <summary>Τι αλλάζει ({pv.changes.length})</summary>
          <ul>
            {pv.changes.slice(0, 120).map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: frozen DOM, the list is positional and keyed by index as before
              <li key={i}>
                <b>{c.who}</b>: {c.what}
              </li>
            ))}
          </ul>
          {pv.changes.length > 120 && <p>… και {pv.changes.length - 120} ακόμα</p>}
        </details>
      )}
      {!pv.changes.length && !pv.added && (
        <Alert tone="ok">
          <span>✓ Η εφαρμογή έχει ήδη ό,τι γράφει το Excel για όσους υπάρχουν.</span>
        </Alert>
      )}
      {pv.warnings.map((w) => (
        <Alert key={w} tone="warn">
          <span>{w}</span>
        </Alert>
      ))}
      {pv.skipped.length > 0 && (
        <details className="note">
          <summary>Αγνοήθηκαν {pv.skipped.length} γραμμές που δεν είναι άτομα (σύνολα, επικεφαλίδες)</summary>
          <p>{[...new Set(pv.skipped)].join(' · ')}</p>
        </details>
      )}
      {pv.suspicious.length > 0 && (
        <Alert tone="warn">
          <span>
            {pv.suspicious.length}
            {' γραμμές δεν έχουν ούτε ΑΣΜ, ούτε τηλέφωνο, ούτε θάλαμο. Είναι σίγουρα άτομα; '}
            {pv.suspicious.slice(0, 12).join(' · ')}
            {pv.suspicious.length > 12 ? ' …' : ''}
          </span>
        </Alert>
      )}
    </>
  );
}

/** The preview with its two boxes, the buttons and the error line. */
export function RosterPreview({ pv, onDone, onCancel }: RosterPreviewProps) {
  const { deact, setDeact, okd, setOkd, busy, err, doubt, go } = useRoster(pv, onDone);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <span className="plan__fn">{pv.file}</span>
        {pv.essos && (
          <>
            {' '}
            <Badge tone="info">ΕΣΣΟ {pv.essos}</Badge>
          </>
        )}
      </div>
      {rosterTiles(pv)}
      {rosterFindings(pv)}
      {doubt && (
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={okd}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOkd(e.target.checked)}
          />
          <span>
            <b>Το έλεγξα, συνέχισε</b>
            <small>Χρειάζεται επειδή κάτι δεν ταιριάζει παραπάνω.</small>
          </span>
        </label>
      )}
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={deact}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDeact(e.target.checked)}
        />
        <span>
          <b>Όσοι δεν είναι στο αρχείο → εκτός δύναμης</b>
          <small>
            {pv.missing
              ? pv.missing + ' άτομα της εφαρμογής δεν βρέθηκαν στο αρχείο.'
              : 'Όλοι της εφαρμογής βρέθηκαν στο αρχείο.'}
            {
              ' Όσοι έχουν ιστορικό κρατιούνται· όσοι δεν έχουν καμία καταχώρηση (π.χ. λάθος γραμμές παλιάς εισαγωγής) σβήνονται.'
            }
          </small>
        </span>
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button variant="outline" onClick={onCancel}>
          Άκυρο
        </Button>
        <Button disabled={busy || (doubt && !okd)} why="Τσέκαρε πρώτα «Το έλεγξα, συνέχισε»" onClick={go}>
          Εισαγωγή {pv.total} ατόμων
        </Button>
      </div>
      <span className="note">
        Πριν την εισαγωγή κρατιέται αντίγραφο της βάσης. Αναιρείται από το Ιστορικό. Από εκεί και πέρα οι διορθώσεις σου
        στα άτομα γράφονται και στο ίδιο αρχείο (ρυθμίζεται στα «Αρχεία Excel»).
      </span>
      {err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
    </div>
  );
}
