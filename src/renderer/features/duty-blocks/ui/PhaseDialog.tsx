// The dialog that adds a ΦΡΟΥΡΑ form (a copy of another) or renames the user's own.
// Purpose: `PhaseDialog` runs «addPhase» / «renamePhase» and reports the id of the new form.
// Does NOT: switch the phase (`PhaseSelect` does with the id it gets back) or edit the services of the form.
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from screens/guard.ts (Phase 6, Ρυθμίσεις S3).
// Covering test: test/status-fix.test.ts, test/ux-names.test.ts, test/screens-dialogs-forms.test.ts.
import { useState, type ChangeEvent } from 'react';
import { PHASE_NAME, phaseBase, phaseList, phaseName, type Phase, type Settings } from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { Button, Dialog, Select, Why, useDirty, useToast, type ValueEvent } from '../../../shared/ui';
import { addedPhaseId, phaseWhy } from '../model/view';

/** Props of `PhaseDialog`. */
export interface PhaseDialogProps {
  /** The form to copy (new form). Unknown or missing: ΣΒΕΝ. */
  from?: Phase;
  /** The id of the user's own form to rename; without it the dialog adds a form. */
  edit?: Phase;
  /** Closes the dialog; `id` is the form that was added (never for a rename or a cancel). */
  onClose: (id?: Phase) => void;
}

/** The name field: «ΦΡΟΥΡΑ» then the input. */
function nameField(name: string, setName: (v: string) => void) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="ph-n">
        Όνομα *
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="muted">ΦΡΟΥΡΑ</span>
        <input
          id="ph-n"
          className="ui-input"
          data-autofocus=""
          placeholder="π.χ. ΑΣΚΗΣΗ, ΣΠΕΝ 2"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
      </div>
      <span className="field__help">Με κεφαλαία, όπως στο Excel (π.χ. «ΦΡΟΥΡΑ ΑΣΚΗΣΗ 22-10-2026.xlsx»).</span>
    </div>
  );
}

/** «Αντίγραφο του»: the form a new one starts from (not shown for a rename). */
function copyField(settings: Settings, list: ReturnType<typeof phaseList>, src: Phase, setSrc: (v: Phase) => void) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="ph-f">
        Αντίγραφο του
      </label>
      <Select id="ph-f" className="ui-input" value={src} onChange={(e: ValueEvent) => setSrc(e.target.value)}>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {'ΦΡΟΥΡΑ ' + x.name}
          </option>
        ))}
      </Select>
      <span className="field__help">
        {'Βγαίνει στο Excel με το έντυπο της '}
        {PHASE_NAME[phaseBase(settings, src)]}: ίδια κελιά για τις υπηρεσίες του, και οι υπόλοιπες σε δικούς τους
        πίνακες από κάτω.
      </span>
    </div>
  );
}

/** «Νέο έντυπο υπηρεσιών» (a copy of another form), or the rename of the user's own (`edit` = its id). */
export function PhaseDialog({ from, edit, onClose }: PhaseDialogProps) {
  const { state, run } = useStore();
  const toast = useToast();
  const list = phaseList(state.settings);
  const mine = edit ? list.find((x) => x.id === edit) : undefined;
  const [name, setName] = useState(mine ? mine.name : '');
  const [src, setSrc] = useState<Phase>(from && list.some((x) => x.id === from) ? from : 'sven');
  const dirty = useDirty([name, src]);
  const save = async () => {
    const before = new Set((state.settings.phases || []).map((x) => x.id));
    const ns = await run(edit ? { t: 'renamePhase', id: edit, name } : { t: 'addPhase', name, from: src }, false);
    if (!ns) return;
    const nid = edit ? undefined : addedPhaseId(before, ns.settings);
    toast({
      text: edit
        ? 'Άλλαξε το όνομα'
        : 'Προστέθηκε η ΦΡΟΥΡΑ ' +
          phaseName(ns.settings, nid) +
          ': έχει τις υπηρεσίες της ' +
          phaseName(state.settings, src) +
          ', άλλαξέ τες στις Ρυθμίσεις › Υπηρεσίες',
    });
    onClose(nid);
  };
  const why = phaseWhy(name);
  return (
    <Dialog
      title={edit ? 'Όνομα: ΦΡΟΥΡΑ ' + mine!.name : 'Νέο έντυπο υπηρεσιών'}
      description={
        edit
          ? 'Γράφεται στο όνομα του Excel και στη λίστα.'
          : 'Ξεκινά με τις υπηρεσίες και τις θέσεις ενός άλλου εντύπου· μετά τις αλλάζεις χωριστά (Ρυθμίσεις › Υπηρεσίες). Οι κοινές θέσεις κρατούν το ιστορικό τους.'
      }
      onClose={() => onClose()}
      dirty={
        dirty &&
        (edit ? 'Το όνομα δεν άλλαξε. Αν κλείσεις, χάνεται.' : 'Το έντυπο δεν προστέθηκε. Αν κλείσεις, χάνεται.')
      }
      footer={
        <>
          <Why text={why} />
          <Button variant="outline" onClick={() => onClose()}>
            Άκυρο
          </Button>
          <Button disabled={!!why} why={why} onClick={save}>
            {edit ? 'Αποθήκευση' : 'Προσθήκη'}
          </Button>
        </>
      }
    >
      {nameField(name, setName)}
      {!edit && copyField(state.settings, list, src, setSrc)}
    </Dialog>
  );
}
