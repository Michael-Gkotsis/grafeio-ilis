// State of the «Αιτήσεις» card.
// Purpose: `useRequestsCard`, all hooks of `RequestsCard` in the order the screen always called them, and the answers.
// Does NOT: draw anything (ui/RequestsCard.tsx does).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/requests.test.ts.
import { useMemo, useState } from 'react';
import { isWaiting, type PersonRequest } from '../../../../shared/domain';
import { approvalPlan, personMap, planNeedsOk, type StatusPlan } from '../../../../shared/rules';
import { rkShort } from '../../../entities/person';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { decisionToast, sortedRequests } from './view';

/** All the state and derived data `RequestsCard` draws from. */
export type RequestsCardModel = ReturnType<typeof useRequestsCard>;

/** @param date ISODate of the ΗΚΑΙ whose requests are listed. */
export function useRequestsCard(date: string) {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const [edit, setEdit] = useState<Partial<PersonRequest> | null>(null);
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const list = useMemo(
    () =>
      sortedRequests(
        state.requests.filter((r) => r.date === date),
        pm,
      ),
    [state.requests, pm, date],
  );
  // requests of other days that are not answered yet, and the old ones without an answer (old) below them
  const other = useMemo(
    () =>
      sortedRequests(
        state.requests.filter((r) => r.date !== date && !r.decision),
        pm,
      ),
    [state.requests, pm, date],
  );
  const waitN = other.filter(isWaiting).length;
  const [ask, setAsk] = useState<{ r: PersonRequest; plan: StatusPlan } | null>(null);
  const del = async (r: PersonRequest) => {
    if (await run({ t: 'deleteRequest', id: r.id }, false))
      toast({ text: 'Διαγράφηκε η αίτηση του ' + rkShort(pm.get(r.pid)!), actions: [undoMark()] });
  };
  const decide = async (r: PersonRequest, ok: boolean | null) => {
    if (!(await run({ t: 'decideRequest', id: r.id, ok }, false))) return;
    toast({ text: decisionToast(r, ok, pm.get(r.pid)!), actions: [undoMark()] });
  };
  // «Εγκρίθηκε» on a leave request (Λ1, Λ2): the same check as the declaration; an overlap with another leave, duties that
  // empty or days in the past ask first
  const approve = (r: PersonRequest) => {
    const plan = approvalPlan(state, r, today);
    if (plan && planNeedsOk(plan)) setAsk({ r, plan });
    else decide(r, true);
  };
  return { state, today, nav, edit, setEdit, pm, list, other, waitN, ask, setAsk, del, decide, approve };
}
