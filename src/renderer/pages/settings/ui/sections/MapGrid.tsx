// The grid half of the mapping dialog: the sheet rows as a table the sergeant clicks, and the sample of how they read.
// Purpose: `mapGrid` and `mapSampleBox`, plain functions of the mapping model, called by `MapDialog`.
// Does NOT: hold state (model/useMap.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6); plain functions, not
//   components, so the render counts stay the ones of the htm version.
// Covering test: test/screens-dialogs-forms.test.ts (snapshots sources-MapDialog*).
import { cellText, colLetter } from '../../../../../shared/sources';
import { cx } from '../../../../shared/lib/cx';
import { Button } from '../../../../shared/ui';
import type { useMap } from '../../model/useMap';

type MapModel = ReturnType<typeof useMap>;

/** The table: column letters (with the mapped field), the rows around the header and «Δείξε κι άλλες γραμμές». */
export function mapGrid(m: MapModel) {
  const { b, active, setExtra, isNew, sheet, maxCol, from, to, setHeader, clickCell, fieldAt } = m;
  return isNew ? (
    <p className="note">
      Νέο φύλλο: η εφαρμογή γράφει τίτλο στη γραμμή 1, επικεφαλίδες στη γραμμή 2 και από κάτω τις εγγραφές, με τις
      στήλες που βλέπεις αριστερά.
    </p>
  ) : (
    <>
      <div className="xl__scroll mapper__scroll">
        <table className="mapgrid">
          <thead>
            <tr>
              <th />
              {Array.from({ length: maxCol + 1 }, (_, c) => (
                <th key={c} className={cx(fieldAt(c) && 'is-mapped')}>
                  {colLetter(c)}
                  {fieldAt(c) && <span className="mapgrid__tag">{fieldAt(c)!.label.replace(/ \(.*\)$/, '')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i).map((r) => (
              <tr key={r} className={cx(r === b.header && 'is-head')}>
                <th>
                  <button
                    type="button"
                    className="mapgrid__rn"
                    data-tip="Αυτή είναι η γραμμή των επικεφαλίδων"
                    onClick={() => setHeader(r)}
                  >
                    {r + 1}
                  </button>
                </th>
                {Array.from({ length: maxCol + 1 }, (_, c) => {
                  const v = cellText((sheet.rows[r] || [])[c]);
                  return (
                    <td
                      key={c}
                      className={cx(
                        fieldAt(c) && 'is-mapped',
                        active && 'is-pick',
                        active && b.cols[active] === c && 'is-col',
                      )}
                      title={v}
                      onClick={() => clickCell(r, c)}
                    >
                      {v.length > 18 ? v.slice(0, 17) + '…' : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {to < sheet.rows.length && (
        <Button size="sm" variant="ghost" onClick={() => setExtra((x) => x + 30)}>
          Δείξε κι άλλες γραμμές
        </Button>
      )}
    </>
  );
}

/** «Έτσι διαβάζει η εφαρμογή τις πρώτες γραμμές»: the sample lines, if any. */
export function mapSampleBox(sample: string[]) {
  return (
    sample.length > 0 && (
      <div className="mapper__sample">
        <b>Έτσι διαβάζει η εφαρμογή τις πρώτες γραμμές:</b>
        <ul>
          {sample.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    )
  );
}
