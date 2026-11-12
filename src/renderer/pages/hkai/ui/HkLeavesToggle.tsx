// The leaves yes/no switch beside the «ΗΚΑΙ» preview (3. ΑΔΕΙΕΣ), for the shown day only.
// Purpose: `HkLeavesToggle`; a save flips the preview to the back page so the change shows at once.
// Does NOT: hold state (model/useLeavesToggle.ts). The default for other days is in «Ενότητες της ΗΚΑΙ».
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// @decision Michael 22/10: leaves yes/no for the day you see, next to the preview. @decision Michael 24/10: the default
//   for the other days is in «Ενότητες της ΗΚΑΙ».
// Covering test: test/screens-main.test.ts.
import { dm } from '../../../../shared/dates';
import { useLeavesToggle } from '../model/useLeavesToggle';

/** The switch; `date` is an ISODate, `onToggle` runs after a successful save. */
export function HkLeavesToggle({ date, onToggle }: { date: string; onToggle: () => void }) {
  const { on, def, own, set } = useLeavesToggle(date, onToggle);
  return (
    <label
      className="rule"
      style={{ margin: 0, alignItems: 'center' }}
      data-tip={
        'Μόνο για τη ' +
        dm(date) +
        ': άδειες που δηλώνεις απευθείας (στρατιωτών και στελεχών), τη μέρα που ξεκινούν. ' +
        'Οι αιτήσεις που εγκρίθηκαν μένουν μόνο στο «5. Αιτήσεις». ' +
        (own
          ? 'Η προεπιλογή των άλλων ημερών είναι ' + (def ? 'ανοιχτή' : 'κλειστή') + ' (Ενότητες της ΗΚΑΙ).'
          : 'Τώρα ακολουθεί την προεπιλογή (Ενότητες της ΗΚΑΙ).')
      }
    >
      <input type="checkbox" className="ui-check" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <b>Άδειες στο «3. Άδειες»</b> <small>για αυτή τη μέρα</small>
      </span>
    </label>
  );
}
