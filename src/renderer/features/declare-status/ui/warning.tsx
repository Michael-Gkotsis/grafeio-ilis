// The «Προσοχή» warning of the declaration, written out.
// Purpose: `declareWarning` turns the overlaps and the days without out that the plan found into the amber message.
// Does NOT: plan anything or decide whether to warn (`declareActions.next` does); a plain function, not a component.
// Owner layer: renderer/features/declare-status. Why: the model keeps the warning as data, so it has no markup.
// Covering test: test/status-fix.test.ts.
import type { ReactNode } from 'react';
import { dayName, dm } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import { statusLbl, type UserLists } from '../../../../shared/ranks';
import { RkName } from '../../../entities/person';
import type { DeclareError } from '../model/types';

/**
 * Overlapping statuses first, then the days the person does not go out, and the line that tells how to go on.
 * @param pm - people by id
 * @param lists - the user's lists (names of kinds)
 * @param today - ISODate, local app time
 */
export function declareWarning(
  w: Exclude<DeclareError, string>,
  pm: Map<number, Person>,
  lists: UserLists | undefined,
  today: string,
): ReactNode {
  const warn = [
    ...w.overlaps.map((o, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the warning rows have no id; position = identity, as before
      <span key={'o' + i}>
        <br />
        <b>
          <RkName p={pm.get(o.pid)!} />
        </b>{' '}
        έχει ήδη {statusLbl(o.status, lists)} {dm(o.status.from)}–{dm(o.status.to)}
      </span>
    )),
    ...w.blocked.map((b) => (
      <span key={'b' + b.pid}>
        <br />
        <b>
          <RkName p={pm.get(b.pid)!} />
        </b>{' '}
        δεν βγαίνει έξοδο ({dayName(b.date, today).toLowerCase()}): {b.reason}
      </span>
    )),
  ];
  return (
    <>
      <b>Προσοχή:</b>
      {warn}
      <br />
      Πάτα ξανά «Συνέχεια» για να το δηλώσεις παρ' όλα αυτά, ή άλλαξε άτομα και ημερομηνίες.
    </>
  );
}
