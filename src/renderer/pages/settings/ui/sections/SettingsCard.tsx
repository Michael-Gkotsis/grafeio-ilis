// «Ρυθμίσεις › Μονάδα και έντυπα» card: unit kind, form header, title unit, place, cadre counts and the folders list.
// Purpose: `SettingsCard`, the first card of the «Μονάδα» section (the signatures and ΗΚΑΙ rows cards follow it).
// Does NOT: hold state (model/useUnit.ts) or the rules (model/unitView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4); the markup, keys
//   and
//   text nodes are exactly what the htm version rendered.
// Covering test: test/screens-settings-guide.test.ts, test/settings-unit-view.test.ts.
import type { ChangeEvent } from 'react';
import { cadreCountRows } from '../../../../../shared/ranks';
import { HK, hkRowLabel } from '../../../../../shared/unit';
import { HkHeadFields, HkRowsButton, UnitKindField } from '../../../../features/hk-rows';
import { Button, Card } from '../../../../shared/ui';
import { useUnit } from '../../model/useUnit';

type UnitModel = ReturnType<typeof useUnit>;

/** One text node: the sentence and the space before the «Αντίγραφο τώρα» link. */
const BACKUP_NOTE =
  'Κάθε μέρα αυτόματα και πριν από κάθε εισαγωγή (όλα των 14 τελευταίων ημερών, 1 ανά εβδομάδα για 8 εβδομάδες, ' +
  '1 ανά μήνα). ';

/** The three header lines of the forms. */
function headerLines(m: UnitModel) {
  return (
    <div className="field">
      <span className="field__label">Κεφαλίδα εντύπων (3 γραμμές)</span>
      <div className="field-row">
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            className="ui-input"
            style={{ flex: 1, minWidth: '160px' }}
            value={m.s.unit[i]}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const u = [...m.s.unit] as [string, string, string];
              u[i] = e.target.value;
              m.setS({ ...m.s, unit: u });
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** The cadre counts per rank and their help. */
function cadreCounts(m: UnitModel) {
  const { s, setS, state } = m;
  return (
    <div className="field">
      <span className="field__label" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        Στελέχη ανά βαθμό ({HK()}, στήλη «Τοποθετημένοι») <HkRowsButton />
      </span>
      <div className="settings-grid">
        {cadreCountRows(state.settings.lists).map((r) => (
          <label key={r} className="field">
            <span className="field__help">{hkRowLabel(r)}</span>
            <input
              className="ui-input"
              type="number"
              min="0"
              value={s.cadre[r] || 0}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setS({ ...s, cadre: { ...s.cadre, [r]: Math.max(0, +e.target.value || 0) } })
              }
            />
          </label>
        ))}
      </div>
      <span className="field__help">
        Μόνο τα στελέχη, χωρίς ονόματα. Οι στρατιώτες του Δυναμολογίου μετρώνται μόνοι τους, στη γραμμή του βαθμού τους.
      </span>
    </div>
  );
}

/** Where the files, the data and the backups are, and the version. */
function whereList(m: UnitModel) {
  const { state, boot, toast } = m;
  return (
    <dl className="kv">
      <dt>Αρχεία</dt>
      <dd>
        Στο {state.settings.outputDir || boot.outputDir}, εκτός αν διάλεξες άλλο στους <b>Φακέλους αρχείων</b>
        {' παρακάτω.'}
      </dd>
      <dt>Δεδομένα</dt>
      <dd>
        {boot.dataDir}{' '}
        <Button variant="link" onClick={() => window.api.openFolder('data')}>
          Άνοιξε
        </Button>
      </dd>
      <dt>Αντίγραφα</dt>
      <dd>
        {BACKUP_NOTE}
        <Button
          variant="link"
          onClick={async () => {
            const r = await window.api.backup();
            toast({
              text: r.ok ? 'Κρατήθηκε αντίγραφο της βάσης' : 'Δεν κρατήθηκε αντίγραφο: ' + r.error,
              actions: [{ label: 'Φάκελος', fn: () => window.api.openFolder('backups') }],
            });
          }}
        >
          Αντίγραφο τώρα
        </Button>
      </dd>
      <dt>Έκδοση</dt>
      <dd>{boot.version}</dd>
    </dl>
  );
}

/** «Μονάδα και έντυπα». */
export function SettingsCard() {
  const m = useUnit();
  const { s, setS, setKind, save } = m;
  return (
    <Card title="Μονάδα και έντυπα">
      <UnitKindField value={s.unitKind} onChange={setKind} />
      {headerLines(m)}
      <HkHeadFields
        value={s.head}
        onChange={(head: string[]) => setS({ ...s, head })}
        kind={s.unitKind}
        inSettings={true}
      />
      <div className="field-row">
        <div className="field">
          <label className="field__label" htmlFor="st-un">
            Μονάδα στον τίτλο της {HK()}
          </label>
          <input
            id="st-un"
            className="ui-input"
            value={s.unitName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setS({ ...s, unitName: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="st-pl">
            Τόπος (υπογραφές)
          </label>
          <input
            id="st-pl"
            className="ui-input"
            value={s.place}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setS({ ...s, place: e.target.value })}
          />
        </div>
      </div>
      {cadreCounts(m)}
      <p className="note" style={{ margin: 0 }}>
        Οι θάλαμοι εξόδου του Σαββατοκύριακου είναι στους <b>Θαλάμους και ουλαμούς</b>.
      </p>
      <div>
        <Button onClick={save}>Αποθήκευση ρυθμίσεων</Button>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
      {whereList(m)}
    </Card>
  );
}
