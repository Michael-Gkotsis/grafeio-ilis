// The «Νέα ΕΣΣΟ» wizard: four steps that archive the current ΕΣΣΟ and start a new one without soldiers.
// Purpose: `NewEssoWizard` (Michael, 17/10), the dialog; the steps are in NewEssoSteps.tsx.
// Does NOT: hold state (model/useNewEsso.ts) or decide what the main process archives.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/esso.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-dialogs-shell.test.ts (snapshot esso-NewEssoWizard).
import type { EssoInfo } from '../../../../../shared/api';
import { Alert, Dialog } from '../../../../shared/ui';
import { ESSO_STEPS } from '../../model/essoView';
import { useNewEsso } from '../../model/useNewEsso';
import type { EssoStarted } from '../../model/useEsso';
import { stepFour, stepOne, stepThree, stepTwo, wizardFooter } from './NewEssoSteps';

export interface NewEssoWizardProps {
  /** What the main process knows about the archive folder and the connected Excel files. */
  info: EssoInfo;
  onClose: () => void;
  /** Called with the result once the new ΕΣΣΟ was started. */
  onDone: (r: EssoStarted) => void;
}

/** The numbered steps line under the title; the current step is bold. */
function stepsLine(step: number) {
  return (
    <>
      {ESSO_STEPS.map((l, i) => (
        <span key={l}>
          {i > 0 && ' › '}
          <span style={{ fontWeight: step === i + 1 ? 700 : 400 }}>
            {i + 1} {l}
          </span>
        </span>
      ))}
    </>
  );
}

/** The wizard dialog; it cannot be closed while the start is running. */
export function NewEssoWizard({ info, onClose, onDone }: NewEssoWizardProps) {
  const m = useNewEsso(info, onDone);
  const { step, busy, err } = m;
  return (
    <Dialog
      title="Νέα ΕΣΣΟ"
      description={stepsLine(step)}
      size="lg"
      onClose={busy ? () => {} : onClose}
      closeOnOverlay={false}
      footer={wizardFooter(m, onClose)}
    >
      {step === 1 && stepOne(m, info)}
      {step === 2 && stepTwo(m, info)}
      {step === 3 && stepThree(m, info)}
      {step === 4 && stepFour(m, info)}
      {err && (
        <Alert tone="bad">
          <span>{err}</span>
        </Alert>
      )}
    </Dialog>
  );
}
