// «Νέα αίτηση» / «Αίτηση άδειας» / «Αλλαγή αίτησης»: from the ΗΚΑΙ or from a soldier's card (`req.pid`).
// Purpose: `RequestDialog`: who, which ΗΚΑΙ day, a leave (kind, dates, optional times and destination) and the text.
// Does NOT: answer the request (ui/RequestsCard.tsx does) or word the line (model/line.ts does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0); the soldier's card
//   opens it too.
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts, test/requests.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { dm, dow } from '../../../../shared/dates';
import { fullName, type PersonRequest } from '../../../../shared/domain';
import { destNote } from '../../../../shared/hkaiText';
import { HK } from '../../../../shared/unit';
import { PersonPicker, RkName } from '../../../entities/person';
import {
  Button,
  DateField,
  DateRangeField,
  Dialog,
  Segmented,
  Select,
  TimeField,
  Why,
  type ValueEvent,
} from '../../../shared/ui';
import { useRequestDialog, type RequestDialogModel } from '../model/useRequestDialog';
import { HON } from '../model/view';

/** Props of `RequestDialog`. */
export interface RequestDialogProps {
  /** A new request (`date`, maybe `pid`) or an existing one to change (`id`). */
  req: Partial<PersonRequest>;
  onClose: () => void;
}

/** «Τι αιτείται», «Ποιος» and the ΗΚΑΙ day. */
function whoFields(m: RequestDialogModel) {
  const { req, f, setF, p } = m;
  return (
    <>
      <div className="field">
        <span className="field__label">Τι αιτείται</span>
        <Segmented
          value={f.isLeave ? 'leave' : 'other'}
          onChange={(v: string) => setF({ ...f, isLeave: v === 'leave' })}
          items={[
            { value: 'leave', label: 'Άδεια' },
            { value: 'other', label: 'Κάτι άλλο' },
          ]}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="rq-p">
          Ποιος
        </label>
        {p ? (
          <div className="field-row">
            <b>
              <RkName p={p} fn={fullName} />
            </b>
            {!req.pid && (
              <Button size="sm" variant="ghost" onClick={() => setF({ ...f, pid: null })}>
                Άλλος
              </Button>
            )}
          </div>
        ) : (
          <PersonPicker id="rq-p" autoFocus={true} onChange={(pid: number) => setF({ ...f, pid })} />
        )}
      </div>
      <div className="field">
        <label className="field__label" htmlFor="rq-d">
          Ημερομηνία {HK()}
        </label>
        <DateField
          id="rq-d"
          className="ui-input"
          value={f.date}
          onChange={(e: ValueEvent) => e.target.value && setF({ ...f, date: e.target.value })}
        />
      </div>
    </>
  );
}

/** The leave part: kind, dates, optional times and destination (only for «Άδεια»). */
function leaveFields(m: RequestDialogModel) {
  const { state, kinds, f, setF } = m;
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="rq-k">
          Είδος άδειας
        </label>
        <Select
          id="rq-k"
          className="ui-input"
          value={f.kind}
          onChange={(e: ValueEvent) => setF({ ...f, kind: e.target.value })}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </div>
      <DateRangeField from={f.from} to={f.to} onChange={(from: string, to: string) => setF({ ...f, from, to })} />
      <div className="field">
        <div className="field-row">
          <TimeField
            id="rq-out"
            label="Ώρα αναχώρησης"
            value={f.fromTime}
            onChange={(v: string) => setF({ ...f, fromTime: v })}
            help={'Προαιρετικό · ' + dow(f.from) + ' ' + dm(f.from)}
          />
          <TimeField
            id="rq-in"
            label="Ώρα επιστροφής"
            value={f.toTime}
            onChange={(v: string) => setF({ ...f, toTime: v })}
            help={'Προαιρετικό · ' + dow(f.to) + ' ' + dm(f.to)}
          />
        </div>
        <span className="field__help">
          Αν μπουν, γράφονται στην αίτηση της {HK()} και περνούν στην άδεια με το «Εγκρίθηκε». Κενές = ολόκληρες μέρες.
        </span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="rq-dest">
          Κατεύθυνση (προαιρετικό)
        </label>
        <input
          id="rq-dest"
          className="ui-input"
          placeholder="π.χ. Κόρινθος"
          value={f.dest}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setF({ ...f, dest: e.target.value })}
        />
        <span className="field__help">
          {destNote(
            { type: f.kind === HON ? 'HON' : 'LEAVE', kind: f.kind === HON ? undefined : f.kind },
            f.dest,
            state.settings.lists,
          )}
        </span>
      </div>
    </>
  );
}

/** The text of the request, with the line it writes in the ΗΚΑΙ under it. */
function textField(m: RequestDialogModel) {
  const { f, setF, p, save, line } = m;
  return (
    <div className="field">
      <label className="field__label" htmlFor="rq-t">
        {f.isLeave ? 'Αιτιολόγηση (προαιρετικό)' : 'Αιτείται'}
      </label>
      <input
        id="rq-t"
        className="ui-input"
        placeholder={f.isLeave ? 'π.χ. για οικογενειακούς λόγους' : 'π.χ. μετάθεση στην 2η ΕΠΧΙΑ'}
        value={f.text}
        data-autofocus={p ? '' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setF({ ...f, text: e.target.value })}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        }}
      />
      <span className="field__help">
        {line ||
          (f.isLeave
            ? 'Γράφεται μία φορά, στις αιτήσεις. Όταν εγκριθεί, γίνεται άδεια χωρίς να ξαναγραφτεί στην ' + HK() + '.'
            : 'Γράψε μόνο το τι ζητά· το «αιτείται» και η τελεία μπαίνουν μόνα τους.')}
      </span>
    </div>
  );
}

export function RequestDialog({ req, onClose }: RequestDialogProps) {
  const m = useRequestDialog(req, onClose);
  const { f, dirty, ok, miss, save } = m;
  return (
    <Dialog
      title={req.id ? 'Αλλαγή αίτησης' : f.isLeave ? 'Αίτηση άδειας' : 'Νέα αίτηση'}
      description={'Γράφεται στην ' + HK() + ' της ημέρας, στο «5. ΑΙΤΗΣΕΙΣ».'}
      onClose={onClose}
      dirty={dirty && 'Η αίτηση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
      footer={
        <>
          <Why text={miss} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!ok} why={miss} onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      {whoFields(m)}
      {f.isLeave && leaveFields(m)}
      {textField(m)}
    </Dialog>
  );
}
