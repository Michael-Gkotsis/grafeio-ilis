// The «Έξοδος όπλων» dialog.
// Purpose: `WeaponOutDialog` draws the form for the people chosen on the Οπλισμός screen: only those with a weapon number
//   who are in can go out; the state and the save come from `useWeaponOut` (model/).
// Does NOT: hold state or change the `weaponOut` command.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-WeaponOutDialog), test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { rkText } from '../../../entities/person';
import { Alert, Button, ChoiceField, DateField, Dialog, TimeField, Why, type ValueEvent } from '../../../shared/ui';
import { plainName } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { useWeaponOut, type WeaponOut, type WeaponOutDialogProps } from '../model/useWeaponOut';

/** The footer: why it cannot save yet, «Άκυρο» and the exit button. */
function weaponOutFoot(d: WeaponOut, r0: string, onClose: () => void) {
  const { go, ok, miss, save } = d;
  return (
    <>
      <Why text={miss} />
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button disabled={!ok} why={miss} data-autofocus={r0 ? '' : undefined} onClick={save}>
        Έξοδος{go.length > 1 ? ' (' + go.length + ')' : ''}
      </Button>
    </>
  );
}

/** The day, the time and the remark. */
function weaponOutWhen(d: WeaponOut) {
  const { day, setDay, time, setTime } = d;
  // d.note, not a local `note`: test/ux-names.test.ts scans the text after the first `note` for plain «Ρυθμίσεις › …»
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="wo-d">
            Μέρα
          </label>
          <DateField
            id="wo-d"
            className="ui-input"
            value={day}
            onChange={(e: ValueEvent) => e.target.value && setDay(e.target.value)}
          />
        </div>
        <TimeField
          id="wo-t"
          now={true}
          label="Ώρα εξόδου *"
          value={time}
          onChange={setTime}
          help="Η τωρινή· άλλαξέ την αν βγήκε νωρίτερα"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="wo-n">
          Παρατήρηση
        </label>
        <input
          id="wo-n"
          className="ui-input"
          placeholder="π.χ. πεδίο βολής Σχιστού"
          value={d.note}
          onChange={(e: ChangeEvent<HTMLInputElement>) => d.setNote(e.target.value)}
        />
      </div>
    </>
  );
}

/** Έξοδος όπλων για όσους διάλεξες: μόνο όσοι έχουν αριθμό όπλου και είναι εντός. */
export function WeaponOutDialog(props: WeaponOutDialogProps) {
  const { onClose, reason: r0 = '' } = props;
  const d = useWeaponOut(props);
  const { lists, reasons, reason, setReason, go, noW, already, names } = d;
  return (
    <Dialog
      title={'Έξοδος όπλων' + (go.length > 1 ? ' (' + go.length + ')' : '')}
      description={
        go.length === 1
          ? rkText(go[0], plainName, true) + ' · όπλο ' + go[0].weapon
          : go.length
            ? names(go)
            : 'Κανένα όπλο για έξοδο'
      }
      onClose={onClose}
      footer={weaponOutFoot(d, r0, onClose)}
    >
      <ChoiceField
        id="wo-r"
        label="Λόγος εξόδου *"
        value={reason}
        options={reasons}
        autoFocus={!r0}
        placeholder="π.χ. ΦΡΟΥΡΑ"
        otherLabel="Άλλος λόγος (γράψε τον)…"
        otherHelp="Για να προτείνεται κάθε φορά, με τον λόγο εισαγωγής του, πρόσθεσέ τον στις Ρυθμίσεις › Λίστες."
        onChange={setReason}
      />
      {reason.trim() && (
        <p className="note" style={{ margin: '-4px 0 10px' }}>
          Όταν μπει πάλι: <b>{weaponBack(reason, lists)}</b>
        </p>
      )}
      {weaponOutWhen(d)}
      {(noW.length > 0 || already.length > 0) && (
        <Alert tone="warn">
          <span>
            {noW.length > 0 && <span>Χωρίς αριθμό όπλου, δεν βγαίνουν: {names(noW)}.</span>}
            {already.length > 0 && (
              <span>
                {noW.length ? <br /> : ''}Είναι ήδη εκτός: {names(already)}.
              </span>
            )}
          </span>
        </Alert>
      )}
    </Dialog>
  );
}
