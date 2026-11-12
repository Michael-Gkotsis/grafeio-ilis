// «Ρυθμίσεις › Υπηρεσίες › Καταστάσεις» card: which duties each medical and penalty goes into, out and ΗΚΑΙ column.
// Purpose: `StatCard` (Michael, 13/10 and 18/10): one column per duty, one for the out and one for the ΗΚΑΙ.
// Does NOT: hold state (model/useStat.ts) or the rules (model/statView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/stat.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered. The row and the cells are plain functions, not components.
// Covering test: test/screens-settings-guide.test.ts, test/settings-stat-view.test.ts.
import type { ChangeEvent, MouseEvent } from 'react';
import { TYPES } from '../../../../../shared/domain';
import { statCellOf, statOutOf, statRowKey } from '../../../../../shared/stat';
import { HK } from '../../../../../shared/unit';
import { Badge, Button, Card, Select, type ValueEvent } from '../../../../shared/ui';
import { HK_EY, OPTS, baseName, medKey, rowName, type StatRow } from '../../model/statView';
import { useStat } from '../../model/useStat';
import { colHead } from './colHead';

type StatModel = ReturnType<typeof useStat>;

/** The note on top of the table. */
const NOTE =
  'Μία στήλη για κάθε υπηρεσία, και για όσες προσθέτεις. Αρχικά όπως πριν: ΕΥ σε καμία υπηρεσία, ΕΑ και ΕΟ όχι σε ' +
  'ένοπλη, όχι μαγειρεία και σκοπιά μόνο αν δεν υπάρχει άλλος, ΕΑΡΒ παντού, οι ποινές παντού. Κάθε ιατρικό που ' +
  'προσθέτεις στις Λίστες μπαίνει εδώ χωρίς περιορισμούς, ώσπου να ορίσεις τι κάνει. «Αν δεν υπάρχει άλλος»: η ' +
  'αυτόματη συμπλήρωση τον βάζει τελευταίο, με προειδοποίηση. «Όχι»: μπαίνει με το χέρι μόνο με αιτία. Ισχύει μαζί ' +
  'με τη Σ.Ι. και τη «Δυνατότητα υπηρεσιών» του ατόμου: μετρά το αυστηρότερο.';
/** The note under the table. */
const FOOT =
  'Νέα ιατρικά και είδη ποινής προσθέτεις από τις Λίστες· το όνομα, ο κωδικός στο ημερολόγιο και το «μόνο ' +
  'προειδοποίηση» είναι εκεί. Άδειες, έξοδοι και νοσοκομείο είναι απόντες: καμία υπηρεσία. Το ΣΤΕΠ (εισαγωγή μέσα ' +
  'στο στρατόπεδο) μετρά παρών, αλλά σε καμία υπηρεσία και χωρίς έξοδο.';

/** The ΗΚΑΙ cell: fixed text for base rows and penalties, a list for an own medical. */
function hkCell(m: StatModel, r: StatRow) {
  if (r.type === 'PUN')
    return (
      <td className="muted" data-tip="Οι ποινές μετρούν στη στήλη «Τιμ.» (κωλυόμενοι)">
        Τιμ.
      </td>
    );
  if (!r.med)
    return (
      <td
        className="muted"
        data-tip={r.type === 'EY' ? 'Κωλυόμενοι: ελεύθεροι υπηρεσίας' : 'Παρών: δεν μετρά σε στήλη'}
      >
        {r.type === 'EY' ? 'ΕΥ' : '—'}
      </td>
    );
  const used = m.usedMed.has(medKey(r.own));
  return (
    <td>
      <Select
        className="ui-input statsel"
        aria-label={r.own + ': ' + HK()}
        value={r.type === 'EY' ? HK_EY : ''}
        disabled={used}
        data-tip={
          used
            ? 'Το έχουν ήδη κάποιοι, οπότε η ' +
              HK() +
              ' μένει όπως είναι. Για άλλη στήλη φτιάξε νέο ιατρικό στις Λίστες.'
            : 'Πού μετρά στην ' + HK()
        }
        onChange={(e: ValueEvent) => m.setHk(r, e.target.value)}
      >
        <option value={HK_EY}>ΕΥ</option>
        <option value="">— (παρών)</option>
      </Select>
    </td>
  );
}

/** The first cell: the name with its tags. */
function nameCell(r: StatRow) {
  const { type, own } = r;
  const isPun = type === 'PUN';
  return (
    <td>
      {own ? (
        <>
          <b>{rowName(type, own)}</b>
          {r.med?.warn && (
            <>
              {' '}
              <Badge tone="warn" data-tip="Μόνο προειδοποίηση (Λίστες): προειδοποίηση σε κάθε υπηρεσία">
                ⚠
              </Badge>
            </>
          )}
          {r.med && r.type !== 'EARV' && (
            <>
              {' '}
              <span
                className="muted"
                style={{ fontSize: '12px' }}
                data-tip={'Ό,τι δεν άλλαξες ακολουθεί τη γραμμή ' + TYPES[type].label}
              >
                αρχικά όπως {TYPES[type].label}
              </span>
            </>
          )}
        </>
      ) : (
        <b data-tip={isPun ? 'Κάθε ποινή, εκτός αν ορίσεις κάτι άλλο για το είδος της' : TYPES[type].long}>
          {rowName(type, own)}
        </b>
      )}
    </td>
  );
}

/** One table row of a status. */
function statRow(m: StatModel, r: StatRow) {
  const { lists, cells, out, cols } = m;
  const { type, own } = r;
  const k = statRowKey(type, own);
  const n = m.count.get(k) || 0;
  const custom = !!cells[k] || out[k] != null;
  const o = statOutOf(lists, type, own || undefined);
  const isPun = type === 'PUN';
  return (
    <tr key={k} className={own && isPun ? 'is-sub' : ''}>
      {nameCell(r)}
      <td className="num">{n || ''}</td>
      {cols.map((b) => {
        const c = statCellOf(lists, type, own || undefined, b);
        return (
          <td key={b.id} className={c.from === (own ? 'own' : 'row') ? 'is-set' : ''}>
            <Select
              className={'ui-input statsel is-' + c.v}
              aria-label={rowName(type, own) + ': ' + b.name}
              value={c.v}
              onChange={(e: ValueEvent) => m.setCell(type, own, b, e.target.value as (typeof OPTS)[number][0])}
            >
              {OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </td>
        );
      })}
      <td className={o.from === (own ? 'own' : 'row') ? 'is-set' : ''}>
        {isPun ? (
          <input
            type="checkbox"
            className="ui-check"
            aria-label={rowName(type, own) + ': έξοδος'}
            checked={false}
            disabled
            data-tip="Η ποινή κόβει πάντα την έξοδο"
          />
        ) : (
          <input
            type="checkbox"
            className="ui-check"
            aria-label={rowName(type, own) + ': έξοδος'}
            checked={o.ok}
            onChange={(e: ChangeEvent<HTMLInputElement>) => m.setOut(type, own, e.target.checked)}
          />
        )}
      </td>
      {hkCell(m, r)}
      <td style={{ textAlign: 'right' }}>
        {custom && (
          <Button
            size="sm"
            variant="ghost"
            data-tip={own ? 'Ό,τι και για ' + baseName(type) : 'Όπως στην αρχή'}
            onClick={() => m.resetRow(type, own)}
          >
            Επαναφορά
          </Button>
        )}
      </td>
    </tr>
  );
}

/** The «Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν» card. */
export function StatCard() {
  const m = useStat();
  const span = m.cols.length + 5;
  return (
    <Card title="Καταστάσεις: σε ποιες υπηρεσίες μπαίνουν">
      <p className="note" style={{ marginTop: 0 }}>
        {NOTE}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="sigrid">
          <thead>
            <tr>
              <th>Κατάσταση</th>
              <th>Σήμερα</th>
              {m.cols.map(colHead)}
              <th>Έξοδος</th>
              <th>{HK()}</th>
              <th />
            </tr>
          </thead>
          {m.sections.map((sec) => (
            <tbody key={sec.title}>
              <tr className="sigrid__sec">
                <th colSpan={span}>{sec.title}</th>
              </tr>
              {sec.empty && !sec.rows.length && (
                <tr>
                  <td colSpan={span} className="muted" style={{ textAlign: 'left' }}>
                    {'Κανένα ακόμα. Πρόσθεσε από τις '}
                    {/* biome-ignore lint/a11y/useValidAnchor: frozen DOM, a link with href="#" as before */}
                    <a
                      href="#"
                      onClick={(e: MouseEvent) => {
                        e.preventDefault();
                        m.nav.set({ tab: 'lists' });
                      }}
                    >
                      Λίστες › Ιατρικά
                    </a>
                    · εμφανίζεται εδώ για να ορίσεις τι κάνει.
                  </td>
                </tr>
              )}
              {sec.rows.map((r) => statRow(m, r))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="note">{FOOT}</p>
    </Card>
  );
}
