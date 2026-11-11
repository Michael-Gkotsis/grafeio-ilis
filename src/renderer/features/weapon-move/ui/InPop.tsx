// The entry pop-up under the ΕΝΤΟΣ | ΕΚΤΟΣ switch of a weapon row.
// Purpose: `InPop` draws the time and the entry reason (ready from the list), the warnings, and «Μπαίνει ΕΝΤΟΣ»;
//   the state and the save come from `useInPop` (model/).
// Does NOT: hold state or change the `weaponIn` command.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { RkName } from '../../../entities/person';
import { Button } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { plainName } from '../../../../shared/domain';
import { useInPop, type InPopProps } from '../model/useInPop';
import { when } from '../model/text';
import { Pop } from './Pop';
import { WhenRow } from './WhenRow';

/** Είσοδος από τη γραμμή: ώρα (τώρα) και λόγος εισαγωγής από τη λίστα, έτοιμα· Enter και μπήκε. */
export function InPop(props: InPopProps) {
  const { p, m, anchor, onClose, onEdit } = props;
  const { today, auto, day, setDay, time, setTime, reason, setReason, t, early, ok, stay, go } = useInPop(props);
  return (
    <Pop anchor={anchor} onClose={onClose} label={'Είσοδος όπλου ' + m.weapon}>
      <div className="wpop__head">
        <b>Είσοδος όπλου {m.weapon}</b>
        <small>
          <RkName p={p} fn={plainName} keep={true} /> · βγήκε {m.reason} {when(m.outDay, m.outTime, today)}
        </small>
      </div>
      <form onSubmit={go}>
        <WhenRow label="Ώρα εισόδου" day={day} time={time} setDay={setDay} setTime={setTime} />
        <label className="wpop__field">
          <span>Λόγος εισαγωγής</span>
          <input
            className="ui-input"
            value={reason}
            placeholder={auto}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
            aria-label="Λόγος εισαγωγής"
          />
        </label>
        {early && (
          <p className="wpop__err">
            Η ώρα είναι πριν την έξοδο ({dm(m.outDay)} {m.outTime}).
          </p>
        )}
        {stay && (
          <p
            className="wpop__err wpop__err--warn"
            role="status"
            data-tip="Η είσοδος γράφεται κανονικά, αλλά το όπλο μένει ΕΚΤΟΣ όσο τρέχει το νούμερο της ένοπλης υπηρεσίας"
          >
            {stay.text}
          </p>
        )}
        <div className="wpop__acts">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              onEdit(m);
            }}
            data-tip="Άλλαξε λόγο, ώρα εξόδου ή παρατήρηση, ή σβήσε την κίνηση"
          >
            Διόρθωση εξόδου…
          </Button>
          <Button
            size="sm"
            type="submit"
            disabled={!ok}
            why={!t ? 'Λείπει: Ώρα' : 'Η ώρα είναι πριν την έξοδο'}
            data-autofocus=""
          >
            Μπαίνει ΕΝΤΟΣ
          </Button>
        </div>
      </form>
    </Pop>
  );
}
