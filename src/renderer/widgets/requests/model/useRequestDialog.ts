// State of the request dialog.
// Purpose: `useRequestDialog`, the form, what is missing, the line it writes in the ΗΚΑΙ and the save command.
// Does NOT: draw anything (ui/RequestDialog.tsx does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts, test/requests.test.ts.
import { useState } from 'react';
import { reqText } from '../../../../shared/commands';
import { addDays, dm } from '../../../../shared/dates';
import type { PersonRequest } from '../../../../shared/domain';
import { hkaiWhoLine } from './line';
import { personMap } from '../../../../shared/rules';
import { listOf } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { HON, formCheck, leaveOf, type RequestForm } from './view';

/** All the state and derived data `RequestDialog` draws from. */
export type RequestDialogModel = ReturnType<typeof useRequestDialog>;

/**
 * @param req a new request (`date`, maybe `pid`) or an existing one to change (`id`)
 * @param onClose called after a successful save
 */
export function useRequestDialog(req: Partial<PersonRequest>, onClose: () => void) {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const kinds = [...listOf(state.settings.lists, 'leaveKinds'), HON];
  const lv0 = req.leave;
  const next = addDays(req.date || today, 1);
  const [f, setF] = useState<RequestForm>({
    pid: req.pid ?? null,
    date: req.date || today,
    text: req.text || '',
    isLeave: !!lv0,
    kind: lv0?.type === 'HON' ? HON : lv0?.kind || kinds[0],
    from: lv0?.from || next,
    to: lv0?.to || next,
    fromTime: lv0?.fromTime || '',
    toTime: lv0?.toTime || '',
    dest: lv0?.dest || '',
  });
  const [f0] = useState(() => JSON.stringify(f));
  const dirty = JSON.stringify(f) !== f0;
  const p = f.pid != null ? personMap(state.people).get(f.pid) : undefined;
  const text = reqText(f.text);
  const leave = leaveOf(f);
  const { ok, miss } = formCheck(f, p);
  const save = async () => {
    if (!ok) return;
    const body = { pid: p!.id, date: f.date, text, ...(leave ? { leave } : {}) };
    const cmd = req.id
      ? { t: 'updateRequest' as const, req: { id: req.id, ...body } }
      : { t: 'addRequest' as const, req: body };
    if (await run(cmd, false)) {
      onClose();
      toast({
        text: (req.id ? 'Άλλαξε η αίτηση: ' : 'Αίτηση για την ' + HK() + ' ' + dm(f.date) + ': ') + rkShort(p!),
        actions: [undoMark()],
      });
    }
  };
  const line = p && ok ? hkaiWhoLine(p, f.date, text, leave, state.settings.lists) : '';
  return { state, req, kinds, f, setF, dirty, p, ok, miss, save, line };
}
