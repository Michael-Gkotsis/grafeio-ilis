// The dialogs of the «Υπηρεσίες» screen: Excel preview, «Κανόνες», permanent Λ/Υ-Δ/Υ, new service and «παρά τον κανόνα».
// Purpose: `previewDialog`, `forceDialog`, `sheet`, plain functions called as `{previewDialog(G)}`.
// Does NOT: hold state (model/useGuard.ts, model/useGuardState.ts) or place anybody (the commands are the old ones).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); same markup and commands.
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts.
import type { ChangeEvent } from 'react';
import { phaseName } from '../../../../shared/domain';
import { rkShort } from '../../../entities/person';
import { Button, Dialog, Why } from '../../../shared/ui';
import { ExcelSheet } from '../../../widgets/excel-preview';
import { PrintButton } from '../../../widgets/export';
import type { Guard } from '../model/useGuard';

/** The preview of the Excel: the sheet of the day with its file name. */
export function sheet(G: Guard) {
  const { state, phase, empty, fileName, model } = G;
  return (
    <ExcelSheet
      model={model}
      fileName={fileName}
      sheetName={'ΦΡΟΥΡΑ ' + phaseName(state.settings, phase)}
      meta={(empty.length ? '⚠ ' + empty.length + ' κενές' : '✓ Πλήρης') + ' · A4 οριζόντιο'}
    />
  );
}

/** «Προεπισκόπηση · …» dialog; nothing while it is closed. */
export function previewDialog(G: Guard) {
  const { date, fileName, preview, setPreview, xb, exportX } = G;
  if (!preview) return false;
  return (
    <Dialog
      size="xl"
      title={'Προεπισκόπηση · ' + fileName}
      description="Ό,τι βλέπεις εδώ βγαίνει ίδιο στο Excel."
      onClose={() => setPreview(false)}
      footer={
        <>
          <Button variant="outline" onClick={() => setPreview(false)}>
            Κλείσε
          </Button>
          <PrintButton kind="froura" date={date} label="η κατάσταση υπηρεσιών" variant="outline" />
          <Button disabled={!!xb} onClick={exportX}>
            {xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}
          </Button>
        </>
      }
    >
      {sheet(G)}
    </Dialog>
  );
}

// The buttons of the «παρά τον κανόνα» question: move or both seats, or place/swap.
function forceFooter(G: Guard) {
  const { force, setForce, g, assign, swap } = G;
  if (!force) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setForce(null)}>
        Άκυρο
      </Button>
      {force.move ? (
        <>
          <Button
            variant="outline"
            disabled={!force.reason.trim()}
            why="Γράψε πρώτα την αιτία"
            onClick={async () => {
              const f = force;
              setForce(null);
              await assign(f.k, f.p.id, g[f.k], f.reason.trim());
            }}
            data-tip="Μένει και στην άλλη θέση"
          >
            Και στις δύο
          </Button>
          <Button
            onClick={async () => {
              const f = force;
              setForce(null);
              await assign(f.k, f.p.id, g[f.k], f.reason.trim() || undefined, f.move);
            }}
          >
            Μετακίνησέ τον εδώ
          </Button>
        </>
      ) : (
        <>
          <Why text={!force.reason.trim() && 'Λείπει: Αιτία'} />
          <Button
            disabled={!force.reason.trim()}
            why="Λείπει: Αιτία"
            onClick={async () => {
              const f = force;
              setForce(null);
              if (f.swapWith) await swap(f.k, f.swapWith, f.reason.trim());
              else await assign(f.k, f.p.id, g[f.k], f.reason.trim());
            }}
          >
            {force.swapWith ? 'Ανταλλαγή' : "Βάλ' τον"}
          </Button>
        </>
      )}
    </>
  );
}

/** «Βάλε τον … παρά τον κανόνα;» dialog; nothing while there is no question. */
export function forceDialog(G: Guard) {
  const { force, setForce } = G;
  if (!force) return false;
  return (
    <Dialog
      title={
        force.swapWith
          ? 'Ανταλλαγή παρά τον κανόνα;'
          : force.move
            ? rkShort(force.p) + ' είναι ήδη σε άλλη θέση'
            : 'Βάλε τον ' + rkShort(force.p) + ' παρά τον κανόνα;'
      }
      description={force.why}
      onClose={() => setForce(null)}
      footer={forceFooter(G)}
    >
      <p style={{ marginTop: 0 }}>
        {force.move
          ? "Μετακίνησέ τον εδώ (η άλλη θέση μένει κενή) ή βάλ' τον και στις δύο, με αιτία."
          : 'Ο κανόνας λέει όχι. Αν χρειάζεται (π.χ. ΣΚ, άλλος αρρώστησε), γράψε γιατί. Γράφεται στο Ιστορικό και η θέση φαίνεται με ⚠.'}
      </p>
      <div className="field">
        <label className="field__label" htmlFor="frc">
          {force.move ? 'Αιτία (μόνο για «Και στις δύο» ή αν ο κανόνας λέει όχι)' : 'Αιτία *'}
        </label>
        <input
          id="frc"
          className="ui-input"
          data-autofocus=""
          placeholder="π.χ. αλλαγή με συνάδελφο, εντολή λοχία"
          value={force.reason}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setForce({ ...force, reason: e.target.value })}
        />
      </div>
    </Dialog>
  );
}
