// The «Είσοδος όπλων» dialog.
// Purpose: `WeaponInDialog` draws the form that brings the chosen open moves back in: each exit gets its entry reason
//   (ΕΚΠ → ΛΗΞ ΕΚΠ) unless one is typed for all; the state and the save come from `useWeaponIn` (model/).
// Does NOT: hold state or change the `weaponIn` command.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-WeaponInDialog), test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { RkName, rkShort } from '../../../entities/person';
import { Alert, Button, DateField, Dialog, GoLink, TimeField, Why, type ValueEvent } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { shortName } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { useWeaponIn, type WeaponIn, type WeaponInDialogProps } from '../model/useWeaponIn';

/** The footer: why it cannot save yet, «Άκυρο» and the entry button. */
function weaponInFoot(d: WeaponIn, onClose: () => void) {
  const { moves, ok, miss, save } = d;
  return (
    <>
      <Why text={miss} />
      <Button variant="outline" onClick={onClose}>
        Άκυρο
      </Button>
      <Button disabled={!ok} why={miss} data-autofocus="" onClick={save}>
        Είσοδος{moves.length > 1 ? ' (' + moves.length + ')' : ''}
      </Button>
    </>
  );
}

/** The day, the time and the entry reason. */
function weaponInForm(d: WeaponIn) {
  const { day, setDay, time, setTime, reason, setReason, backs } = d;
  // before any <small> / note: test/ux-names.test.ts reads the source text and wants a GoLink, never plain text
  const settingsLink = (
    <GoLink view="templates" params={{ tab: 'lists' }}>
      Ρυθμίσεις › Λίστες
    </GoLink>
  );
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="wi-d">
            Μέρα
          </label>
          <DateField
            id="wi-d"
            className="ui-input"
            value={day}
            onChange={(e: ValueEvent) => e.target.value && setDay(e.target.value)}
          />
        </div>
        <TimeField
          id="wi-t"
          now={true}
          label="Ώρα εισόδου *"
          value={time}
          onChange={setTime}
          help="Η τωρινή· άλλαξέ την αν μπήκε νωρίτερα"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="wi-r">
          Λόγος εισαγωγής
        </label>
        <input
          id="wi-r"
          className="ui-input"
          placeholder={backs.length === 1 ? backs[0] : 'Αυτόματα: ' + backs.join(', ')}
          value={reason}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
        />
        <span className="field__help">
          {reason.trim() ? (
            'Γράφεται σε όλα: ' + reason.trim().toUpperCase()
          ) : (
            <>Κενό: ο λόγος εισαγωγής κάθε εξόδου από τη λίστα ({settingsLink})</>
          )}
        </span>
      </div>
    </>
  );
}

/** The list of moves, and the warnings (armed number keeps the weapon out, time before the exit). */
function weaponInNotes(d: WeaponIn) {
  const { lists, pm, moves, reason, stay, early } = d;
  return (
    <>
      {moves.length > 1 && (
        <ul className="hist weapon-movelist">
          {moves.map((m) => (
            <li key={m.id}>
              <b>
                <RkName p={pm.get(m.pid)!} />
              </b>{' '}
              <span className="muted">
                {m.weapon} · {m.reason} {dm(m.outDay)} {m.outTime} →
              </span>{' '}
              {reason.trim().toUpperCase() || weaponBack(m.reason, lists)}
            </li>
          ))}
        </ul>
      )}
      {stay.length > 0 && (
        <Alert tone="warn">
          <span>
            {stay.map((x, i) => (
              <span key={x.m.id}>
                {i ? <br /> : ''}
                <b>
                  <RkName p={pm.get(x.m.pid)!} />
                </b>
                : {x.s!.text}
              </span>
            ))}
          </span>
        </Alert>
      )}
      {early.length > 0 && (
        <Alert tone="bad">
          <span>
            Η ώρα εισόδου είναι πριν την έξοδο για{' '}
            {early.map((m) => shortName(pm.get(m.pid)!) + ' (' + dm(m.outDay) + ' ' + m.outTime + ')').join(', ')}.
          </span>
        </Alert>
      )}
    </>
  );
}

/** Είσοδος όπλων: κάθε έξοδος παίρνει τον λόγο εισαγωγής της (ΕΚΠ → ΛΗΞ ΕΚΠ), εκτός αν γράψεις άλλον για όλα. */
export function WeaponInDialog(props: WeaponInDialogProps) {
  const { onClose } = props;
  const d = useWeaponIn(props);
  const { pm, moves } = d;
  return (
    <Dialog
      title={'Είσοδος όπλων' + (moves.length > 1 ? ' (' + moves.length + ')' : '')}
      description={
        moves.length === 1
          ? rkShort(pm.get(moves[0].pid)!) +
            ' · όπλο ' +
            moves[0].weapon +
            ' · βγήκε ' +
            moves[0].reason +
            ' ' +
            dm(moves[0].outDay) +
            ' ' +
            moves[0].outTime
          : moves.length + ' όπλα που είναι εκτός'
      }
      onClose={onClose}
      footer={weaponInFoot(d, onClose)}
    >
      {weaponInForm(d)}
      {weaponInNotes(d)}
    </Dialog>
  );
}
