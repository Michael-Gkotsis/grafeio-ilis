// The badges of the «Παρατήρηση» column of a row.
// Purpose: `weaponNoteBadges(...)`: the «αυτόματα» badge, the status of the day and the remarks of `weaponNotes`.
// Does NOT: decide the remarks (model/view.ts) and is a plain function, not a component (no extra render per row).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts `notes` (Phase 6).
// Covering test: test/screens-main.test.ts, test/weapons-page-view.test.ts.
import type { ReactElement } from 'react';
import { Badge } from '../../../shared/ui';
import type { Person, Settings, Status } from '../../../../shared/domain';
import type { WeaponInfo } from '../../../../shared/weapons';
import { weaponNotes } from '../model/view';

/**
 * The badges of one row: one per remark; with two or more, a single «⚠ n» with all of them in its tooltip (so they
 * do not get cut and fall on each other). The «αυτόματα» badge and the status of the day come first and are never
 * counted in «⚠ n».
 */
export function weaponNoteBadges(
  p: Person,
  info: WeaponInfo,
  lists: Settings['lists'],
  pm: Map<number, Person>,
  statuses: Status[],
  date: string,
): ReactElement[] {
  const { autoTip, hint, items, summary } = weaponNotes(p, info, lists, pm, statuses, date);
  const auto: ReactElement[] =
    autoTip === null
      ? []
      : [
          <Badge key="auto" tone="warn" data-tip={autoTip}>
            αυτόματα
          </Badge>,
        ];
  if (hint)
    auto.push(
      <Badge key="st" tone="info" data-tip={hint.tip + ' (η κατάσταση της μέρας: δεν αλλάζει το όπλο)'}>
        {hint.text}
      </Badge>,
    );
  if (!summary)
    return [
      ...auto,
      ...items.map((n) => (
        <Badge key={n.text} tone={n.tone} data-tip={n.tip}>
          {n.text}
        </Badge>
      )),
    ];
  return [
    ...auto,
    <Badge key="n" tone={summary.tone} data-tip={summary.tip}>
      ⚠ {items.length}
    </Badge>,
  ];
}
