// The tab «Σειρά δικαιοσύνης» of the rules dialog: the steps the autofill and «Επόμενος» take, read only.
// Purpose: `orderTab`, a plain function called as `{orderTab(d, onTab)}`.
// Does NOT: change anything (the steps come from model/rulesView.ts `fairSteps`).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup and text nodes.
// Covering test: test/ux-names.test.ts, test/guard-page-view.test.ts.
import { Badge } from '../../../shared/ui';
import { fairSteps } from '../model/rulesView';
import type { RulesModel } from '../model/useRulesDialog';
import { TabLink } from './TabLink';

// «ανοιχτό» / «κλειστό» badge of a switch.
const onOff = (on: boolean) => <Badge tone={on ? 'ok' : undefined}>{on ? 'ανοιχτό' : 'κλειστό'}</Badge>;

/** The tab: the lead, the numbered steps and two notes. */
export function orderTab(d: RulesModel, onTab: (tab: string) => void) {
  const steps = fairSteps(d.r, d.st);
  return (
    <div className="rl-tab">
      <p className="note">
        Έτσι διαλέγει η αυτόματη συμπλήρωση και το «Επόμενος». Δίπλα σε κάθε όνομα το «Γιατί:» λέει ποιο βήμα τον έφερε.
      </p>
      <ol className="rl-steps">
        {steps.map((step, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the steps are a fixed list: position is the key, as before
          <li key={i}>
            <b>{step.title}</b> {step.on === null ? '' : onOff(step.on)}
            <small>{step.text}</small>
          </li>
        ))}
      </ol>
      <span className="note">
        Πριν από όλα μπαίνουν οι μόνιμοι Λ/Υ και Δ/Υ. ΕΠΟΠ, ΟΒΑ και στελέχη δεν μπαίνουν ποτέ από την αυτόματη
        συμπλήρωση, μόνο με το χέρι. Το ίδιο όσοι έχουν πόστο (και στο Λ/Υ-Δ/Υ).
      </span>
      <span className="note">
        Τι έχει κάνει ο καθένας: <TabLink onGo={() => onTab('check')}>Υπηρεσίες › Έλεγχος</TabLink>
      </span>
    </div>
  );
}
