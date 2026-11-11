// The status chips of one person (or cadre member) on one day.
// Purpose: `StatusBadge` («Παρών» or the first status with its end date, plus «+N» for the others) and `cadreBadge`
//   (the cadre member's status of the day), as shown in lists and in the person picker.
// Does NOT: decide statuses (src/shared/rules and src/shared/cadre do) or open any card.
// Owner layer: renderer/entities/person. Why: the person picker and the people lists show the same chips; they sit in
//   this slice and not in a `status` slice because FSD forbids one entity slice importing another, and the picker
//   needs them (see entities/status for the other status atoms).
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts (badges are part of the screen snapshots).
import { memo } from 'react';
import { cadreStatusOn } from '../../../../shared/cadre';
import { dm, today as todayFn, type ISODate } from '../../../../shared/dates';
import { TYPES, type Status } from '../../../../shared/domain';
import { statusesNow } from '../../../../shared/rules';
import { MED_LIKE, badgeLbl, badgeStatuses, statusLbl, type UserLists } from '../../../../shared/ranks';
import { useNowMin } from '../../../shared/lib/clock';
import { Badge } from '../../../shared/ui';

/** Props of `StatusBadge`. */
export interface StatusBadgeProps {
  statuses: Status[];
  pid: number;
  /** ISODate, local time: the day the chips describe. */
  date: ISODate;
  /** The user's own medical types (they show their own names). */
  lists?: UserLists;
}

/** Tooltip text for the «+N» chip: the other statuses, each with its end. */
const othersTip = (rest: Status[], lists?: UserLists) =>
  rest
    .map(
      (x) =>
        (MED_LIKE.includes(x.type) && statusLbl(x, lists) !== TYPES[x.type].label
          ? statusLbl(x, lists)
          : TYPES[x.type].long) + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to)),
    )
    .join(' · ');

/**
 * «Παρών», or the first status of the day with its end («έως 12/11», «χωρίς λήξη»), plus a «+N» chip with the rest.
 * For today, whoever has already returned counts as present (re-rendered by the minute clock).
 */
export const StatusBadge = memo(function StatusBadge({ statuses, pid, date, lists }: StatusBadgeProps) {
  const now = useNowMin();
  const ss = statusesNow(badgeStatuses(statuses, lists), pid, date, todayFn(), now);
  if (!ss.length) return <Badge tone="ok">Παρών</Badge>;
  const s = ss[0];
  const t = TYPES[s.type];
  const until = s.open ? ' χωρίς λήξη' : s.from === s.to ? (s.to === date ? '' : ' ' + dm(s.to)) : ' έως ' + dm(s.to);
  return (
    <span className="badges">
      <Badge tone={t.tone} data-tip={t.long}>
        {badgeLbl(s, lists) + until}
      </Badge>
      {ss.length > 1 && (
        <Badge tone="outline" data-tip={'Επίσης: ' + othersTip(ss.slice(1), lists)}>
          +{ss.length - 1}
        </Badge>
      )}
    </span>
  );
});

/** The state of a cadre member on a day, in the picker list (the same one the «Στελέχη» screen shows). */
export const cadreBadge = (s: Parameters<typeof cadreStatusOn>[0], cid: string, d: ISODate) => {
  const st = cadreStatusOn(s, cid, d);
  return st ? (
    <Badge tone={st.group === 'kol' ? 'info' : st.group === 'apo' ? 'warn' : 'outline'}>{st.label}</Badge>
  ) : (
    <Badge tone="ok">Παρών</Badge>
  );
};
