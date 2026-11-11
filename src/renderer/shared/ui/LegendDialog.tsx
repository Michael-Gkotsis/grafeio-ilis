// The code legend (Shift+F1).
// Purpose: `LegendDialog` explains every status code and what it does in the app, and lists the keyboard shortcuts.
//   It is built from the same table the rules use (`TYPES`), so it cannot drift from them.
// Does NOT: change anything; «Οδηγός χρήσης» opens the guide.
// Owner layer: renderer/shared/ui (navigates through shared/model).
// Covering test: test/screens-dialogs-shell.test.ts (the legend dialog snapshot).
// @decision research 10: the legend comes from the rules' own table.
import { TYPES, TYPE_KEYS, effects } from '../../../shared/domain';
import { HK } from '../../../shared/unit';
import { useNav } from '../model/nav';
import { Badge, Kbd } from './Badge';
import { Button } from './Button';
import { Dialog } from './Dialog';

// [keys, what they do]
const SHORTCUTS = (): [string, string][] => [
  ['Ctrl K', 'Αναζήτηση προσώπου ή ενέργειας από οπουδήποτε'],
  ['Ctrl F', 'Αναζήτηση στη λίστα της οθόνης'],
  ['Ctrl N', 'Δήλωσε κατάσταση (ιατρικό, άδεια, έξοδος, ποινή)'],
  ['Ctrl Z', 'Αναίρεση της τελευταίας ενέργειας'],
  [
    'Alt 1 … 9',
    'Σήμερα, Δυναμολόγιο, Στελέχη, Υπηρεσίες, Εξοδούχοι, Ιατρικά, Δύναμη, ' +
      HK() +
      ' (με Ποινές, Άδειες, Αιτήσεις), Οπλισμός',
  ],
  ['Alt 0', 'Ρυθμίσεις'],
  ['Ctrl E', 'Έντυπα (δικά σου Excel)'],
  ['Alt ←', 'Πίσω στην προηγούμενη οθόνη (και το πλαϊνό κουμπί του ποντικιού)'],
  ['Ctrl B', 'Μενού πλήρες ή μόνο εικονίδια'],
  ['F1', 'Οδηγός χρήσης για την οθόνη που βλέπεις'],
  ['Shift F1', 'Αυτό το υπόμνημα'],
  ['Esc', 'Κλείσιμο παραθύρου ή καρτέλας'],
];
const CAT: Record<string, string> = {
  med: 'Ιατρικό',
  other: 'Άλλο',
  pun: 'Ποινή',
  abs: 'Απουσία',
  out: 'Έξοδος',
  kol: 'Κωλυόμενος',
};

/** Props of `LegendDialog`. */
export interface LegendDialogProps {
  onClose: () => void;
}

/** The legend dialog. */
export function LegendDialog({ onClose }: LegendDialogProps) {
  const nav = useNav();
  return (
    <Dialog
      size="lg"
      title="Υπόμνημα κωδικών"
      description={`Τι σημαίνει κάθε κωδικός και τι αλλάζει στις υπηρεσίες, στις εξόδους και στην ${HK()}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={() => nav.go('guide')}>
            Οδηγός χρήσης
          </Button>
          <Button onClick={onClose}>Κλείσιμο</Button>
        </>
      }
    >
      <table className="legend">
        <thead>
          <tr>
            <th>Κωδικός</th>
            <th>Σημαίνει</th>
            <th>Τι κάνει</th>
          </tr>
        </thead>
        <tbody>
          {TYPE_KEYS.map((k) => {
            const t = TYPES[k];
            return (
              <tr key={k}>
                <td>
                  <Badge tone={t.tone}>{t.label}</Badge>
                </td>
                <td>
                  {t.long}
                  <small className="muted">
                    {' · '}
                    {CAT[t.cat] || t.cat}
                    {t.code ? ' · στο ημερολόγιο: ' + t.code : ''}
                  </small>
                </td>
                <td>
                  {effects(t) || 'Μπαίνει κανονικά σε υπηρεσίες και έξοδο'}
                  {k === 'PUN' ? '. Αιτείται στην ' + HK() + ' και ισχύει όταν εγκριθεί.' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note" style={{ margin: '10px 0 0' }}>
        Στις υπηρεσίες: <b>Ένοπλη</b> θέση = δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ. <b>★</b> = υπηρεσία σε ΣΚ ή αργία.{' '}
        <b>⚠</b> = πέρασε παρά τον κανόνα. Στον έλεγχο υπηρεσιών: Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ.
      </p>
      <h3 style={{ fontSize: '15px', margin: '14px 0 6px' }}>Συντομεύσεις</h3>
      <table className="legend">
        <tbody>
          {SHORTCUTS().map(([k, t]) => (
            <tr key={k}>
              <td className="nw">
                <Kbd>{k}</Kbd>
              </td>
              <td>{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
