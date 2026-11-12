// «Ρυθμίσεις › Σ.Ι.» card: for each Σ.Ι. (and each condition category) the duties it goes into, one column per duty.
// Purpose: `SiCard` (Michael, 13/10); the «Δυνατότητα υπηρεσιών» of a person stays on top of these rules.
// Does NOT: hold state (model/useSi.ts) or the rules (model/siView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/si.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered. The table rows and the add boxes are plain functions.
// Covering test: test/screens-settings-guide.test.ts, test/settings-si-view.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { parseSi, siCats, siCellOf, siRowKey } from '../../../../../shared/si';
import { Alert, Badge, Button, Card, Select, type ValueEvent } from '../../../../shared/ui';
import { catRowChoices, hasLegacyUnarmed, isOwnBase, isUsedCat, ownCategories, type SiRow } from '../../model/siView';
import { useSi } from '../../model/useSi';
import { colHead } from './colHead';

type SiModel = ReturnType<typeof useSi>;

/** The note on top of the table. */
const NOTE =
  'Μία στήλη για κάθε υπηρεσία. Αρχικά ο άοπλος (Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4) δεν μπαίνει σε ένοπλη υπηρεσία και όλοι οι άλλοι ' +
  'μπαίνουν παντού· αν κάνεις μια υπηρεσία ένοπλη ή άοπλη (κάρτα Υπηρεσίες), αλλάζει και εδώ. Όπου βάλεις «Όχι», η ' +
  'αυτόματη συμπλήρωση δεν τον βάζει· με το χέρι μπαίνει μόνο με αιτία. Η «Δυνατότητα υπηρεσιών» στην κάρτα κάθε ' +
  'ατόμου ισχύει από πάνω. Λ/Υ και Δ/Υ ορίζονται με το χέρι, όπως πριν.';

/** One table row: the Σ.Ι. (or Σ.Ι. + category), the people count, a Ναι/Όχι list per duty and the row buttons. */
function siRow(m: SiModel, { label, cat }: SiRow) {
  const { lists, cfg, cells, cols, count } = m;
  const k = siRowKey(label, cat);
  const n = count.get(k) || 0;
  const custom = !!cells[k] && Object.keys(cells[k]).length > 0;
  const sub = !!parseSi(label, cfg)?.sub;
  return (
    <tr key={k} className={cat ? 'is-cat' : sub ? 'is-sub' : ''}>
      <td>
        {cat ? (
          <>
            <span className="muted">{label}</span> <b>{cat}</b>
          </>
        ) : (
          <b>{label}</b>
        )}
        {!cat && isOwnBase(cfg, label) && (
          <>
            {' '}
            <Badge tone="info">δική σου</Badge>
          </>
        )}
      </td>
      <td className="num">{n || ''}</td>
      {cols.map((b) => {
        const c = siCellOf(lists, label, cat, b);
        return (
          <td key={b.id} className={c.from === (cat ? 'cat' : 'row') ? 'is-set' : ''}>
            <Select
              className={'ui-input statsel is-' + (c.ok ? 'yes' : 'no')}
              aria-label={(cat ? label + ' ' + cat : label) + ': ' + b.name}
              value={c.ok ? 'yes' : 'no'}
              onChange={(e: ValueEvent) => {
                if ((e.target.value === 'yes') !== c.ok) m.toggle(label, cat, b);
              }}
            >
              <option value="yes">✓ Ναι</option>
              <option value="no">✕ Όχι</option>
            </Select>
          </td>
        );
      })}
      <td style={{ textAlign: 'right' }}>
        {custom && (
          <Button
            size="sm"
            variant="ghost"
            data-tip={cat ? 'Ό,τι και για το ' + label : 'Όπως στην αρχή: ο άοπλος όχι σε ένοπλη υπηρεσία'}
            onClick={() => m.resetRow(label, cat)}
          >
            Επαναφορά
          </Button>
        )}
        {cat && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={'Χωρίς δικούς κανόνες: ' + label + ' ' + cat}
            data-tip={'Να ισχύει ό,τι και για το ' + label}
            onClick={() => m.removeCatRow(label, cat)}
          >
            ✕
          </Button>
        )}
        {!cat && isOwnBase(cfg, label) && !n && (
          <Button size="sm" variant="ghost" aria-label={'Σβήσε ' + label} onClick={() => m.removeBase(label)}>
            ✕
          </Button>
        )}
      </td>
    </tr>
  );
}

/** «Δικοί κανόνες για … με πάθηση …» and its button. */
function catRowForm(m: SiModel) {
  const { cfg, form } = m;
  const { catRow, catPick } = form;
  return (
    <div className="field-row" style={{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field" style={{ maxWidth: '150px' }}>
        <label className="field__label" htmlFor="si-cr">
          Δικοί κανόνες για
        </label>
        <Select
          id="si-cr"
          className="ui-input"
          value={catRow}
          onChange={(e: ValueEvent) => form.setCatRow(e.target.value)}
        >
          {catRowChoices(cfg).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="si-cp">
          με πάθηση
        </label>
        <Select
          id="si-cp"
          className="ui-input"
          value={catPick}
          onChange={(e: ValueEvent) => {
            form.setCatPick(e.target.value);
            form.setErr(null);
          }}
        >
          <option value="">—</option>
          {siCats(cfg).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="field" style={{ flex: '0 0 auto', minWidth: 0 }}>
        <Button variant="outline" disabled={!catPick} why="Διάλεξε πρώτα πάθηση" onClick={m.addCatRow}>
          Πρόσθεσε γραμμή
        </Button>
      </div>
    </div>
  );
}

/** One «Νέα …» text box with its «Πρόσθεσε» button. */
function newBox(
  m: SiModel,
  o: { id: string; label: string; ph: string; value: string; set: (v: string) => void; add: () => void },
) {
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor={o.id}>
          {o.label}
        </label>
        <input
          id={o.id}
          className="ui-input"
          placeholder={o.ph}
          value={o.value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            o.set(e.target.value);
            m.form.setErr(null);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') o.add();
          }}
        />
      </div>
      <div className="field" style={{ flex: '0 0 auto', minWidth: 0 }}>
        <Button variant="outline" disabled={!o.value.trim()} why="Γράψε πρώτα το όνομα" onClick={o.add}>
          Πρόσθεσε
        </Button>
      </div>
    </>
  );
}

/** The «Δικές σου κατηγορίες» line. */
function ownCategoriesNote(m: SiModel) {
  const own = ownCategories(m.cfg);
  return (
    own.length > 0 && (
      <p className="note">
        {'Δικές σου κατηγορίες: '}
        {own.map((c, i) => (
          <span key={c}>
            {i ? ', ' : ''}
            {c}
            {!isUsedCat(m.people, m.cells, c) && (
              <>
                {' '}
                <Button variant="link" aria-label={'Σβήσε ' + c} onClick={() => m.removeCat(c)}>
                  ✕
                </Button>
              </>
            )}
          </span>
        ))}
      </p>
    )
  );
}

/** The «Ρυθμίσεις › Σ.Ι.» card. */
export function SiCard() {
  const m = useSi();
  const { cols, rows, odd, form } = m;
  return (
    <Card title="Σ.Ι.: σε ποιες υπηρεσίες μπαίνει">
      <p className="note" style={{ marginTop: 0 }}>
        {NOTE}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="sigrid">
          <thead>
            <tr>
              <th>Σ.Ι.</th>
              <th>Άτομα</th>
              {cols.map(colHead)}
              <th />
            </tr>
          </thead>
          <tbody>{rows.map((row) => siRow(m, row))}</tbody>
        </table>
      </div>
      {odd.size > 0 && (
        <Alert tone="warn">
          <span>
            <b>Σ.Ι. που δεν αναγνωρίζονται:</b> {[...odd].map(([v, n]) => '«' + v + '» (' + n + ')').join(' · ')}. Για
            αυτούς ισχύει ο παλιός κανόνας (άοπλος όποιος έχει «ΑΟΠΛ» ή «ΧΩΡΙΣ ΟΠΛΟ» ή αρχίζει από «Ι4»). Διόρθωσέ τους
            από τη «Διόρθωση στοιχείων».
          </span>
        </Alert>
      )}
      {hasLegacyUnarmed(m.lists) && (
        <p className="note">Η λίστα «Σ.Ι. άοπλων» στις Λίστες ισχύει ακόμα για το ποιος είναι αρχικά άοπλος.</p>
      )}
      {catRowForm(m)}
      <div className="field-row" style={{ alignItems: 'flex-end', marginTop: '8px' }}>
        {newBox(m, { id: 'si-b', label: 'Νέα Σ.Ι.', ph: 'π.χ. Ι5', value: form.nb, set: form.setNb, add: m.addBase })}
        {newBox(m, {
          id: 'si-c',
          label: 'Νέα κατηγορία πάθησης',
          ph: 'π.χ. ΓΑΣΤΡΕΝΤΕΡΟΛΟΓΙΚΟ',
          value: form.nc,
          set: form.setNc,
          add: m.addCat,
        })}
      </div>
      {ownCategoriesNote(m)}
      <p className="note">
        Οι κατηγορίες πάθησης ακολουθούν τις ενότητες του Γενικού Πίνακα Νοσημάτων (π.δ. 11/2014). Μένουν μόνο στην
        εφαρμογή: στο Excel η Σ.Ι. γράφεται χωρίς αυτήν (π.χ. «Ι3 ΧΩΡΙΣ ΟΠΛΟ»), για να μη χαλάσει κάποιος τύπος που τη
        μετράει.
      </p>
      {form.err && (
        <Alert tone="bad">
          <span>{form.err}</span>
        </Alert>
      )}
    </Card>
  );
}
