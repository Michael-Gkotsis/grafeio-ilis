// The «Διόρθωση λόγου/ώρας» dialog for the ticked moves.
// Purpose: `BulkFixDialog` draws the reason buttons (with their 1-9 keys, handled in `useBulkFix`), the optional new exit
//   time and the list of moves that change; one command, one undo (Michael, 24/10).
// Does NOT: hold state or change the `editWeaponMoves` command.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-BulkFixDialog), test/weapons.test.ts.
import type { ChangeEvent } from 'react';
import { rkShort } from '../../../entities/person';
import { Alert, Button, DateField, Dialog, TimeField, Why, type ValueEvent } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { shortName, type Person } from '../../../../shared/domain';
import { weaponBack } from '../../../../shared/ranks';
import { namesOf } from '../model/text';
import { useBulkFix, type BulkFix, type BulkFixDialogProps } from '../model/useBulkFix';
import { Key } from './Key';

/** The new reason: one button per reason (with its key), «Άλλος λόγος», and what the entry reason will be. */
function bulkFixReasons(d: BulkFix) {
  const { lists, reasons, reason, setReason, rs, pick } = d;
  return (
    <div className="field">
      <span className="field__label">Νέος λόγος εξόδου</span>
      <div className="wpop__reasons" tabIndex={-1} data-autofocus="" style={{ outline: 'none' }}>
        {reasons.map((r, i) => (
          <button
            key={r}
            type="button"
            className="wpop__reason wpop__reason--pick"
            aria-pressed={rs === r}
            onClick={() => pick(r)}
          >
            <Key n={i} />
            {r}
          </button>
        ))}
      </div>
      <input
        className="ui-input"
        style={{ marginTop: '8px' }}
        placeholder="Άλλος λόγος (γράψε τον)…"
        aria-label="Άλλος λόγος"
        value={reasons.includes(rs) ? '' : reason}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
      />
      <span className="field__help">
        {rs ? (
          <>
            Όταν μπουν πάλι: <b>{weaponBack(rs, lists)}</b>
          </>
        ) : (
          'Άφησέ το κενό αν αλλάζεις μόνο την ώρα.'
        )}
      </span>
    </div>
  );
}

/** The list of moves that change, with what each becomes. */
function bulkFixList(d: BulkFix) {
  const { pm, ms, timeOn, day, t, rs } = d;
  return (
    <ul className="hist weapon-movelist">
      {ms.map((m) => (
        <li key={m.id}>
          <b>{pm.get(m.pid) ? rkShort(pm.get(m.pid)!) : '—'}</b>{' '}
          <span className="muted">
            {m.weapon} · {m.reason} {dm(m.outDay)} {m.outTime} →
          </span>{' '}
          {rs || m.reason}
          {timeOn && t ? ' ' + dm(day) + ' ' + t : ''}
        </li>
      ))}
    </ul>
  );
}

/** Ομαδική διόρθωση λόγου/ώρας εξόδου για τις τσεκαρισμένες κινήσεις (Michael, 24/10): ένας λόγος με ένα κλικ (ή πλήκτρο 1-9), μία εντολή, μία αναίρεση. */
export function BulkFixDialog(props: BulkFixDialogProps) {
  const { onClose } = props;
  const d = useBulkFix(props);
  const { pm, ms, timeOn, setTimeOn, day, setDay, time, setTime, late, miss, save } = d;
  return (
    <Dialog
      title={'Διόρθωση λόγου/ώρας (' + ms.length + ')'}
      description={namesOf(ms.map((m) => pm.get(m.pid)).filter(Boolean) as Person[])}
      onClose={onClose}
      footer={
        <>
          <Why text={miss} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!!miss} why={miss} onClick={save}>
            Διόρθωση ({ms.length})
          </Button>
        </>
      }
    >
      {bulkFixReasons(d)}
      <label className="ui-checkrow" style={{ margin: '4px 0 10px' }}>
        <input
          type="checkbox"
          className="ui-check"
          checked={timeOn}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTimeOn(e.target.checked)}
        />{' '}
        Άλλαξε και την ώρα εξόδου (ίδια για όλες)
      </label>
      {timeOn && (
        <div className="field-row">
          <div className="field">
            <label className="field__label" htmlFor="bf-d">
              Μέρα εξόδου
            </label>
            <DateField
              id="bf-d"
              className="ui-input"
              value={day}
              onChange={(e: ValueEvent) => e.target.value && setDay(e.target.value)}
            />
          </div>
          <TimeField id="bf-t" now={true} label="Ώρα εξόδου *" value={time} onChange={setTime} />
        </div>
      )}
      {ms.length > 1 && bulkFixList(d)}
      {late.length > 0 && (
        <Alert tone="bad">
          <span>
            Η είσοδος είναι πριν τη νέα έξοδο για{' '}
            {late.map((m) => (pm.get(m.pid) ? shortName(pm.get(m.pid)!) : '—')).join(', ')}.
          </span>
        </Alert>
      )}
    </Dialog>
  );
}
