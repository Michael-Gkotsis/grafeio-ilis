// The «Διόρθωση ώρας ένοπλης υπηρεσίας» dialog.
// Purpose: `DutyFixDialog` draws the form that changes the exit and entry time of one armed number, with a reason
//   (Michael, 24/10); «Πίσω στο αυτόματο» removes the fix. The state and the commands come from `useDutyFix` (model/).
// Does NOT: hold state or change the `fixDutyWeapon` command.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-DutyFixDialog), test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { rkShort, rkText } from '../../../entities/person';
import { Alert, Button, DateField, Dialog, TimeField, Why, type ValueEvent } from '../../../shared/ui';
import { hmOf, type ArmRow } from '../../../../shared/armed';
import { plainName } from '../../../../shared/domain';
import { useDutyFix, type DutyFix, type DutyFixDialogProps } from '../model/useDutyFix';

/** The footer: «Πίσω στο αυτόματο» (when there is a fix), the reason it cannot save yet, «Άκυρο» and «Αποθήκευση». */
function dutyFixFoot(row: ArmRow, why: string, onClose: () => void, save: () => void, reset: () => void) {
  return (
    <>
      {row.fix && (
        <Button
          variant="ghost"
          onClick={reset}
          data-tip="Σβήνει τη διόρθωση: οι ώρες ξαναβγαίνουν από τις υπηρεσίες (αναιρείται με Ctrl+Z)"
        >
          Πίσω στο αυτόματο
        </Button>
      )}
      <span style={{ flex: 1 }} />
      <Why text={why} />
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button disabled={!!why} why={why} onClick={save}>
        Αποθήκευση
      </Button>
    </>
  );
}

/** The exit and entry day and time. */
function dutyFixTimes(row: ArmRow, x: DutyFix['x'], set: DutyFix['set']) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="df-od">
            Μέρα εξόδου
          </label>
          <DateField
            id="df-od"
            className="ui-input"
            value={x.od}
            onChange={(e: ValueEvent) => e.target.value && set('od')(e.target.value)}
          />
        </div>
        <TimeField
          id="df-ot"
          now={true}
          label="Ώρα εξόδου *"
          value={x.ot}
          onChange={set('ot')}
          help={row.take ? 'Πότε παραλαμβάνει το όπλο' : 'Πότε βγαίνει το όπλο από τον οπλοβαστό'}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="df-id">
            Μέρα εισόδου
          </label>
          <DateField
            id="df-id"
            className="ui-input"
            min={x.od}
            value={x.id}
            onChange={(e: ValueEvent) => e.target.value && set('id')(e.target.value)}
          />
        </div>
        <TimeField
          id="df-it"
          now={true}
          label="Ώρα εισόδου *"
          value={x.it}
          onChange={set('it')}
          help={row.give ? 'Πότε το παραδίδει στον επόμενο' : 'Πότε μπαίνει πάλι στον οπλοβαστό'}
        />
      </div>
    </>
  );
}

/** Διόρθωση ώρας ενός ένοπλου νούμερου (Michael, 24/10): οι ώρες βγαίνουν από τις υπηρεσίες· εδώ αλλάζουν για αυτό το νούμερο, με λόγο. */
export function DutyFixDialog(props: DutyFixDialogProps) {
  const { row, onClose } = props;
  const { p, owner, x, set, why, save, reset } = useDutyFix(props);
  return (
    <Dialog
      title="Διόρθωση ώρας ένοπλης υπηρεσίας"
      description={
        row.reason +
        (p ? ' · ' + rkText(p, plainName, true) : '') +
        ' · αυτόματα ' +
        hmOf(row.autoOut) +
        '–' +
        hmOf(row.autoIn)
      }
      onClose={onClose}
      footer={dutyFixFoot(row, why, onClose, save, reset)}
    >
      {dutyFixTimes(row, x, set)}
      <div className="field">
        <label className="field__label" htmlFor="df-w">
          Λόγος της διόρθωσης *
        </label>
        <input
          id="df-w"
          className="ui-input"
          placeholder="π.χ. άργησε η αλλαγή φρουράς"
          value={x.why}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('why')(e.target.value)}
        />
        <span className="field__help">Γράφεται στο Ιστορικό και στην Παρατήρηση του Excel κινήσεων.</span>
      </div>
      {row.mode === 'post' && (
        <Alert tone="info">
          <span>
            Όπλο της θέσης{owner ? ' (' + rkShort(owner) + ')' : ''}: αλλάζει μόνο αυτή η γραμμή· οι άλλες μένουν όπως
            είναι.
          </span>
        </Alert>
      )}
    </Dialog>
  );
}
