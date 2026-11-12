// «Ρυθμίσεις › Υπογραφές» card: the signature list of each form, the header side and the places on the paper.
// Purpose: `SigsCard` (Michael, 20/10 and 22/10): any number of signatures per form, from left to right.
// Does NOT: hold state (model/useSigs.ts) or the rules and texts (model/sigsView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered. The toolbar is a plain function.
// Covering test: test/screens-settings-guide.test.ts, test/settings-sigs-view.test.ts.
import type { ChangeEvent } from 'react';
import { isOutsAll } from '../../../../../shared/domain';
import type { Layout } from '../../../../../shared/layout';
import { SIG_FORMS, sigDefaults, sigsClean, sigsCustom, sigsText, type SigForm } from '../../../../../shared/sigs';
import { LayoutDialog } from '../../../../features/layout-edit';
import { SigEditor } from '../../../../features/sigs-edit';
import { Button, Card, Select, type ValueEvent } from '../../../../shared/ui';
import { formOptionText, movedAny, sigLabelOf, sigsNoteTail } from '../../model/sigsView';
import { useSigs } from '../../model/useSigs';
import { OutsSig2 } from './OutsSig2';

type SigsModel = ReturnType<typeof useSigs>;

/** One text node: the start of the card's note. */
const SIGS_NOTE =
  'Με τη σειρά που φαίνονται στο χαρτί, από αριστερά προς τα δεξιά. Οι λέξεις της μονάδας αλλάζουν μόνες τους όταν ' +
  'αλλάζει ο τύπος της (π.χ. ΔΚΤΗΣ ΙΛΗΣ → ΔΚΤΗΣ ΛΟΧΟΥ). Το όνομα γράφεται λίγο πιο κάτω, για να χωρά η υπογραφή.';
/** The tooltip of the header-side checkbox. */
const HD_LEFT_TIP =
  'Σε όλα τα έντυπα και τα Excel, εκτός από την ΗΚΑΙ που έχει πάντα την κεφαλίδα αριστερά: ημερομηνία (τόπος) πάνω ' +
  'αριστερά και κεφαλίδα (μονάδα) πάνω δεξιά. Ξετσέκαρε για την παλιά διάταξη.';
/** The label after the checkbox, with the space before it, as one text node. */
const HD_LEFT_LABEL = ' Κεφαλίδα πάνω δεξιά, ημερομηνία πάνω αριστερά';

/** The header side checkbox: the date on the left and the unit on the right, or the old layout. */
function headerSide(m: SigsModel) {
  const { state, run } = m;
  return (
    <label className="ui-checkrow" style={{ marginTop: '10px' }} data-tip={HD_LEFT_TIP}>
      <input
        type="checkbox"
        className="ui-check"
        aria-label="Κεφαλίδα πάνω δεξιά, ημερομηνία πάνω αριστερά"
        checked={!state.settings.hdLeft}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          run(
            {
              t: 'setSettings',
              settings: { hdLeft: e.target.checked ? undefined : true },
              text:
                'κεφαλίδα και ημερομηνία: ' +
                (e.target.checked ? 'ημερομηνία αριστερά, κεφαλίδα δεξιά' : 'παλιά διάταξη'),
            },
            false,
          )
        }
      />
      {HD_LEFT_LABEL}
    </label>
  );
}

/** Save, cancel, back to the form's own signatures and the paper layout. */
function toolbar(m: SigsModel) {
  const { state, form, edit, setEdit, changed, save, reset, lf, setLay } = m;
  return (
    <div className="toolbar" style={{ marginTop: '12px' }}>
      <Button disabled={!changed} why="Δεν άλλαξε κάτι" onClick={save}>
        Αποθήκευση
      </Button>
      {changed && (
        <Button variant="ghost" onClick={() => setEdit({ ...edit, [form]: undefined })}>
          Άκυρο
        </Button>
      )}
      {(sigsCustom(state.settings, form) || changed) && (
        <Button
          variant="ghost"
          onClick={reset}
          data-tip={'Όπως το έντυπο: ' + sigsText(sigDefaults(state.settings, form))}
        >
          Όπως το έντυπο
        </Button>
      )}
      {lf ? (
        <Button
          variant="outline"
          style={{ marginLeft: 'auto' }}
          onClick={() => setLay(true)}
          data-tip="Σύρε κεφαλίδα, ημερομηνία, τίτλο και υπογραφές όπου θέλεις πάνω στο χαρτί"
        >
          Θέσεις στο χαρτί…{movedAny(state.settings, lf) ? ' •' : ''}
        </Button>
      ) : (
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '13px' }}>
          Θέσεις στο χαρτί: σε κάθε έντυπο, από το «Υπογραφές…»
        </span>
      )}
    </div>
  );
}

/** «Υπογραφές». */
export function SigsCard() {
  const m = useSigs();
  const { state, today, form, setForm, lay, setLay, lf, edit, list, changed, setList, saveLayout } = m;
  return (
    <Card
      title="Υπογραφές"
      actions={
        <Select
          className="ui-select"
          aria-label="Έντυπο"
          value={form}
          onChange={(e: ValueEvent) => setForm(e.target.value as SigForm)}
        >
          {SIG_FORMS.map((f) => (
            <option key={f} value={f}>
              {formOptionText(edit, state.settings, f)}
            </option>
          ))}
        </Select>
      }
    >
      <p className="note" style={{ marginTop: 0 }}>
        {SIGS_NOTE}
        {sigsNoteTail(form)}
      </p>
      <SigEditor value={list} onChange={setList} id={'sg-' + form} />
      {form === 'outs' && isOutsAll(state.settings) && <OutsSig2 />}
      {headerSide(m)}
      {toolbar(m)}
      {lay && lf && (
        <LayoutDialog
          title={sigLabelOf(form)}
          form={lf}
          sigs={sigsClean(list)}
          initial={state.settings.layout?.[lf]}
          onClose={() => setLay(false)}
          onSave={saveLayout}
          req={(l: Layout) => ({ form: lf, date: today, sigs: changed ? sigsClean(list) : undefined, layout: l })}
        />
      )}
    </Card>
  );
}
