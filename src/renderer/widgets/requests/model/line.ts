// The line a request is written as in the ΗΚΑΙ.
// Purpose: `hkaiWhoLine`, the preview under the text field of the request dialog.
// Does NOT: write the line into the ΗΚΑΙ (shared/hkaiText.ts `reqWhat` and the Excel writer do).
// Owner layer: renderer/widgets/requests. Why: moved verbatim from screens/other.ts (Phase 6.0).
// Covering test: test/screens-dialogs-forms.test.ts, test/requests.test.ts.
import type { LeaveAsk, Person } from '../../../../shared/domain';
import { reqWhat } from '../../../../shared/hkaiText';
import { hkWho } from '../../../../shared/punish';
import type { UserLists } from '../../../../shared/ranks';
import { upper } from '../../../../shared/text';
import { HK } from '../../../../shared/unit';

/** «Στην ΗΚΑΙ: «ΣΤΡ (ΠΖ) ΟΝΟΜΑ: ΑΙΤΕΙΤΑΙ ….»», in capitals. `date` is an ISODate. */
export const hkaiWhoLine = (
  p: Person,
  date: string,
  text: string,
  leave: LeaveAsk | undefined,
  lists: UserLists | undefined,
) =>
  'Στην ' +
  HK() +
  ': «' +
  upper(hkWho(p) + ': αιτείται ' + reqWhat({ id: '', pid: p.id, date, text, leave }, lists)) +
  '.»';
