// «Ποιοι γυρίζουν και πότε»: the list of people who are away on a day, grouped by the day they come back.
// Purpose: `ReturnsList`, shared by «Σήμερα» (short, with a limit) and Εξοδούχοι (all, with «Διόρθωση…»).
// Does NOT: decide who is away or when they return (shared/returns.ts does) or fix a return (features/back-fix does).
// Owner layer: renderer/widgets/returns-list. Why: moved verbatim from screens/returnsList.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts (Σήμερα), test/outs-*.test.ts (Εξοδούχοι).
import { useMemo, useState } from 'react';
import { TYPES } from '../../../../shared/domain';
import { statusLbl } from '../../../../shared/ranks';
import { backsAt, retDay, retWhen, returnsOn, type Back } from '../../../../shared/returns';
import { outLbl } from '../../../../shared/weekend';
import { RkName } from '../../../entities/person';
import { BackFixDialog } from '../../../features/back-fix';
import { useNav, useStore, type Nav, type StoreValue } from '../../../shared/model';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button } from '../../../shared/ui';

/** Shown for people whose return is unknown because the next day is not declared yet (listed last, as a warning). */
const PENDING = 'Να δηλωθεί η επόμενη μέρα';

/** Props of `ReturnsList`. */
export interface ReturnsListProps {
  /** ISODate, the day asked about. */
  date: string;
  /** Show at most this many rows, then «Και άλλοι N στους Εξοδούχους». */
  limit?: number;
  /** Εξοδούχοι screen: a «Διόρθωση…» button per person on leave or DN. */
  fixable?: boolean;
  /** Minutes since midnight, local time («Σήμερα»): leaves out people who already came back by now. */
  at?: number;
}

/** One person of the list: name link, status, when they return, and «Διόρθωση…» when `fixable`. */
function returnItem(
  b: Back,
  state: StoreValue['state'],
  nav: Nav,
  fixable: boolean | undefined,
  setFix: (b: Back) => void,
) {
  return (
    <li key={b.p.id}>
      <button type="button" className="linkish" onClick={() => nav.openPerson(b.p.id)}>
        <RkName p={b.p} />
      </button>
      <span className={b.r.duty || b.r.pending ? 'txt-bad' : 'muted'}>
        <Badge tone={TYPES[b.st.type].tone} className="tag">
          {TYPES[b.st.type].cat === 'out' ? outLbl(b.st) : statusLbl(b.st, state.settings.lists)}
        </Badge>{' '}
        {retWhen(b.r)}
        {b.r.fix ? (
          <>
            {' '}
            <Badge tone="outline" data-tip="Διόρθωση του γραφείου">
              διόρθωση
            </Badge>
          </>
        ) : null}
        {fixable && TYPES[b.st.type].cat === 'out' ? (
          <Button size="sm" variant="ghost" onClick={() => setFix(b)} data-tip="Άλλαξε πότε γυρνά, με λόγο">
            Διόρθωση…
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Who is away on `date` and when they must come back, grouped by return day; people who return for duty come first.
 * @decision Michael 2/11: «Σήμερα» showed ΚΑ people whose leave had already ended, hence `at`.
 */
export function ReturnsList({ date, limit, fixable, at }: ReturnsListProps) {
  const { state } = useStore();
  const nav = useNav();
  const list = useMemo(() => backsAt(state, returnsOn(state, date), date, at), [state, date, at]);
  const [fix, setFix] = useState<Back | null>(null);
  if (!list.length) return <div className="empty">Κανείς δεν λείπει.</div>;
  const shown = limit ? list.slice(0, limit) : list;
  const grp = (b: Back) => (b.r.pending ? PENDING : retDay(b.r));
  const days = [...new Set(shown.map(grp))];
  return (
    <div className="backs">
      {days.map((d) => (
        <div key={d}>
          <div className={cx('backs__day', d === PENDING && 'txt-bad')}>{d}</div>
          <ul className="rows">
            {shown.filter((b) => grp(b) === d).map((b) => returnItem(b, state, nav, fixable, setFix))}
          </ul>
        </div>
      ))}
      {limit && list.length > limit && (
        <p className="note rows__more">Και άλλοι {list.length - limit} στους Εξοδούχους.</p>
      )}
      {fix && <BackFixDialog b={fix} date={date} onClose={() => setFix(null)} />}
    </div>
  );
}
