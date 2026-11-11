// The «Υπογραφές…» button of a form, with its two dialogs.
// Purpose: `SigsMenu` opens the signatures dialog (this time only, or for good) and, from it, «Θέσεις στο χαρτί…».
// Does NOT: make the file: it calls `go(print, sigs)` and the caller exports.
// Owner layer: renderer/widgets/export. Why: moved verbatim from renderer/common.ts (Phase 5.3b); it composes the
// sigs-edit and layout-edit features, which is why it is a widget and not a feature.
// Covering test: test/sigs.test.ts, test/sigs-all-forms.test.ts.
import { useState } from 'react';
import type { ISODate } from '../../../../shared/dates';
import { dropSigMoves, type Layout, type LayoutForm } from '../../../../shared/layout';
import { sigsSaved, sigsText, type Sig } from '../../../../shared/sigs';
import { LayoutDialog } from '../../../features/layout-edit';
import { SigsDialog } from '../../../features/sigs-edit';
import { useStore } from '../../../shared/model';
import { Button } from '../../../shared/ui';

/** Props of `SigsMenu`. `go(print, sigs)`: `sigs` is set only when the change is for this time. */
export interface SigsMenuProps {
  form: LayoutForm;
  date: ISODate;
  label: string;
  go: (print: boolean, sigs?: Sig[]) => unknown;
  print?: boolean;
  variant?: string;
  size?: string;
  disabled?: boolean;
}

/**
 * Το ίδιο σε κάθε έντυπο (Michael, 22/10): βάζεις, βγάζεις ή αλλάζεις σειρά στις υπογραφές, και «Θέσεις στο χαρτί…» για να
 * σύρεις κεφαλίδα, ημερομηνία, τίτλο και υπογραφές. go(εκτύπωση, υπογραφές μόνο για αυτή τη φορά)· print: έχει και εκτύπωση.
 */
export function SigsMenu({ form, date, label, go, print = true, variant = 'ghost', size, disabled }: SigsMenuProps) {
  const { state, run } = useStore();
  const [open, setOpen] = useState(false);
  const [lay, setLay] = useState<Sig[] | null>(null); // «Θέσεις στο χαρτί…» με τις υπογραφές που βλέπεις στον διάλογο
  const cur = sigsSaved(state.settings, form);
  const name = label.replace(/^(η|οι|το) /, '');
  const onGo = async (sigs: Sig[], keep: boolean, pr: boolean) => {
    // άλλο πλήθος υπογραφών: οι θέσεις που είχες σύρει για τις υπογραφές δεν ταιριάζουν πια
    const l =
      sigs.length !== cur.length && state.settings.layout?.[form]
        ? { layout: { ...state.settings.layout, [form]: dropSigMoves(state.settings.layout[form]) } }
        : {};
    if (
      keep &&
      !(await run(
        {
          t: 'setSettings',
          settings: { sigs: { ...(state.settings.sigs || {}), [form]: sigs }, ...l },
          text: 'υπογραφές ' + name + ': ' + sigsText(sigs),
        },
        false,
      ))
    )
      return;
    go(pr, keep ? undefined : sigs);
  };
  const saveLayout = async (l: Layout | undefined) => {
    const all = { ...(state.settings.layout || {}) };
    if (l) all[form] = l;
    else delete all[form];
    await run(
      { t: 'setSettings', settings: { layout: all }, text: 'θέσεις στο χαρτί: ' + name },
      'Αποθηκεύτηκαν οι θέσεις: ' + name,
    );
  };
  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-tip={
          'Υπογραφές: ' +
          sigsText(cur) +
          '. Βάλε, βγάλε ή άλλαξε σειρά, για αυτή τη φορά ή για πάντα, ή σύρε κεφαλίδα και υπογραφές αλλού πάνω στο χαρτί.'
        }
      >
        Υπογραφές…
      </Button>
      {open && (
        <SigsDialog
          title={name}
          initial={cur}
          print={print}
          keepText="Να μείνουν έτσι και για τις επόμενες φορές (Ρυθμίσεις › Υπογραφές)"
          onGo={onGo}
          onClose={() => setOpen(false)}
          onLayout={setLay}
        />
      )}
      {lay && (
        <LayoutDialog
          title={name}
          form={form}
          sigs={lay}
          initial={state.settings.layout?.[form]}
          onClose={() => setLay(null)}
          onSave={saveLayout}
          req={(l: Layout) => ({ form, date, sigs: lay, layout: l })}
        />
      )}
    </>
  );
}
