// The «Ενότητες της ΗΚΑΙ» card: which sections of the form are open, plus the vehicle and «Προβλέπονται» numbers.
// Purpose: `HkaiSectionsCard`; what stays the same every day (a closed section is not shown and not written).
// Does NOT: hold state (model/useHkaiSections.ts) or the number rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// @decision Michael 17/10: sections of the ΗΚΑΙ can be switched off.
// Covering test: test/screens-main.test.ts.
import { Button, Card } from '../../../shared/ui';
import { HK_SECTIONS, hkOn } from '../../../../shared/domain';
import { hkRowList } from '../../../../shared/ranks';
import { HK, UNIT, hkRowLabel } from '../../../../shared/unit';
import { useHkaiSections } from '../model/useHkaiSections';
import { VEHICLE_FIELDS, parseCount, withProvided } from '../model/view';

/** The card, with no props: it is the same for every day. */
export function HkaiSectionsCard() {
  const { state, toast, cur, veh, setVeh, prov, setProv, save, toggle, vehDirty, provDirty } = useHkaiSections();
  return (
    <Card title={'Ενότητες της ' + HK()}>
      <p className="note" style={{ marginTop: 0 }}>
        Κλείσε όσα {UNIT().nom === 'Λόχος' ? 'ο Λόχος' : 'η Ίλη'} δεν συμπληρώνει (π.χ. οχήματα, αν δεν έχετε): δεν
        φαίνονται εδώ και δεν γράφονται στο έντυπο.
      </p>
      {HK_SECTIONS.map(([k, l, help]) => (
        <label key={k} className="rule">
          <input
            type="checkbox"
            className="ui-check"
            checked={hkOn(state.settings, k)}
            onChange={(e) => toggle(k, e.target.checked)}
          />
          <span>
            <b>{l}</b>
            <small>{help}</small>
          </span>
        </label>
      ))}
      {hkOn(state.settings, 'veh') && (
        <div className="field" style={{ marginTop: '10px' }}>
          <span className="field__label">Όχημα (ίδιο κάθε μέρα)</span>
          <div className="settings-grid">
            <label className="field">
              <span className="field__help">Είδος</span>
              <input className="ui-input" value={veh.type} onChange={(e) => setVeh({ ...veh, type: e.target.value })} />
            </label>
            {VEHICLE_FIELDS.map(([k, l]) => (
              <label key={k} className="field">
                <span className="field__help">{l}</span>
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  value={veh[k] ?? ''}
                  onChange={(e) => setVeh({ ...veh, [k]: parseCount(e.target.value) })}
                />
              </label>
            ))}
          </div>
          {vehDirty && (
            <div className="toolbar" style={{ marginTop: '6px' }}>
              <Button
                size="sm"
                onClick={async () => {
                  if (await save({ ...cur, veh }, 'όχημα')) toast({ text: 'Αποθηκεύτηκε το όχημα της ' + HK() });
                }}
              >
                Αποθήκευση
              </Button>
            </div>
          )}
        </div>
      )}
      {hkOn(state.settings, 'prov') && (
        <div className="field" style={{ marginTop: '10px' }}>
          <span className="field__label">Προβλέπονται από τη σύνθεση</span>
          <div className="settings-grid">
            {hkRowList(state.settings.lists).map((r) => (
              <label key={r} className="field">
                <span className="field__help">{hkRowLabel(r)}</span>
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={prov[r] || ''}
                  onChange={(e) => setProv(withProvided(prov, r, parseCount(e.target.value)))}
                />
              </label>
            ))}
          </div>
          {provDirty && (
            <div className="toolbar" style={{ marginTop: '6px' }}>
              <Button
                size="sm"
                onClick={async () => {
                  if (await save({ ...cur, prov }, 'προβλέπονται')) toast({ text: 'Αποθηκεύτηκαν τα «Προβλέπονται»' });
                }}
              >
                Αποθήκευση
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
