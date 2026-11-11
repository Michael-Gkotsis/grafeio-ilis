// The «Διόρθωση επιστροφής» dialog of one person on leave or DN.
// Purpose: `BackFixDialog` fixes when one person comes back: «δεν γυρνά, συνεχίζει» or «γυρνά <μέρα> <ώρα>», with a
//   required reason. It goes to the history and can be undone.
// Does NOT: hold the state or write (model/useBackFix.ts).
// Owner layer: renderer/features/back-fix. Why: moved verbatim from screens/outsPlan.ts (Phase 5.3c part 2) so the
//   returns list widget can use it without importing a screen.
// Covering test: test/outs-*.test.ts, test/dialog-cases.test.ts.
import type { ChangeEvent } from 'react';
import { retTxt, type Back } from '../../../../shared/returns';
import { rkShort } from '../../../entities/person';
import { Button, DateField, Dialog, Segmented, TimeField, Why, type ValueEvent } from '../../../shared/ui';
import { useBackFix } from '../model/useBackFix';

/** Props of `BackFixDialog`. */
export interface BackFixDialogProps {
  b: Back;
  /** ISODate, the day of the list the person was picked from. */
  date: string;
  onClose: () => void;
}

// Διόρθωση επιστροφής ενός εξοδούχου/ΔΝ: «δεν γυρνά, συνεχίζει» ή «γυρνά <μέρα> <ώρα>», με υποχρεωτικό λόγο
export function BackFixDialog({ b, date, onClose }: BackFixDialogProps) {
  const { old, mode, setMode, day, setDay, time, setTime, why, setWhy, first, problem, save, del } = useBackFix(
    b,
    date,
    onClose,
  );
  return (
    <Dialog
      title={'Διόρθωση επιστροφής · ' + rkShort(b.p)}
      description={'Τώρα: ' + retTxt(b.r)}
      onClose={onClose}
      footer={
        <>
          <Why text={problem} />
          {old ? (
            <Button
              variant="ghost"
              onClick={del}
              data-tip="Σβήνει τη διόρθωση και η επιστροφή βγαίνει πάλι από τους κανόνες"
            >
              Πίσω στο αυτόματο
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!!problem} why={problem} onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      <p className="note" style={{ marginTop: 0 }}>
        Για ό,τι άλλαξε προφορικά και δεν βγαίνει από τις δηλώσεις. Μπαίνει στο Ιστορικό και αναιρείται.
      </p>
      <div className="field">
        <Segmented
          value={mode}
          onChange={setMode}
          items={[
            { value: 'at', label: 'Γυρνά…' },
            { value: 'stay', label: 'Δεν γυρνά, συνεχίζει' },
          ]}
        />
      </div>
      {mode === 'at' ? (
        <div className="field-row">
          <div className="field">
            <label className="field__label" htmlFor="bfd">
              Μέρα
            </label>
            <DateField
              id="bfd"
              className="ui-input"
              min={first}
              value={day}
              onChange={(e: ValueEvent) => setDay(e.target.value)}
            />
          </div>
          <TimeField id="bft" label="Ώρα" value={time} onChange={setTime} />
        </div>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="bfw">
          Λόγος (υποχρεωτικό)
        </label>
        <input
          id="bfw"
          className="ui-input"
          maxLength={120}
          placeholder="π.χ. εξετάσεις, το είπε ο λοχαγός"
          value={why}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setWhy(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
