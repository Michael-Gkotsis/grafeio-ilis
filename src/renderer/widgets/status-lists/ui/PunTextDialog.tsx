// «Κείμενο ποινής»: the ready text of a penalty for the Word document, with «Αντιγραφή».
// Purpose: `PunTextDialog`, who punished / when / why fields and the text with the duration underlined.
// Does NOT: word the text (shared/punish.ts does) or list penalties (ui/RecordList.tsx does).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-dialogs-forms.test.ts, test/punish.test.ts.
import type { ChangeEvent } from 'react';
import { dm } from '../../../../shared/dates';
import type { Status } from '../../../../shared/domain';
import { punLbl } from '../../../../shared/punish';
import { rkFull } from '../../../entities/person';
import { Alert, Button, Combo, DateField, Dialog, type ValueEvent } from '../../../shared/ui';
import { copyRich, usePunText, type PunTextModel } from '../model/usePunText';

/** Props of `PunTextDialog`. */
export interface PunTextDialogProps {
  /** The penalty (type PUN) to write the text of. */
  st: Status;
  onClose: () => void;
}

/** «Κλείσιμο», «Αποθήκευση» (only when the fields changed) and «Αντιγραφή». */
function punFooter(m: PunTextModel, onClose: () => void) {
  const { dirty, save, toast, t } = m;
  return (
    <>
      <Button variant="outline" onClick={onClose}>
        Κλείσιμο
      </Button>
      {dirty && (
        <Button
          variant="outline"
          onClick={async () => {
            if (await save()) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ποινής' });
          }}
        >
          Αποθήκευση
        </Button>
      )}
      <Button
        onClick={async () => {
          if (!(await save())) return;
          toast({
            text: copyRich(t.html, t.plain)
              ? 'Αντιγράφηκε. Στο Word πάτα Ctrl+V.'
              : 'Δεν έγινε αντιγραφή. Επίλεξε το κείμενο και πάτα Ctrl+C.',
          });
        }}
      >
        Αντιγραφή
      </Button>
    </>
  );
}

export function PunTextDialog({ st, onClose }: PunTextDialogProps) {
  const m = usePunText(st);
  const { p, f, setF, byList, t, max, dirty } = m;
  return (
    <Dialog
      title="Κείμενο ποινής"
      description={rkFull(p) + ' · ' + punLbl(st.kind) + ' ' + dm(st.from) + '–' + dm(st.to)}
      onClose={onClose}
      dirty={dirty && 'Τα στοιχεία της ποινής (ποιος, πότε, λόγος) δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
      footer={punFooter(m, onClose)}
    >
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="pt-by">
            Ποιος τιμώρησε
          </label>
          <Combo
            id="pt-by"
            className="ui-input"
            options={byList}
            placeholder="σε αιτιατική, π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ"
            value={f.by}
            onChange={(e: ChangeEvent<HTMLInputElement> | ValueEvent) => setF({ ...f, by: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="pt-on">
            Ημερομηνία τιμωρίας
          </label>
          <DateField
            id="pt-on"
            className="ui-input"
            value={f.on}
            onChange={(e: ValueEvent) => e.target.value && setF({ ...f, on: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="pt-r">
          Λόγος (διότι…)
        </label>
        <textarea
          id="pt-r"
          className="ui-input"
          rows={2}
          value={f.reason}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setF({ ...f, reason: e.target.value })}
        />
      </div>
      {max > 0 && (
        <Alert tone="warn">
          <span>
            {punLbl(st.kind)} πάνω από {max} ημέρες. Έλεγξε τη διάρκεια.
          </span>
        </Alert>
      )}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen markup, the label names the preview */}
      <div className="puntext" aria-label="Προεπισκόπηση">
        {t.before}
        <u>{t.dur}</u>
        {t.after}
      </div>
    </Dialog>
  );
}
