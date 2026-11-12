// The form fields of one service: name, numbers, people per number, hours, armed, active and codes.
// Purpose: `BlockForm` draws the fields of `useBlockForm`; the same markup serves «Νέα υπηρεσία» and «Επεξεργασία».
// Does NOT: hold the state (`useBlockForm` does) or save (the dialogs do).
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from renderer/blockForm.ts (Phase 6, Ρυθμίσεις S3).
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import type { ChangeEvent } from 'react';
import { MAX_NUMS, MAX_PER } from '../../../../shared/domain';
import { HoursField, type HoursMode, type ShiftForm } from '../../../common';
import { Alert, GoLink, RangeField, Select, type ValueEvent } from '../../../shared/ui';
import type { BlockFormState } from '../model/useBlockForm';
import { GR, clampCount, shapeInfo } from '../model/view';

type Input = ChangeEvent<HTMLInputElement>;
/** What the `RangeField` combo hands to `onChange`: a text input event or a picked option. */
type Typed = { target: { value: string } };

const WEAPON_TIP =
  'Δικό του: κάθε άτομο βγάζει το δικό του όπλο στο νούμερό του. Της θέσης: βγαίνει το όπλο του 1ου νούμερου και ' +
  'περνά από χέρι σε χέρι στις αλλαγές· τα όπλα των άλλων μένουν ΕΝΤΟΣ.';

// Both links are functions (a fresh element per render, like the markup before) and come before the first help
// text on purpose: test/ux-names.test.ts reads the source text and wants a GoLink, never plain «Ρυθμίσεις › …».
const siLink = () => (
  <GoLink view="templates" params={{ tab: 'duty', dsub: 'si' }}>
    Ρυθμίσεις › Σ.Ι.
  </GoLink>
);
const blocksLink = () => (
  <GoLink view="templates" params={{ tab: 'duty', dsub: 'blocks' }}>
    Ρυθμίσεις › Υπηρεσίες
  </GoLink>
);

/** The code of each post, with the code errors of this service and the warnings about other ones. */
function codesField({ shown, f, set, errs, others }: BlockFormState) {
  return (
    <div className="field">
      <span className="field__label">Κωδικός στον έλεγχο υπηρεσιών</span>
      <div className="settings-grid">
        {shown.map((x) => (
          <label key={x.k} className="field">
            <span className="field__help">{x.label}</span>
            <input
              className="ui-input"
              maxLength={8}
              value={f.codes[x.k] ?? ''}
              placeholder="αυτόματα"
              onChange={(e: Input) => set({ codes: { ...f.codes, [x.k]: e.target.value } })}
            />
          </label>
        ))}
      </div>
      <span className="field__help">
        Αυτό γράφεται στο κελί της μέρας (π.χ. Θ1α) και έτσι διαβάζεται πίσω. Το σκέτο γράμμα (Θ, Μ, Σ) σημαίνει
        υπηρεσία χωρίς θέση. Νέες θέσεις παίρνουν μόνες τους κωδικό.
      </span>
      {errs.map((t) => (
        <Alert key={t} tone="bad">
          <span>{t}</span>
        </Alert>
      ))}
      {others.length > 0 && (
        <Alert tone="warn">
          <span>Σε άλλες υπηρεσίες (δεν εμποδίζει την αποθήκευση): {others.join(' · ')}</span>
        </Alert>
      )}
    </div>
  );
}

/** Name, «Νούμερα» and «Άτομα σε κάθε νούμερο». */
function nameRow({ f, set }: BlockFormState, id: string) {
  return (
    <div className="field-row" style={{ alignItems: 'flex-end' }}>
      <div className="field" style={{ flex: '2 1 220px' }}>
        <label className="field__label" htmlFor={id + '-n'}>
          Όνομα *
        </label>
        <input
          id={id + '-n'}
          className="ui-input"
          data-autofocus=""
          placeholder="π.χ. Πύλη, Σκοπιά ΤΑΕ"
          value={f.name}
          onChange={(e: Input) => set({ name: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={id + '-c'}>
          Νούμερα
        </label>
        <input
          id={id + '-c'}
          type="number"
          min="1"
          max={MAX_NUMS}
          className="ui-input"
          value={f.nums}
          onChange={(e: Input) => set({ nums: clampCount(+e.target.value, MAX_NUMS) })}
        />
        <span className="field__help">1–{MAX_NUMS}</span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={id + '-p'}>
          Άτομα σε κάθε νούμερο
        </label>
        <input
          id={id + '-p'}
          type="number"
          min="1"
          max={MAX_PER}
          className="ui-input"
          value={f.per}
          onChange={(e: Input) => set({ per: clampCount(+e.target.value, MAX_PER) })}
        />
        <span className="field__help">1 = ένας, 2 = ζεύγος… ως {MAX_PER}</span>
      </div>
    </div>
  );
}

/** «Θέσεις: 3 νούμερα × 2 άτομα = 6» with one chip per number. */
function shapePreview({ f, nums }: BlockFormState, info: ReturnType<typeof shapeInfo>) {
  return (
    <div className="bfshape" aria-live="polite">
      <b>
        Θέσεις: {f.nums} {f.nums === 1 ? 'νούμερο' : 'νούμερα'} × {f.per} {f.per === 1 ? 'άτομο' : 'άτομα'}
        {' = '}
        {info.total}
      </b>
      <div className="bfchips">
        {nums.map((x) => (
          <span key={x} className="bfchip">
            <b>{x}</b>
            {f.per > 1 ? ' ' + GR.slice(0, f.per).join(' · ') : ''}
          </span>
        ))}
      </div>
      {f.per > 1 && (
        <small>
          Τα άτομα του ίδιου νούμερου φυλάνε μαζί τις ίδιες ώρες (όπως οι σκοποί της ίδιας σκοπιάς). Ο καθένας μετρά μία
          υπηρεσία.
        </small>
      )}
      {info.dropsPosts ? (
        <small>Όσες θέσεις φύγουν κρατούν το ιστορικό τους και δεν μπαίνουν πια στις Θέσεις.</small>
      ) : null}
    </div>
  );
}

/** The hint about the template boxes of the ΦΡΟΥΡΑ (more numbers than boxes, or fewer). */
function boxHints({ f }: BlockFormState, info: ReturnType<typeof shapeInfo>) {
  const { boxes } = info;
  return (
    <>
      {boxes != null && f.nums > boxes && (
        <Alert tone="info">
          <span>
            Το έντυπο έχει κουτιά για <b>{boxes}</b> {boxes === 1 ? 'νούμερο' : 'νούμερα'}. Ο πίνακας «{info.tableName}»
            στο Excel μεγαλώνει προς τα κάτω: το <b>{boxes + 1}ο</b>
            {f.nums > boxes + 1 ? ' και τα επόμενα μπαίνουν' : ' μπαίνει'} στον ίδιο πίνακα, με την ίδια διάταξη και
            αρίθμηση.
          </span>
        </Alert>
      )}
      {info.underBoxes && (
        <Alert tone="info">
          <span>Με λιγότερα νούμερα τα τελευταία κουτιά του εντύπου μένουν κενά.</span>
        </Alert>
      )}
    </>
  );
}

/** The hours of an existing block, one range per number (a new block has one range for all). */
function fixedHours({ b, f, set, nums, labels }: BlockFormState, id: string) {
  if (!b) {
    return (
      <RangeField
        id={id + '-h'}
        aria-label="Ώρες"
        placeholder="π.χ. 08:00-20:00"
        value={f.hrs[0] || ''}
        onChange={(e: Typed) => set({ hrs: [e.target.value] })}
      />
    );
  }
  return (
    <div className="settings-grid">
      {nums.map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: key kept as it was; the number is its position
        <div key={i} className="field">
          <label className="field__help" htmlFor={id + '-h' + i}>
            {labels[i]}
          </label>
          <RangeField
            id={id + '-h' + i}
            placeholder="π.χ. 07:30-08:00"
            value={f.hrs[i] ?? f.hrs[0] ?? ''}
            onChange={(e: Typed) =>
              set({
                hrs: Array.from({ length: Math.max(f.hrs.length, i + 1) }, (_, j) =>
                  j === i ? e.target.value : (f.hrs[j] ?? f.hrs[0] ?? ''),
                ),
              })
            }
          />
        </div>
      ))}
    </div>
  );
}

/** «Ένοπλη» with the weapon choice, and «Ενεργή». */
function armedRows({ f, set }: BlockFormState, id: string) {
  return (
    <>
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={f.armed}
          onChange={(e: Input) => set({ armed: e.target.checked })}
        />
        <span>
          <b>Ένοπλη</b>
          <small>
            {
              'Δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ, ούτε οι άοπλοι (Σ.Ι.). Ποια Σ.Ι. μπαίνουν σε κάθε υπηρεσία το ρυθμίζεις στις '
            }
            {siLink()}
          </small>
        </span>
      </label>
      {f.armed && (
        <div className="field" style={{ marginLeft: '28px', maxWidth: '260px' }}>
          <label className="field__label" htmlFor={id + '-w'}>
            Όπλο
          </label>
          <Select
            id={id + '-w'}
            className="ui-input"
            value={f.weapon}
            data-tip={WEAPON_TIP}
            onChange={(e: ValueEvent) => set({ weapon: e.target.value as 'own' | 'post' })}
          >
            <option value="own">Δικό του</option>
            <option value="post">Της θέσης</option>
          </Select>
        </div>
      )}
      <label className="rule">
        <input
          type="checkbox"
          className="ui-check"
          checked={f.active}
          onChange={(e: Input) => set({ active: e.target.checked })}
        />
        <span>
          <b>Ενεργή</b>
          <small>
            {
              'Ανενεργή δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο, ώσπου να την ενεργοποιήσεις στις '
            }
            {blocksLink()}.
          </small>
        </span>
      </label>
    </>
  );
}

/** Props of `BlockForm`. */
export interface BlockFormProps {
  form: BlockFormState;
  /** Prefix of the field ids (`nb` for a new service, `eb` for an edit). */
  id: string;
}

/** The fields of one service. The Λ/Υ and Δ/Υ blocks (kind `ly`) only show their codes. */
export function BlockForm({ form, id }: BlockFormProps) {
  const { b, f, set, labels, rotB, start } = form;
  const codes = codesField(form);
  if (b?.kind === 'ly') return codes;
  const info = shapeInfo(b, f);
  return (
    <div>
      {nameRow(form, id)}
      {shapePreview(form, info)}
      {boxHints(form, info)}
      <HoursField
        id={id}
        mode={f.mode}
        setMode={(mode: HoursMode) => set({ mode })}
        sh={f.sh}
        setSh={(sh: ShiftForm) => set({ sh })}
        labels={labels}
        rot={rotB}
        start={start}
        fixed={fixedHours(form, id)}
      />
      {armedRows(form, id)}
      {b && codes}
    </div>
  );
}
