// Step 3 of the declaration: from when to when, the times, the direction, and the penalty and ΣΤΕΠ fields.
// Purpose: `whenStep` returns the Dialog of step 3; the field groups are plain helper functions in this file, not components.
// Does NOT: hold state or logic; it reads the `Declare` bag from `useDeclare` and the shared pieces from `stepChrome`.
// Owner layer: renderer/features/declare-status. Why: step 3 was 230 lines of markup in one function
// Covering test: test/screens-dialogs-forms.test.ts, test/status-fix.test.ts.
import { dm, dow, daysBetween } from '../../../../shared/dates';
import { punLbl } from '../../../../shared/punish';
import { KOL_COLS, KOL_NO_COL } from '../../../../shared/domain';
import { canOpen } from '../../../../shared/rules';
import { timeNames } from '../../../../shared/hours';
import { destNote } from '../../../../shared/hkaiText';
import { HK } from '../../../../shared/unit';
import { Alert, Button, Combo, DateField, DateRangeField, Dialog, Select, TimeField } from '../../../shared/ui';
import { timesHelp } from '../../../shared/lib/timesHelp';
import type { ChangeEvent } from 'react';
import type { Declare } from '../model/useDeclare';
import type { StepChrome } from './chrome';

/** The date range, «Χωρίς λήξη», the times and the direction of a leave. */
function datesFields(d: Declare) {
  const { state, cmd, set, t, timed, open } = d;
  return (
    <>
      <DateRangeField
        from={cmd.from}
        to={cmd.to}
        open={open}
        onChange={(from: string, to: string) => set({ from, to })}
      />
      {canOpen(cmd.type) && (
        <label className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={open}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set({ open: e.target.checked })}
          />
          <span>
            <b>Χωρίς λήξη</b>
            <small>Ισχύει μέχρι να πατήσεις «Λήξη νωρίτερα…» στα Ιατρικά. Στο Excel το «έως» μένει κενό.</small>
          </span>
        </label>
      )}
      {timed && (
        <div className="field">
          <div className="field-row">
            <TimeField
              id="dpt-out"
              label={'Ώρα ' + timeNames(cmd.type).fromG}
              value={cmd.fromTime}
              onChange={(v: string) => set({ fromTime: v })}
              help={'Προαιρετικό · ' + dow(cmd.from) + ' ' + dm(cmd.from)}
            />
            {!open && (
              <TimeField
                id="dpt-in"
                label={'Ώρα ' + timeNames(cmd.type).toG}
                value={cmd.toTime}
                onChange={(v: string) => set({ toTime: v })}
                help={'Προαιρετικό · ' + dow(cmd.to) + ' ' + dm(cmd.to)}
              />
            )}
          </div>
          <span className="field__help">{timesHelp(state.rules, state.settings)}</span>
        </div>
      )}
      {t.cat === 'abs' && (
        <div className="field">
          <label className="field__label" htmlFor="dpdest">
            Κατεύθυνση (προαιρετικό)
          </label>
          <input
            id="dpdest"
            className="ui-input"
            placeholder="π.χ. Κόρινθος"
            value={cmd.dest}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set({ dest: e.target.value })}
          />
          <span className="field__help">
            {destNote({ type: cmd.type, kind: cmd.kind }, cmd.dest, state.settings.lists)}
          </span>
        </div>
      )}
    </>
  );
}

/** The penalty warnings and the fields of a penalty (who punished, when, why). */
function punFields(d: Declare) {
  const { cmd, set, isPun, max, dep, byList } = d;
  return (
    <>
      {isPun && max > 0 && (
        <Alert tone="warn">
          <span>
            {punLbl(cmd.kind)} πάνω από {max} ημέρες. Έλεγξε τη διάρκεια.
          </span>
        </Alert>
      )}
      {dep && (
        <span className="note">
          {daysBetween(cmd.from, cmd.to)} {daysBetween(cmd.from, cmd.to) === 1 ? 'ημέρα' : 'ημέρες'} στέρηση εξόδου. Οι
          μέρες με υπηρεσία ή βραδινή εκπαίδευση δεν μετράνε: η λήξη μετακινείται μόνη της.
        </span>
      )}
      {isPun && (
        <>
          <div className="field-row">
            <div className="field">
              <label className="field__label" htmlFor="dpby">
                Ποιος τιμώρησε
              </label>
              <Combo
                id="dpby"
                className="ui-input"
                options={byList}
                placeholder="π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ"
                value={cmd.by}
                onChange={(e: { target: { value: string } }) => set({ by: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="dpon">
                Ημερομηνία τιμωρίας
              </label>
              <DateField
                id="dpon"
                className="ui-input"
                value={cmd.on}
                onChange={(e: { target: { value: string } }) => e.target.value && set({ on: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="dprs">
              Λόγος (διότι…)
            </label>
            <textarea
              id="dprs"
              className="ui-input"
              rows={2}
              placeholder="π.χ. απουσίαζε από το προσκλητήριο"
              value={cmd.reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set({ reason: e.target.value })}
            />
            <span className="field__help">
              Βγαίνει έτοιμο κείμενο για το Word στα «Ιατρικά και ποινές». Τον τιμωρήσαντα γράψε τον σε αιτιατική («ΛΧΙΑ
              ΔΟΚΙΜΙΟ») και στην {HK()} μπαίνει «ΑΠΟ ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ»· για γυναίκα γράψε «την …» μπροστά.
            </span>
          </div>
        </>
      )}
    </>
  );
}

/** The fields of a ΣΤΕΠ / κωλυόμενος declaration. */
function kolFields(d: Declare) {
  const { cmd, set, isKol } = d;
  return (
    <>
      {isKol && (
        <>
          <div className="field">
            <label className="field__label" htmlFor="dsn">
              Τι υπηρεσία *
            </label>
            <input
              id="dsn"
              className="ui-input"
              data-autofocus
              placeholder="π.χ. Υπηρεσία ΣΤΕΠ"
              value={cmd.note}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set({ note: e.target.value })}
            />
            <span className="field__help">Φαίνεται στη Δύναμη, στο Σήμερα και στην καρτέλα του.</span>
          </div>
          <label className="rule">
            <input
              type="checkbox"
              className="ui-check"
              checked={cmd.minus}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set({ minus: e.target.checked })}
            />
            <span>
              <b>Αφαιρείται από τους παρόντες</b>
              <small>
                Μετρά στους κωλυόμενους της Δύναμης και, αν διαλέξεις στήλη, της {HK()}. Αλλιώς μένει παρών, φαίνεται
                όμως ποιος είναι κωλυόμενος και γιατί.
              </small>
            </span>
          </label>
          {cmd.minus && (
            <div className="field">
              <label className="field__label" htmlFor="dskc">
                Στήλη της {HK()} (προαιρετικό)
              </label>
              <Select
                id="dskc"
                className="ui-input"
                value={cmd.hkCol}
                onChange={(e: { target: { value: string } }) => set({ hkCol: e.target.value })}
              >
                <option value={KOL_NO_COL}>Καμία (δεν μπαίνει στην {HK()})</option>
                {KOL_COLS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <label className="rule">
            <input
              type="checkbox"
              className="ui-check"
              checked={cmd.noOut}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set({ noOut: e.target.checked })}
            />
            <span>
              <b>Χωρίς έξοδο</b>
              <small>Δεν βγαίνει έξοδο τις μέρες αυτές. Αλλιώς βγαίνει κανονικά.</small>
            </span>
          </label>
        </>
      )}
    </>
  );
}

/** Step 3: from when to when, times, direction, penalty and ΣΤΕΠ fields, and the remark. */
export function whenStep(d: Declare, chrome: StepChrome) {
  const { statusFirst, setStep, ack, cmd, err, setErr, set, isPun, isKol, onClose, next } = d;
  const { ttl, desc, dirty, sum, errNode } = chrome;
  return (
    <Dialog
      title={ttl}
      description={desc}
      dirty={dirty}
      onClose={onClose}
      closeOnOverlay={false}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              setErr(null);
              setStep(statusFirst ? 1 : 2);
            }}
          >
            Πίσω
          </Button>
          <Button onClick={next}>Συνέχεια: Τι θα αλλάξει</Button>
        </>
      }
    >
      {sum}
      {datesFields(d)}
      {punFields(d)}
      {kolFields(d)}
      {!isKol && (
        <div className="field">
          <label className="field__label" htmlFor="dsn">
            {isPun ? 'Παρατήρηση' : 'Παρατήρηση (λόγος)'}
          </label>
          <input
            id="dsn"
            className="ui-input"
            placeholder={isPun ? 'Προαιρετικό, π.χ. αριθμός διαταγής' : 'Προαιρετικό, π.χ. γιατί ή αριθμός διαταγής'}
            value={cmd.note}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set({ note: e.target.value })}
          />
        </div>
      )}
      {err && (
        <Alert tone={ack ? 'warn' : 'bad'}>
          <span>{errNode}</span>
        </Alert>
      )}
    </Dialog>
  );
}
