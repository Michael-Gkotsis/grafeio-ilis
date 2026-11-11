// «Έγκριση: …, άδεια …»: asks again before a leave request that needs attention is approved.
// Purpose: `ApproveDialog`, the same messages as the declaration (Λ1, Λ2) and «Έγκριση παρ' όλα αυτά» / «Άκυρο».
// Does NOT: approve anything by itself (`onGo` does) or compute the plan (shared/rules.ts `approvalPlan` does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-dialogs-forms.test.ts, test/requests.test.ts.
import { dm } from '../../../../shared/dates';
import type { PersonRequest } from '../../../../shared/domain';
import { statusLbl } from '../../../../shared/ranks';
import { personMap, type StatusPlan } from '../../../../shared/rules';
import { HK } from '../../../../shared/unit';
import { RkName, rkShort } from '../../../entities/person';
import { ChangePlanList } from '../../../entities/status';
import { useStore } from '../../../shared/model';
import { Alert, Button, Dialog } from '../../../shared/ui';

/** Props of `ApproveDialog`. */
export interface ApproveDialogProps {
  /** The leave request (`r.leave` is set). */
  r: PersonRequest;
  plan: StatusPlan;
  onClose: () => void;
  /** «Έγκριση παρ' όλα αυτά». */
  onGo: () => void;
}

export function ApproveDialog({ r, plan, onClose, onGo }: ApproveDialogProps) {
  const { state } = useStore();
  const pm = personMap(state.people);
  const lv = r.leave!;
  const files = plan.files.filter((f) => f.fn.startsWith('Υπηρεσίες'));
  return (
    <Dialog
      role="alertdialog"
      title={
        'Έγκριση: ' +
        rkShort(pm.get(r.pid)!) +
        ', άδεια ' +
        (lv.from === lv.to ? dm(lv.from) : dm(lv.from) + '–' + dm(lv.to))
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" data-autofocus="" onClick={onClose}>
            Άκυρο
          </Button>
          <Button onClick={onGo}>Έγκριση παρ' όλα αυτά</Button>
        </>
      }
    >
      {plan.overlaps.length > 0 && (
        <Alert tone="warn">
          <span>
            {plan.overlaps.map((o, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the overlaps have no id; the list never reorders
              <span key={i}>
                {i > 0 && <br />}
                <b>
                  <RkName p={pm.get(o.pid)!} />
                </b>{' '}
                έχει ήδη {statusLbl(o.status, state.settings.lists)} {dm(o.status.from)}–{dm(o.status.to)}. Αν εγκριθεί,
                θα έχει δύο άδειες μαζί· στην {HK()} θα μετρά μόνο η μία.
              </span>
            ))}
          </span>
        </Alert>
      )}
      {files.length > 0 && <ChangePlanList plan={{ files }} />}
      <span className="note">Με την έγκριση γίνεται άδεια· στην {HK()} μένει μόνο η αίτηση.</span>
    </Dialog>
  );
}
