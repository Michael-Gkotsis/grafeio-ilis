// The «Διόρθωση κίνησης όπλου» dialog.
// Purpose: `EditMoveDialog` draws the form that changes one weapon move: reason, exit, entry, note; «Είναι ακόμα εκτός»
//   removes the entry; «Σβήσε» deletes the move. The state and the commands come from `useEditMove` (model/).
// Does NOT: hold state or change the `editWeaponMove` / `deleteWeaponMove` commands.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-EditMoveDialog), test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { rkText } from '../../../entities/person';
import { Button, ChoiceField, DateField, Dialog, TimeField, type ValueEvent } from '../../../shared/ui';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import { plainName } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { useEditMove, type EditMove, type EditMoveDialogProps } from '../model/useEditMove';

/** The footer: «Σβήσε», «Άκυρο» and «Αποθήκευση». */
function editMoveFoot(del: () => void, onClose: () => void, ok: boolean, miss: string, save: () => void) {
  return (
    <>
      <Button variant="ghost" onClick={del} data-tip="Σβήνει την κίνηση (αναιρείται με Ctrl+Z)">
        Σβήσε
      </Button>
      <span style={{ flex: 1 }} />
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button disabled={!ok} why={miss} onClick={save}>
        Αποθήκευση
      </Button>
    </>
  );
}

/** The entry day, time and reason (only when the weapon is back). */
function editMoveEntry(x: EditMove['x'], set: EditMove['set'], lists: EditMove['lists']) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="we-id">
            Μέρα εισόδου
          </label>
          <DateField
            id="we-id"
            className="ui-input"
            min={x.outDay}
            value={x.inDay}
            onChange={(e: ValueEvent) => e.target.value && set('inDay')(e.target.value)}
          />
        </div>
        <TimeField id="we-it" now={true} label="Ώρα εισόδου *" value={x.inTime} onChange={set('inTime')} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="we-ir">
          Λόγος εισαγωγής
        </label>
        <input
          id="we-ir"
          className="ui-input"
          placeholder={weaponBack(x.reason, lists)}
          value={x.inReason}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('inReason')(e.target.value)}
        />
      </div>
    </>
  );
}

/** Διόρθωση μιας κίνησης: λόγοι, μέρες, ώρες, παρατήρηση· «Είναι ακόμα εκτός» σβήνει την είσοδο. */
export function EditMoveDialog(props: EditMoveDialogProps) {
  const { m, onClose } = props;
  const { lists, reasons, x, setX, p, ok, miss, save, del, set } = useEditMove(props);
  return (
    <Dialog
      title="Διόρθωση κίνησης όπλου"
      description={(p ? rkText(p, plainName, true) : '') + ' · όπλο ' + m.weapon}
      onClose={onClose}
      footer={editMoveFoot(del, onClose, ok, miss, save)}
    >
      <ChoiceField
        id="we-r"
        label="Λόγος εξόδου *"
        value={x.reason}
        options={reasons}
        otherLabel="Άλλος λόγος (γράψε τον)…"
        onChange={set('reason')}
      />
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="we-od">
            Μέρα εξόδου
          </label>
          <DateField
            id="we-od"
            className="ui-input"
            value={x.outDay}
            onChange={(e: ValueEvent) => e.target.value && set('outDay')(e.target.value)}
          />
        </div>
        <TimeField id="we-ot" now={true} label="Ώρα εξόδου *" value={x.outTime} onChange={set('outTime')} />
      </div>
      <label className="ui-checkrow" style={{ margin: '4px 0 10px' }}>
        <input
          type="checkbox"
          className="ui-check"
          checked={!x.inDay}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setX((o) =>
              e.target.checked
                ? { ...o, inDay: '', inTime: '', inReason: '' }
                : { ...o, inDay: todayFn(), inTime: nowHM() },
            )
          }
        />{' '}
        Είναι ακόμα εκτός (χωρίς είσοδο)
      </label>
      {x.inDay && editMoveEntry(x, set, lists)}
      <div className="field">
        <label className="field__label" htmlFor="we-n">
          Παρατήρηση
        </label>
        <input
          id="we-n"
          className="ui-input"
          value={x.note}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('note')(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
