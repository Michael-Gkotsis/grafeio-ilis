// The left column of the «ΗΚΑΙ» page: the KPI strip, the one-line sum, the numbers card and the cards below it.
// Purpose: `hkaiSummary`, a plain function the screen calls (not a component: render counts stay as they were).
// Does NOT: hold state (the screen passes `useHkai()` in; the open rows live in HkaiNumbersCard) or the rules.
// Owner layer: renderer/pages/hkai. Why: moved from screens/other.ts (Phase 6); U13 put the counters in the shared
//   KpiStrip and the names into HkaiNumbersCard.
// Covering test: test/screens-main.test.ts.
import { HkHeadCard } from '../../../features/hk-rows';
import { RequestsLink } from '../../../widgets/requests';
import { KpiStrip } from '../../../shared/ui';
import { HK } from '../../../../shared/unit';
import type { useHkai } from '../model/useHkai';
import type { HkaiDay } from '../model/view';
import { CadreCard } from './CadreCard';
import { HkaiManualCard } from './HkaiManualCard';
import { HkaiMovesCard } from './HkaiMovesCard';
import { HkaiNumbersCard } from './HkaiNumbersCard';
import { HkaiSectionsCard } from './HkaiSectionsCard';

/** The four counters; `hkTime` is the rule time of the ΗΚΑΙ count, `HH:MM` (default `08:00`). */
function hkaiKpis(h: HkaiDay, hkTime: string | undefined) {
  return (
    <KpiStrip
      cells={[
        {
          key: 'total',
          label: 'Δύναμη',
          value: h.total,
          tip:
            'Η δύναμη της ' +
            HK() +
            ': στρατιώτες και στελέχη, με τον κανόνα των ' +
            (hkTime || '08:00') +
            '. Το Σήμερα και η Δύναμη μετρούν μόνο στρατιώτες, τώρα.',
        },
        { key: 'kol', label: 'Κωλυόμενοι', value: h.kol },
        { key: 'apo', label: 'Απόντες', value: h.apo },
        { key: 'avail', label: 'Διαθέσιμοι', value: h.avail, tone: 'ok' },
      ]}
    />
  );
}

/** The summary column (or the «Σύνοψη» tab on a phone); `s` is the result of `useHkai()`. */
export function hkaiSummary(s: ReturnType<typeof useHkai>) {
  const { state, date, h, cadre } = s;
  return (
    <div className="hkai__stack">
      <div>
        {hkaiKpis(h, state.rules?.hkTime)}
        <p className="hkai__formula">
          Δύναμη = <b>{h.soldiers}</b> στρατιώτες + <b>{h.cadreN}</b> στελέχη · μετρά με τις{' '}
          {state.rules?.hkTime || '08:00'} (όποιος γυρίσει ως τότε είναι παρών).
        </p>
      </div>
      <HkaiNumbersCard s={s} />
      <CadreCard warn={!cadre} />
      <HkHeadCard />
      <RequestsLink date={date} />
      <HkaiMovesCard date={date} />
      <HkaiManualCard date={date} />
      <HkaiSectionsCard />
    </div>
  );
}
