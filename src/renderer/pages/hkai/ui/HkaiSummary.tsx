// The «Από πού βγαίνει κάθε αριθμός» part of the «ΗΚΑΙ» page: counters, names per column and the cards below them.
// Purpose: `hkaiSummary`, a plain function the screen calls (not a component: render counts stay as they were).
// Does NOT: hold state (the screen passes `useHkai()` in) or the rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { HkHeadCard } from '../../../features/hk-rows';
import { RequestsLink } from '../../../widgets/requests';
import { Card } from '../../../shared/ui';
import { shortName } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import type { useHkai } from '../model/useHkai';
import type { HkaiDay } from '../model/view';
import { CadreCard } from './CadreCard';
import { HkaiManualCard } from './HkaiManualCard';
import { HkaiMovesCard } from './HkaiMovesCard';
import { HkaiSectionsCard } from './HkaiSectionsCard';

/** The four counters; `hkTime` is the rule time of the ΗΚΑΙ count, `HH:MM` (default `08:00`). */
function hkaiTiles(h: HkaiDay, hkTime: string | undefined) {
  return (
    <div className="tiles" style={{ marginBottom: '12px' }}>
      <div
        className="tile tile--main"
        data-tip={
          'Η δύναμη της ' +
          HK() +
          ': στρατιώτες και στελέχη, με τον κανόνα των ' +
          (hkTime || '08:00') +
          '. Το Σήμερα και η Δύναμη μετρούν μόνο στρατιώτες, τώρα.'
        }
      >
        <span className="tile__n">{h.total}</span>
        <span className="tile__l">Δύναμη</span>
      </div>
      <div className="tile">
        <span className="tile__n">{h.kol}</span>
        <span className="tile__l">Κωλυόμενοι</span>
      </div>
      <div className="tile">
        <span className="tile__n">{h.apo}</span>
        <span className="tile__l">Απόντες</span>
      </div>
      <div className="tile">
        <span className="tile__n">{h.avail}</span>
        <span className="tile__l">Διαθέσιμοι</span>
      </div>
    </div>
  );
}

/** The names per ΗΚΑΙ column: cadre first (they open the cadre sheet), then soldiers. */
function hkaiSourceList(s: ReturnType<typeof useHkai>) {
  const { nav, h, src, cadreOf, cadreSeen } = s;
  return (
    <ul className="hk-src">
      {src.map(([k, , full]) => (
        <li key={k}>
          <b>{full}</b>: <span className="num">{h.cols[k].length + (h.cadre[k]?.length || 0)}</span>
          <div className="cat__names">
            {cadreOf(k).map((c) => (
              <button
                key={c.id}
                type="button"
                data-tip="Στέλεχος· ανοίγει η κάρτα του, όπου αλλάζει η κατάσταση"
                onClick={() => nav.openCadre(c.id, cadreSeen)}
              >
                {rankTxt(c)} {c.last}
              </button>
            ))}
            {h.cols[k].map((p) => (
              <button key={p.id} type="button" onClick={() => nav.openPerson(p.id)}>
                {shortName(p)}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The summary column (or the «Σύνοψη» tab on a phone); `s` is the result of `useHkai()`. */
export function hkaiSummary(s: ReturnType<typeof useHkai>) {
  const { state, date, h, cadre } = s;
  return (
    <div className="stack">
      <Card title="Από πού βγαίνει κάθε αριθμός">
        {hkaiTiles(h, state.rules?.hkTime)}
        <p className="note" style={{ margin: '-4px 0 12px' }}>
          Δύναμη = <b>{h.soldiers}</b> στρατιώτες + <b>{h.cadreN}</b> στελέχη · μετρά με τις{' '}
          {state.rules?.hkTime || '08:00'} (όποιος γυρίσει ως τότε είναι παρών).
        </p>
        {hkaiSourceList(s)}
        <p className="note" style={{ margin: '8px 0 0' }}>
          Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες,
          αναρρωτικές και νοσοκομείο· τα στελέχη από τις καταστάσεις τους στην καρτέλα Στελέχη. Κάθε άτομο μετριέται μία
          φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.
        </p>
        {h.noCol.length > 0 && (
          <p className="note" style={{ margin: '6px 0 0', opacity: 0.75 }}>
            {h.noCol.length}{' '}
            {h.noCol.length === 1 ? 'απών της εφαρμογής δεν μετρά' : 'απόντες της εφαρμογής δεν μετρούν'}
            {' στην '}
            {HK()} ({[...new Set(h.noCol.map((x) => x.kind))].join(', ')}).
          </p>
        )}
      </Card>
      <CadreCard warn={!cadre} />
      <HkHeadCard />
      <RequestsLink date={date} />
      <HkaiMovesCard date={date} />
      <HkaiManualCard date={date} />
      <HkaiSectionsCard />
    </div>
  );
}
