// The «Συμπληρώνεις εσύ» card: what the ΗΚΑΙ cannot know (numbers per rank, free texts, accidents) for one day.
// Purpose: `HkaiManualCard`; the numbers are added to the rank's column, the totals stay formulas of the form.
// Does NOT: hold state (model/useHkaiManual.ts) or the number rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { Combo, Select, Button, Card } from '../../../shared/ui';
import { hkOn } from '../../../../shared/domain';
import { dm } from '../../../../shared/dates';
import { HK_MANUAL } from '../../../../shared/rules';
import { hkRowList } from '../../../../shared/ranks';
import { HK, hkRowLabel } from '../../../../shared/unit';
import { useHkaiManual } from '../model/useHkaiManual';
import { HK_ACC_FIELDS, HK_TEXT_FIELDS, manualLabel } from '../model/view';

/** The card; `date` is an ISODate. */
export function HkaiManualCard({ date }: { date: string }) {
  const { state, today, m, setM, rk, setRk, cur, dirty, lvOn, saveM, setCell, used, auto, offList } =
    useHkaiManual(date);
  return (
    <Card title={'Συμπληρώνεις εσύ (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
      <p className="note" style={{ marginTop: 0 }}>
        Ό,τι δεν βγαίνει από τις καταστάσεις. Οι αριθμοί προστίθενται στη στήλη του βαθμού και τα σύνολα βγαίνουν από
        τους τύπους του εντύπου.
      </p>
      <div className="field">
        <span className="field__label">Αριθμοί ανά βαθμό</span>
        <div className="field-row">
          <Select className="ui-input" aria-label="Βαθμός" value={rk} onChange={(e) => setRk(e.target.value)}>
            {hkRowList(state.settings.lists).map((r) => (
              <option key={r} value={r}>
                {hkRowLabel(r)}
              </option>
            ))}
          </Select>
        </div>
        <div className="settings-grid" style={{ marginTop: '6px' }}>
          {HK_MANUAL.map(([k, l]) => (
            <label key={k} className="field">
              <span className="field__help">{l}</span>
              <input
                className="ui-input"
                type="number"
                min="0"
                placeholder="0"
                value={m.cells[rk]?.[k] || ''}
                onChange={(e) => setCell(rk, k, Math.max(0, +e.target.value || 0))}
              />
            </label>
          ))}
        </div>
        {used.length > 0 && (
          <span className="field__help">
            Έχεις γράψει: {used.map((u) => hkRowLabel(u.r) + ' ' + manualLabel(u.k) + ' ' + u.v).join(' · ')}
          </span>
        )}
      </div>
      {HK_TEXT_FIELDS.map(([k, l, ph]) => {
        const onText = (e: { target: { value: string } }) => setM({ ...m, text: { ...m.text, [k]: e.target.value } });
        const common = {
          id: 'hk-' + k,
          className: 'ui-input',
          placeholder: k === 'off' && auto ? auto : ph,
          disabled: k === 'lv' && !lvOn,
          value: m.text[k] || '',
          onChange: onText,
        };
        return (
          <div key={k} className="field">
            <label className="field__label" htmlFor={'hk-' + k}>
              {l}
            </label>
            {k === 'off' ? <Combo {...common} options={offList} /> : <input {...common} />}
            {k === 'lv' && !lvOn && (
              <span className="field__help">
                Γράφεται μόνο όταν είναι ανοιχτό το «3. Άδειες» για αυτή τη μέρα: άνοιξέ το με τον διακόπτη πάνω από την
                προεπισκόπηση.
              </span>
            )}
            {k === 'off' && (
              <span className="field__help">
                {auto
                  ? 'Κενό = από τα Στελέχη: ' + auto + '.'
                  : 'Κενό = όποιος αξιωματικός έχει «Υπηρεσία» στα Στελέχη.'}
              </span>
            )}
          </div>
        );
      })}
      {hkOn(state.settings, 'acc') && (
        <div className="field">
          <span className="field__label">Ατυχήματα</span>
          <div className="settings-grid">
            {HK_ACC_FIELDS.map(([k, l]) => (
              <label key={k} className="field">
                <span className="field__help">{l}</span>
                <input
                  className="ui-input"
                  placeholder="Ø"
                  value={m.text[k] || ''}
                  onChange={(e) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}
                />
              </label>
            ))}
          </div>
          <span className="field__help">Κενό = Ø, όπως στο έντυπο.</span>
        </div>
      )}
      <p className="note">
        Οι αποφάσεις 1 (όσοι μπήκαν στη δύναμη), 2 (όσοι βγήκαν εκτός δύναμης), 4 (ποινές της μέρας) και 5 (αιτήσεις,
        και όσες άδειες εγκρίθηκαν) γράφονται μόνες τους. Η 3 (άδειες στρατιωτών και στελεχών που δήλωσες απευθείας)
        μόνο αν την ανοίξεις για αυτή τη μέρα, με τον διακόπτη πάνω από την προεπισκόπηση· η προεπιλογή για τις νέες
        μέρες είναι στις «Ενότητες της {HK()}» πιο κάτω, όπου είναι και τα οχήματα και τα «Προβλέπονται».
      </p>
      <div className="toolbar">
        <Button disabled={!dirty} why="Δεν άλλαξε κάτι" onClick={saveM}>
          Αποθήκευση
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setM(cur)}>
            Ακύρωση
          </Button>
        )}
      </div>
    </Card>
  );
}
