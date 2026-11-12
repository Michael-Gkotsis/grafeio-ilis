// Screen «ΗΚΑΙ»: the day's ΗΚΑΙ form, a summary of where each number comes from, and the cards that fill the rest.
// Purpose: `HkaiScreen`, route `hkai`; wide screens show summary and sheets side by side, a phone has three tabs.
// Does NOT: hold state (model/useHkai.ts), build the sheets (shared/lib/sheets/hkai.ts) or write the Excel (main).
// Owner layer: renderer/pages/hkai. Why: moved from screens/other.ts (Phase 6); htm became TSX with the same markup,
//   text nodes, keys and hook order. The screen only shows the ΗΚΑΙ: Ποινές, Άδειες and Αιτήσεις went to
//   «Καταστάσεις» and the Ημερήσια Διαταγή has its own menu (U5); old links with `hkTab` pass through
//   app/normalizeRoute.ts.
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { ExportButton } from '../../../widgets/export';
import { requestLeave } from '../../../shared/lib/pending';
import { DateBar, PageHeader, Tabs } from '../../../shared/ui';
import { addDays, dmy } from '../../../../shared/dates';
import { HK } from '../../../../shared/unit';
import { useHkai } from '../model/useHkai';
import { hkaiSheets } from './HkaiSheets';
import { hkaiSummary } from './HkaiSummary';

/** The «ΗΚΑΙ» page. */
export function HkaiScreen() {
  return <HkaiMain />;
}

function HkaiMain() {
  const s = useHkai();
  const { nav, today, date, mobile, side, setSide } = s;
  const sum = hkaiSummary(s);
  const sheets = hkaiSheets(s);
  return (
    <div>
      <PageHeader title={HK() + ' της ' + dmy(date)} sub="Βγαίνει μόνη της· κάθε αριθμός ανοίγει τα ονόματα.">
        <DateBar
          value={date}
          onChange={(d: string) => requestLeave(() => nav.set({ hkaiDate: d }))}
          days={[addDays(today, -1), today, addDays(today, 1)]}
        />
        <div className="page-head__acts">
          <ExportButton kind="hkai" date={date} label={'η ' + HK()} />
        </div>
      </PageHeader>
      {mobile ? (
        <>
          <div style={{ marginBottom: '12px' }}>
            <Tabs
              value={side}
              onChange={setSide}
              items={[
                { value: 'sum', label: 'Σύνοψη' },
                { value: 'front', label: 'Μπροστά' },
                { value: 'back', label: 'Πίσω' },
              ]}
            />
          </div>
          {side === 'sum' ? sum : sheets}
        </>
      ) : (
        <div className="strength">
          {sum}
          {sheets}
        </div>
      )}
    </div>
  );
}
