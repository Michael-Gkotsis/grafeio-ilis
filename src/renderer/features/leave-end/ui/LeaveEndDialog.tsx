// The «Διακοπή άδειας» / «Έξοδος νωρίτερα» dialog: a leave that ends early, or a cancelled one.
// Purpose: `LeaveEndDialog`: before the leave starts, «Ακύρωση» (it goes whole); after it started, «Γύρισε» on the day
//   and time you give (hospital and ΣΤΕΠ: «Βγήκε»), with what that time means for duties, outs and the ΗΚΑΙ.
// Does NOT: decide the rules of the day (`dayTimes`, `endLeave` and `cancelLeave` do) or where it is opened from.
// Owner layer: renderer/features/leave-end. Why: the people card, the medical list and the leaves list share it.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { useState } from 'react';
import { dayName, dm, nowHM } from '../../../../shared/dates';
import { normTime } from '../../../../shared/hours';
import { DEFAULT_HK_TIME, personMap } from '../../../../shared/rules';
import { dayTimes } from '../../../../shared/returns';
import type { Status } from '../../../../shared/domain';
import { HK } from '../../../../shared/unit';
import { rkFull, rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { Alert, Button, DateField, Dialog, TimeField, useToast } from '../../../shared/ui';
import { leaveDescription, leaveKind, firstReturnDay, returnEffect, type LeaveKind } from '../model/view';
import { leaveStarted } from '../model/leaveStarted';

/** Props of `LeaveEndDialog`. */
export interface LeaveEndDialogProps {
  /** The leave, hospital or ΣΤΕΠ status to end or cancel. */
  st: Status;
  onClose: () => void;
}

/** What the two steps need from the dialog. */
interface StepProps {
  st: Status;
  /** ISODate, local app time. */
  today: string;
  desc: string;
  kind: LeaveKind;
  onClose: () => void;
}

/** The «are you sure» step: cancelling the leave whole (it never started, or it was entered by mistake). */
function cancelStep(a: StepProps & { started: boolean; onBack: () => void; onCancel: () => void }) {
  const { st, today, desc, onClose, started, onBack, onCancel } = a;
  const { abs, W } = a.kind;
  return (
    <Dialog
      role="alertdialog"
      title={W.cancel}
      description={desc}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={started ? onBack : onClose}>
            {started ? 'Πίσω' : 'Όχι'}
          </Button>
          <Button variant="destructive" onClick={onCancel}>
            {abs ? 'Ναι, ακύρωσέ την' : 'Ναι, διάγραψέ την'}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        {started ? (
          <>
            Έχει ήδη ξεκινήσει. {abs ? 'Ακύρωση' : 'Διαγραφή'} μόνο αν <b>μπήκε κατά λάθος</b>· αν{' '}
            {abs ? 'γύρισε' : 'βγήκε'} νωρίτερα, πάτα «Πίσω» και «{W.go}».
          </>
        ) : (
          <>
            Ξεκινά{' '}
            <b>
              {dayName(st.from, today).toLowerCase()} {dm(st.from)}
            </b>
            .
          </>
        )}{' '}
        Φεύγει από παντού ({abs ? 'Άδειες' : 'Ιατρικά'}, {HK()}, Δύναμη, Excel) και μετρά διαθέσιμος για υπηρεσίες και
        έξοδο.{st.req ? ' Η αίτηση μένει εγκεκριμένη.' : ''}
      </p>
    </Dialog>
  );
}

/** The main step: the day and time he came back (or came out), and what that means. */
function endStep(a: StepProps & EndFields & { onCancelAsk: () => void; onEnd: () => void }) {
  const { st, today, desc, onClose, day, setDay, time, setTime, err, setErr, effect, onCancelAsk, onEnd } = a;
  const { abs, tn, W } = a.kind;
  return (
    <Dialog
      title={W.title}
      description={desc}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onCancelAsk} data-tip="Μόνο αν μπήκε κατά λάθος: φεύγει ολόκληρη">
            {W.cancel}…
          </Button>
          <span style={{ flex: 1 }}></span>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={onEnd}>{W.go}</Button>
        </>
      }
    >
      <p style={{ margin: '0 0 10px' }}>
        {W.intro} τη μέρα και ώρα που λες και από εκεί και πέρα μετρά κανονικά σε υπηρεσίες, εξόδους, {HK()}, Δύναμη,
        Δυναμολόγιο και Excel.
      </p>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="le-d">
            Μέρα {tn.toG}
          </label>
          <DateField
            id="le-d"
            className="ui-input"
            min={st.from}
            max={st.open ? undefined : st.to}
            value={day}
            onChange={(e: { target: { value: string } }) => {
              if (e.target.value) {
                setDay(e.target.value);
                setErr(null);
              }
            }}
          />
          <span className="field__help">{dayName(day, today)}</span>
        </div>
        <TimeField
          id="le-t"
          label={'Ώρα ' + tn.toG}
          value={time}
          onChange={(v: string) => {
            setTime(v);
            setErr(null);
          }}
          help={'Η τωρινή· άλλαξέ την αν ' + (abs ? 'γύρισε' : 'βγήκε') + ' άλλη ώρα'}
        />
      </div>
      <span className="field__help">{effect}</span>
      {err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
    </Dialog>
  );
}

/** The state of the main step, passed down by the dialog. */
interface EndFields {
  day: string;
  setDay: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  err: string | null;
  setErr: (e: string | null) => void;
  /** What the chosen time means on the day he comes back. */
  effect: string;
}

/**
 * Before the leave starts: cancel (it goes whole). After it started: stop it, he came back on the day and time you give
 * (now); the cancel stays for a wrong entry. The same for hospital and ΣΤΕΠ: he came out earlier, on the day and time
 * he went out.
 * @decision Michael, 20/10: «να γυρνάει την ώρα που έβαλες».
 * @see test/status-fix.test.ts
 */
export function LeaveEndDialog({ st, onClose }: LeaveEndDialogProps) {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const started = leaveStarted(st, today);
  const [cancel, setCancel] = useState(!started);
  const [day, setDay] = useState(firstReturnDay(st, today));
  const [time, setTime] = useState(nowHM());
  const [err, setErr] = useState<string | null>(null);
  const kind = leaveKind(st);
  const { abs, tn, what } = kind;
  const desc = leaveDescription(rkFull(p), st, state.settings.lists);
  const t = normTime(time);
  const effect = returnEffect(t ?? '', state.rules?.hkTime || DEFAULT_HK_TIME, dayTimes(state, day).out);
  const doCancel = async () => {
    if (!(await run({ t: 'cancelLeave', id: st.id }, false))) return;
    onClose();
    toast({ text: (abs ? 'Ακυρώθηκε η ' : 'Διαγράφηκε η ') + what + ' του ' + rkShort(p), actions: [undoMark()] });
  };
  const doEnd = async () => {
    if (t == null) {
      setErr('Η ώρα δεν διαβάζεται. Γράψε π.χ. 22:00 ή άφησέ την κενή.');
      return;
    }
    if (!(await run({ t: 'endLeave', id: st.id, date: day, time: t }, false))) return;
    onClose();
    toast({
      text: rkShort(p) + ': ' + (abs ? 'γύρισε από ' + what : what + ', ' + tn.to) + ' ' + dm(day) + (t ? ' ' + t : ''),
      actions: [undoMark()],
    });
  };
  const step = { st, today, desc, kind, onClose };
  if (cancel) return cancelStep({ ...step, started, onBack: () => setCancel(false), onCancel: doCancel });
  return endStep({
    ...step,
    day,
    setDay,
    time,
    setTime,
    err,
    setErr,
    effect,
    onCancelAsk: () => setCancel(true),
    onEnd: doEnd,
  });
}
