// One group of the «Δύναμη» list: a heading with the count and one line per person.
// Purpose: `SvRows`, a plain function called by the screen's cards.
// Does NOT: filter or sort (model/view.ts and `strengthView` did that) or open the person (the `onOpen` prop does).
// Owner layer: renderer/pages/strength. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { RkName } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge } from '../../../shared/ui';
import { roomTxt } from '../../../../shared/domain';
import type { SvGroup } from '../../../../shared/strengthView';

/** The rows of one `SvGroup` (a reason, e.g. one kind of leave); `onOpen` gets the person id. */
export function SvRows({ g, onOpen }: { g: SvGroup; onOpen: (id: number) => void }) {
  return (
    <div className="svsub">
      <div className="svsub__head" data-tip={g.tip}>
        <b>{g.label}</b>
        <span className="num">{g.rows.length}</span>
      </div>
      <ul className="svl">
        {g.rows.map((r) => (
          <li key={r.p.id} className="svl__row">
            <button type="button" className="linkish svl__name" onClick={() => onOpen(r.p.id)}>
              <RkName p={r.p} />
            </button>
            <span className="svl__room muted">{roomTxt(r.p)}</span>
            <span className="svl__what">
              {r.what && (
                <Badge tone={r.tone} data-tip={r.what}>
                  {r.what}
                </Badge>
              )}
            </span>
            <span className="svl__range muted">{r.range}</span>
            <span className={cx('svl__ret', r.retBad ? 'txt-bad' : 'muted')}>
              {r.tag ? (
                <Badge tone="outline" data-tip="Στήλη της ΗΚΑΙ όπου μετρά">
                  ΗΚΑΙ: {r.tag}
                </Badge>
              ) : (
                r.ret
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
