// The «Ώρες» dialog of an existing leave, hospital or ΣΤΕΠ stay (times, and the direction of a leave).
// Purpose: `LeaveTimesDialog` fixes the times of a status that has none yet (e.g. it came from the Excel without times).
// Does NOT: end a leave (see LeaveEndDialog) or re-plan the duties itself (the `setTimes` command does).
// Owner layer: renderer/features/leave-end. Why: moved verbatim from screens/people.ts (Phase 5.3b); it is opened
// next to LeaveEndDialog from the person sheet and the leaves list.
// Covering test: test/screens-dialogs-forms.test.ts.
import { useState, type ChangeEvent } from 'react';
import { dm, dow } from '../../../../shared/dates';
import { TYPES, type Status, type TypeKey } from '../../../../shared/domain';
import { destNote } from '../../../../shared/hkaiText';
import { normTime, timeNames, timesTxt } from '../../../../shared/hours';
import { statusLbl } from '../../../../shared/ranks';
import { personMap } from '../../../../shared/rules';
import { rkFull, rkShort } from '../../../entities/person';
import { timesHelp } from '../../../shared/lib/timesHelp';
import { useStore } from '../../../shared/model';
import { Alert, Button, Dialog, TimeField, useToast } from '../../../shared/ui';

/** Props of `LeaveTimesDialog`. `st` is the stored status whose times are fixed. */
export interface LeaveTimesDialogProps {
  st: Status;
  onClose: () => void;
}

type TimesForm = { fromTime: string; toTime: string; dest: string };

/** The state and the save of the dialog; the hooks run in the same order as they did in the single component. */
function useLeaveTimes(st: Status, onClose: () => void) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const tn = timeNames(st.type),
    what = TYPES[st.type as TypeKey].cat === 'abs' ? 'άδειας' : TYPES[st.type as TypeKey].label;
  const [f, setF] = useState<TimesForm>({ fromTime: st.fromTime || '', toTime: st.toTime || '', dest: st.dest || '' });
  const abs = TYPES[st.type as TypeKey].cat === 'abs';
  const [err, setErr] = useState<string | null>(null);
  const edit = (x: Partial<TimesForm>) => {
    setF({ ...f, ...x });
    setErr(null);
  };
  const save = async () => {
    const a = normTime(f.fromTime),
      b = normTime(f.toTime);
    if (a == null || b == null) {
      setErr('Η ώρα ' + (a == null ? tn.fromG : tn.toG) + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.');
      return;
    }
    if (!(await run({ t: 'setTimes', id: st.id, fromTime: a, toTime: b, ...(abs ? { dest: f.dest } : {}) }, false)))
      return;
    onClose();
    toast({
      text:
        'Ώρες ' +
        what +
        ' ' +
        rkShort(p) +
        ': ' +
        (timesTxt({ type: st.type, fromTime: a, toTime: b, open: st.open }) || 'χωρίς ώρες') +
        (abs && f.dest.trim() ? ' · κατεύθυνση ' + f.dest.trim() : ''),
      actions: [undoMark()],
    });
  };
  return { state, p, tn, what, f, abs, err, edit, save };
}

/** The «Κατεύθυνση» field, only for a leave. */
function destField(st: Status, d: ReturnType<typeof useLeaveTimes>) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="lt-dest">
        Κατεύθυνση (προαιρετικό)
      </label>
      <input
        id="lt-dest"
        className="ui-input"
        placeholder="π.χ. Κόρινθος"
        value={d.f.dest}
        onChange={(e: ChangeEvent<HTMLInputElement>) => d.edit({ dest: e.target.value })}
      />
      <span className="field__help">{destNote(st, d.f.dest, d.state.settings.lists)}</span>
    </div>
  );
}

/** Ώρες μιας άδειας (νοσοκομείου, ΣΤΕΠ) που υπάρχει ήδη (π.χ. ήρθε από το Excel χωρίς ώρες). */
export function LeaveTimesDialog({ st, onClose }: LeaveTimesDialogProps) {
  const d = useLeaveTimes(st, onClose);
  const { state, p, tn, what, f, abs, err, edit, save } = d;
  return (
    <Dialog
      title={abs ? 'Ώρες και κατεύθυνση' : 'Ώρες ' + what}
      description={
        rkFull(p) +
        ' · ' +
        statusLbl(st, state.settings.lists) +
        ' ' +
        dm(st.from) +
        (st.to !== st.from ? '–' + dm(st.to) : '')
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={save}>Αποθήκευση</Button>
        </>
      }
    >
      <div className="field-row">
        <TimeField
          id="lt-out"
          label={'Ώρα ' + tn.fromG}
          value={f.fromTime}
          onChange={(v: string) => edit({ fromTime: v })}
          help={dow(st.from) + ' ' + dm(st.from)}
        />
        {!st.open && (
          <TimeField
            id="lt-in"
            label={'Ώρα ' + tn.toG}
            value={f.toTime}
            onChange={(v: string) => edit({ toTime: v })}
            help={dow(st.to) + ' ' + dm(st.to)}
          />
        )}
      </div>
      <span className="field__help">
        {timesHelp(state.rules, state.settings)} Υπηρεσίες που δεν γίνονται πια με τις νέες ώρες αδειάζουν.
      </span>
      {abs && destField(st, d)}
      {err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
    </Dialog>
  );
}
