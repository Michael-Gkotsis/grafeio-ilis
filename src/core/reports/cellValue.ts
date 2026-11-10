// The value of a cell of the form (header, date, title, signers…).
//
// Purpose: `cellValue` (the text of the form cell with a given key) and the short date it uses (19 ΟΚΤ 26).
// Does NOT: find the cell in the template or the tag that marks it (cells.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/cadre,
//   core/esso.
// Why: header, place and date, title and signers come from the settings and the day, and the preview and the Excel
//   must write the same text.
// Covering tests: test/report-blank-tags.test.ts.
import { dmy, parseD, MON_SHORT, type ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import { dutyOfficers } from '../cadre/cadre';
import { currentEsso, essoName } from '../esso/esso';
import type { Report } from '../model/reportTypes';

const shortDate = (d: ISODate) => {
  const x = parseD(d);
  return String(x.getDate()).padStart(2, '0') + ' ' + MON_SHORT[x.getMonth()] + ' ' + String(x.getFullYear()).slice(2);
};
/**
 * The value of the form cell `key` on day `d`: header lines, unit name, place and date, title, the count `n`, signers,
 * ΕΣΣΟ, the duty officer, the sheet `group`; null for an unknown key.
 */
export function cellValue(
  s: AppState,
  key: string,
  d: ISODate,
  r: Pick<Report, 'title' | 'name'>,
  n: number,
  group = '',
): string | number | null {
  const st = s.settings;
  const head = st.unit.filter(Boolean);
  switch (key) {
    case 'head':
      return head.join('\n');
    case 'head1':
      return st.unit[0] || '';
    case 'head2':
      return st.unit[1] || '';
    case 'head3':
      return st.unit[2] || '';
    case 'unitName':
      return st.unitName;
    case 'place':
      return st.place;
    case 'placeDate':
      return (st.place ? st.place + ', ' : '') + shortDate(d);
    case 'date':
      return dmy(d);
    case 'title':
      return r.title || r.name;
    case 'count':
      return n;
    case 'sgtName':
      return st.signers?.sergeant || '';
    case 'cmdName':
      return st.signers?.commander || '';
    case 'esso': {
      const e = currentEsso(s);
      return e ? essoName(e) : '';
    }
    case 'officer':
      return dutyOfficers(s, d);
    case 'group':
      return group;
  }
  return null;
}
