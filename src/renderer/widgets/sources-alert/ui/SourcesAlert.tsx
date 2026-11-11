// The «Αρχεία Excel» alert of «Σήμερα».
// Purpose: `SourcesAlert` says which Excel files need attention (not found, waiting for a column map, changed outside the
//   app, open in Excel…), or reminds that the Δυναμολόγιο is not set, with the «Δες τα» link to Αρχεία Excel.
// Does NOT: judge the status (model/view.ts) or fetch it (model/useSourceStatus.ts).
// Owner layer: renderer/widgets/sources-alert. Why: moved verbatim from screens/srcStatus.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts (Σήμερα), test/sources.test.ts.
import { useNav, useStore } from '../../../shared/model';
import { Alert, Button } from '../../../shared/ui';
import { useSourceStatus } from '../model/useSourceStatus';
import { sourceAlertLines } from '../model/view';

// Για το «Σήμερα»: τι θέλει προσοχή στα αρχεία, ανά αρχείο (το Δυναμολόγιο έχει συνήθως πολλά είδη)
export function SourcesAlert() {
  const { state, today } = useStore();
  const st = useSourceStatus();
  const nav = useNav();
  const go = () => nav.go('templates', { tab: 'files' });
  const lines = sourceAlertLines(st, today);
  if (!lines.length)
    return state.people.length && !state.settings.sources?.people ? (
      <div className="srcalert">
        <Alert tone="info">
          <span>
            <b>Αρχεία Excel.</b> Οι διορθώσεις στα άτομα δεν γράφονται ακόμα σε κανένα Excel.{' '}
            <Button variant="link" onClick={go}>
              Όρισε το Δυναμολόγιο
            </Button>
          </span>
        </Alert>
      </div>
    ) : null;
  return (
    <div className="srcalert">
      <Alert tone="warn">
        <span>
          <b>Αρχεία Excel.</b>{' '}
          {lines.length === 1 ? (
            lines[0]
          ) : (
            <ul className="srcalert__list">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}{' '}
          <Button variant="link" onClick={go}>
            Δες τα
          </Button>
        </span>
      </Alert>
    </div>
  );
}
