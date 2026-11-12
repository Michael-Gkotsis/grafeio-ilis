// The «Template: <αρχείο>» dialog: which sheet of a template each form is written into, and (ΗΚΑΙ) which cell is which.
// Purpose: `FormDialog`; the ΗΚΑΙ cell map is a plain function.
// Does NOT: save anything itself; `onSave` gets the binding built by model/formsView.ts.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-FormDialog*).
import { useState, type ChangeEvent } from 'react';
import type { FormInfo } from '../../../../../shared/api';
import { HK_COLS, HK_RANKS, type FormBinding, type FormKind, type HkaiMap } from '../../../../../shared/sources';
import { Alert, Button, Dialog, Select, type ValueEvent } from '../../../../shared/ui';
import { base } from '../../../../widgets/sources-alert';
import { formBindingOf } from '../../model/formsView';

export interface FormDialogProps {
  form: FormKind;
  /** What the main process found in the template file. */
  info: FormInfo;
  /** The binding stored now. */
  current: FormBinding;
  onClose: () => void;
  onSave: (b: FormBinding) => void;
}

type HkInfo = NonNullable<FormInfo['hkai']>;

/** The ΗΚΑΙ cell map: a row per rank, the title and date cells and a column per kind. */
function hkaiMapFields(hk: HkInfo, map: HkaiMap, setMap: (m: HkaiMap) => void) {
  return (
    <div>
      {hk.missing.length ? (
        <Alert tone="warn">
          <span>
            Βρέθηκαν {hk.found} από {hk.total}. Δεν βρέθηκαν: <b>{hk.missing.join(', ')}</b>. Γράψε τη γραμμή ή τη στήλη
            τους παρακάτω.
          </span>
        </Alert>
      ) : (
        <Alert tone="ok">
          <span>
            ✓ Βρέθηκαν όλες οι γραμμές και οι στήλες ({hk.found} από {hk.total}) από τα κείμενα του εντύπου.
          </span>
        </Alert>
      )}
      <div className="hkmap">
        <div>
          <h3>Γραμμή ανά βαθμό</h3>
          {HK_RANKS.map((r) => (
            <label key={r} className="hkmap__row">
              <span>{r}</span>
              <input
                className="ui-input"
                type="number"
                min="1"
                value={map.rows[r] || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setMap({ ...map, rows: { ...map.rows, [r]: +e.target.value || 0 } })
                }
              />
            </label>
          ))}
          <h3>Κελιά</h3>
          <label className="hkmap__row">
            <span>Τίτλος (ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ…)</span>
            <input
              className="ui-input"
              value={map.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setMap({ ...map, title: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
              }
            />
          </label>
          <label className="hkmap__row">
            <span>Τόπος και ημερομηνία</span>
            <input
              className="ui-input"
              value={map.date}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setMap({ ...map, date: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
              }
            />
          </label>
        </div>
        <div>
          <h3>Στήλη ανά είδος</h3>
          {HK_COLS.map(([k, label]) => (
            <label key={k} className="hkmap__row">
              <span>{label}</span>
              <input
                className="ui-input"
                value={map.cols[k] || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setMap({ ...map, cols: { ...map.cols, [k]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') } })
                }
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The dialog for the template of one form. */
export function FormDialog({ form, info: i, current, onClose, onSave }: FormDialogProps) {
  const [sheet, setSheet] = useState(i.sheet);
  const [sheet2, setSheet2] = useState(i.sheet2 || '');
  const [map, setMap] = useState<HkaiMap | null>(i.hkai ? i.hkai.map : null);
  const hk = i.hkai;
  const two = form === 'hkai' || form === 'outs';
  const save = () => onSave(formBindingOf(form, i, current, sheet, sheet2, map));
  return (
    <Dialog
      size={form === 'hkai' ? 'xl' : 'lg'}
      title={'Template: ' + base(i.file)}
      description={i.file}
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
        <div className="field">
          <label className="field__label" htmlFor="fd-s1">
            {form === 'hkai' ? 'Μπροστινή σελίδα' : form === 'outs' ? 'Φύλλο εξοδούχων' : 'Φύλλο του εντύπου'}
          </label>
          <Select id="fd-s1" className="ui-input" value={sheet} onChange={(e: ValueEvent) => setSheet(e.target.value)}>
            {i.sheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {two && (
          <div className="field">
            <label className="field__label" htmlFor="fd-s2">
              {form === 'hkai' ? 'Πίσω σελίδα' : 'Φύλλο παραμενόντων'}
            </label>
            <Select
              id="fd-s2"
              className="ui-input"
              value={sheet2}
              onChange={(e: ValueEvent) => setSheet2(e.target.value)}
            >
              {i.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      {form === 'froura' || form === 'frouraSpen' ? (
        <p className="note">
          Η εφαρμογή γράφει στα ίδια κελιά με το έντυπο της μονάδας (θέσεις, Λ/Υ, Δ/Υ, τιμωρημένοι, απόντες). Κράτα τη
          διάταξη ίδια· άλλαξε ελεύθερα κεφαλίδες, γραμματοσειρές και περιθώρια.
        </p>
      ) : null}
      {form === 'outs' ? (
        <p className="note">
          Η λίστα ξεκινά στη γραμμή 7 με στήλες Βαθμός, Ο-Σ, Επίθετο, Όνομα, Θάλαμος, Τηλέφωνο, Παρατηρήσεις (B έως H),
          όπως στο έντυπο της μονάδας.
        </p>
      ) : null}
      {form === 'hkai' && hk && map && hkaiMapFields(hk, map, setMap)}
    </Dialog>
  );
}
