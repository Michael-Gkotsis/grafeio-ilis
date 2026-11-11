// The «Στοιχεία στελέχους» / «Νέο στέλεχος» dialog.
// Purpose: `CadreDialog` edits or adds one cadre member (names, rank, origin, ΗΚΑΙ row, month limit, weapon, in strength).
// Does NOT: hold the state (model/useCadreForm.ts) or write the Excel (the `saveCadre` command does).
// Owner layer: renderer/features/cadre-edit. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts, test/dialog-cases.test.ts.
import type { ChangeEvent } from 'react';
import { HK, UNIT, hkRowLabel } from '../../../../shared/unit';
import { guessHk, hkCadreRows } from '../../../../shared/ranks';
import type { Cadre } from '../../../../shared/domain';
import { Button, ChoiceField, Dialog, Select, Why, type ValueEvent } from '../../../shared/ui';
import { type CadreFormModel, useCadreForm } from '../model/useCadreForm';

/** Props of `CadreDialog`. */
export interface CadreDialogProps {
  c: Partial<Cadre>;
  onClose: () => void;
}

/** The text fields of the form (the keys of the draft whose value is a string). */
type TextKey = 'last' | 'first' | 'am' | 'phone' | 'role' | 'weapon' | 'rack' | 'wpos';

/** One text field of the form (`fld` in `CadreDialog`). */
function textField({ f, setF }: CadreFormModel, k: TextKey, label: string, ph = '') {
  return (
    <div className="field">
      <label className="field__label" htmlFor={'cd-' + k}>
        {label}
      </label>
      <input
        id={'cd-' + k}
        className="ui-input"
        placeholder={ph}
        value={f[k]}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })}
      />
    </div>
  );
}

/** The row with rank, origin and Ο/Σ; rank and origin guess the ΗΚΑΙ row until it is touched. */
function rankRow(m: CadreFormModel) {
  const { f, setF, lists, ranks, origins, specs, hkTouched } = m;
  return (
    <div className="field-row">
      <ChoiceField
        id="cd-rank"
        label="Βαθμός"
        value={f.rank}
        options={ranks}
        placeholder="π.χ. ΛΧΙΑΣ"
        autoFocus
        onChange={(v: string) => setF({ ...f, rank: v, ...(!hkTouched ? { hk: guessHk(v, lists, f.origin) } : {}) })}
      />
      <ChoiceField
        id="cd-origin"
        label="Προέλευση"
        value={f.origin}
        options={origins}
        placeholder="π.χ. ΣΜΥ"
        otherLabel="+ Νέα προέλευση…"
        otherHelp="Μένει στη λίστα των προελεύσεων για την επόμενη φορά (Ρυθμίσεις › Λίστες)."
        onChange={(v: string) => setF({ ...f, origin: v, ...(!hkTouched ? { hk: guessHk(f.rank, lists, v) } : {}) })}
      />
      <ChoiceField
        id="cd-spec"
        label="Ο/Σ"
        value={f.spec}
        options={specs}
        placeholder="π.χ. ΤΘ"
        onChange={(v: string) => setF({ ...f, spec: v })}
      />
    </div>
  );
}

/** The row with the speciality (Ειδικότητα). */
function eidRow({ f, setF, eids }: CadreFormModel) {
  return (
    <div className="field-row">
      <ChoiceField
        id="cd-eid"
        label="Ειδικότητα"
        value={f.eid}
        options={eids}
        placeholder="π.χ. ΔΙΟΙΚΗΤΙΚΟΣ"
        otherLabel="+ Νέα ειδικότητα…"
        otherHelp="Γράφεται με κεφαλαία και μένει στη λίστα για την επόμενη φορά."
        onChange={(v: string) => setF({ ...f, eid: v })}
      />
    </div>
  );
}

/** The row with the role and the ΗΚΑΙ row. */
function roleRow(m: CadreFormModel) {
  const { f, setF, lists, setHkTouched } = m;
  const fld = (k: TextKey, label: string, ph = '') => textField(m, k, label, ph);
  return (
    <div className="field-row">
      {fld('role', 'Θέση', 'π.χ. Διοικητής ' + UNIT().gen)}
      <div className="field">
        <label className="field__label" htmlFor="cd-hk">
          Γραμμή στην {HK()}
        </label>
        <Select
          id="cd-hk"
          className="ui-input"
          value={f.hk}
          onChange={(e: ValueEvent) => {
            setHkTouched(true);
            setF({ ...f, hk: e.target.value });
          }}
        >
          {hkCadreRows(lists).map((r) => (
            <option key={r} value={r}>
              {hkRowLabel(r)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/** The month limit of a ΕΠΟΠ/ΟΒΑ cadre member. */
function monthMaxField({ f, setF }: CadreFormModel) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="cd-mm">
        Υπηρεσίες τον μήνα (το πολύ)
      </label>
      <input
        id="cd-mm"
        className="ui-input"
        type="number"
        min="1"
        max="31"
        style={{ maxWidth: '120px' }}
        placeholder="π.χ. 4"
        value={f.monthMax ?? ''}
        onChange={(e: ValueEvent) => setF({ ...f, monthMax: Math.max(0, Math.floor(+e.target.value)) || undefined })}
      />
      <span className="field__help">
        Με αριθμό μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι (ποτέ η αυτόματη συμπλήρωση). Πάνω από το όριο ζητά
        αιτία. Κενό = δεν κάνει υπηρεσίες.
      </span>
    </div>
  );
}

/** The optional weapon block. */
function weaponBlock(m: CadreFormModel) {
  const { f, setF, wtypes } = m;
  const fld = (k: TextKey, label: string, ph = '') => textField(m, k, label, ph);
  return (
    <div className="field">
      <span className="field__label">Όπλο (προαιρετικό)</span>
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="cd-wtype">
            Τύπος
          </label>
          <Select
            id="cd-wtype"
            className="ui-input"
            value={f.wtype}
            onChange={(e: ValueEvent) => setF({ ...f, wtype: e.target.value })}
          >
            <option value="">—</option>
            {wtypes.map((w: string) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </Select>
        </div>
        {fld('weapon', 'Αριθμός όπλου')}
        {fld('rack', 'Οπλοβ.', 'π.χ. Ε')}
        {fld('wpos', 'Θέση', 'π.χ. 23')}
      </div>
      <span className="field__help">
        Αν μπει σε ένοπλη υπηρεσία, το όπλο του βγαίνει ΕΚΤΟΣ στις ώρες του νούμερου (Οπλισμός › Κινήσεις). Χωρίς αριθμό
        φαίνεται «Ένοπλη χωρίς όπλο».
      </span>
    </div>
  );
}

/** The «Σε δύναμη» switch, only for an existing member. */
function activeSwitch({ f, setF }: CadreFormModel) {
  return (
    <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
      <input
        type="checkbox"
        className="ui-check"
        checked={f.active}
        onChange={() => setF({ ...f, active: !f.active })}
      />
      <span>
        Σε δύναμη{' '}
        <span className="field__help">
          (αν φύγει από τη μονάδα, βγάλ' το: μένει στη λίστα «Εκτός δύναμης» και δεν μετρά στην {HK()})
        </span>
      </span>
    </label>
  );
}

export function CadreDialog({ c, onClose }: CadreDialogProps) {
  const m = useCadreForm(c, onClose);
  const { f, dirty, duty, save } = m;
  const fld = (k: TextKey, label: string, ph = '') => textField(m, k, label, ph);
  return (
    <Dialog
      title={c.id ? 'Στοιχεία στελέχους' : 'Νέο στέλεχος'}
      onClose={onClose}
      dirty={dirty && 'Τα στοιχεία δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
      footer={
        <>
          <Why text={!f.last.trim() && 'Λείπει: Επώνυμο'} />
          <Button variant="outline" onClick={onClose}>
            Άκυρο
          </Button>
          <Button disabled={!f.last.trim()} why="Λείπει: Επώνυμο" onClick={save}>
            Αποθήκευση
          </Button>
        </>
      }
    >
      {rankRow(m)}
      <div className="field-row">
        {fld('last', 'Επώνυμο *')}
        {fld('first', 'Όνομα')}
      </div>
      <div className="field-row">
        {fld('am', 'ΑΜ', 'αριθμός μητρώου')}
        {fld('phone', 'Τηλέφωνο')}
      </div>
      {eidRow(m)}
      {roleRow(m)}
      {duty && monthMaxField(m)}
      {weaponBlock(m)}
      {c.id && activeSwitch(m)}
    </Dialog>
  );
}
