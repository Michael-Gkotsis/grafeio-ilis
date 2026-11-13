// The «Από πού βγαίνει κάθε αριθμός» card of the «ΗΚΑΙ» page: one row per source with its count and its names.
// Purpose: `HkaiNumbersCard`; a row shows the source and the count, «ονόματα ›» opens its name buttons (cadre first:
//   they open the cadre sheet; then soldiers: they open the person). «Πώς μετράει;» at the foot shows the long
//   explanation; the note about absences the form does not count stays visible, it is a warning.
// Does NOT: hold the numbers or the names (the screen passes `useHkai()` in) or the rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: U13 turned the long list of names into one-line rows that open on demand,
//   so the page fits one screen at 1366; the open rows and the disclosure are local state, never saved.
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useState } from 'react';
import { Card } from '../../../shared/ui';
import { shortName } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { HK } from '../../../../shared/unit';
import type { useHkai } from '../model/useHkai';

/** Props: `s` is the result of `useHkai()`. */
export interface HkaiNumbersCardProps {
  s: ReturnType<typeof useHkai>;
}

/** The card; keeps which rows are open (column keys) and whether the explanation is shown. */
export function HkaiNumbersCard({ s }: HkaiNumbersCardProps) {
  const { nav, h, src, cadreOf, cadreSeen } = s;
  const [open, setOpen] = useState<string[]>([]);
  const [how, setHow] = useState(false);
  const toggle = (k: string) => setOpen((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  return (
    <Card title="Από πού βγαίνει κάθε αριθμός" flush>
      <ul className="hkai__src">
        {src.map(([k, , full]) => {
          const count = h.cols[k].length + (h.cadre[k]?.length || 0);
          const shown = open.includes(k) && count > 0;
          return (
            <li key={k} className="hkai__srcrow">
              <span className="hkai__srclabel">{full}</span>
              <span className="hkai__srcn num">{count || '—'}</span>
              {count > 0 && (
                <button
                  type="button"
                  className="hkai__link"
                  aria-expanded={shown}
                  aria-controls={'hkai-names-' + k}
                  onClick={() => toggle(k)}
                >
                  {shown ? 'ονόματα ‹' : 'ονόματα ›'}
                </button>
              )}
              {shown && (
                <div className="hkai__names" id={'hkai-names-' + k}>
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
              )}
            </li>
          );
        })}
      </ul>
      <div className="hkai__foot">
        {h.noCol.length > 0 && (
          <p className="hkai__warn">
            {h.noCol.length}{' '}
            {h.noCol.length === 1 ? 'απών της εφαρμογής δεν μετρά' : 'απόντες της εφαρμογής δεν μετρούν'}
            {' στην '}
            {HK()} ({[...new Set(h.noCol.map((x) => x.kind))].join(', ')}).
          </p>
        )}
        <button
          type="button"
          className="hkai__link"
          aria-expanded={how}
          aria-controls="hkai-how"
          onClick={() => setHow(!how)}
        >
          Πώς μετράει;
        </button>
        {how && (
          <p className="hkai__how" id="hkai-how">
            Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες,
            αναρρωτικές και νοσοκομείο· τα στελέχη από τις καταστάσεις τους στην καρτέλα Στελέχη. Κάθε άτομο μετριέται
            μία φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.
          </p>
        )}
      </div>
    </Card>
  );
}
