// «Ρυθμίσεις › Εμφάνιση › Τίτλος και λογότυπο» card: the rank, an own title, the logo and a preview.
// Purpose: `BrandCard` (Michael, 17/10): the title and the logo of the app, by rank or uploaded.
// Does NOT: hold state (model/useBrand.ts) or the rules (model/brandView.ts).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6); the markup, keys and
//   text nodes are exactly what the htm version rendered. The logo button is a plain function, not a component.
// Covering test: test/screens-settings-guide.test.ts, test/settings-brand-view.test.ts.
import type { ChangeEvent } from 'react';
import { BRAND_RANKS, DEFAULT_TITLE, LOGO_KINDS, appLogo, appTitle, type LogoKind } from '../../../../../shared/brand';
import { useStore } from '../../../../shared/model';
import { Button, Card, Logo, Select, type ValueEvent } from '../../../../shared/ui';
import { useBrand } from '../../model/useBrand';

type BrandModel = ReturnType<typeof useBrand>;

/** One logo choice: a pressed chip with the picture and its label. */
function opt(m: BrandModel, k: string, label: string, kind: LogoKind, src?: string) {
  return (
    <button
      key={k}
      type="button"
      className="ui-chip"
      aria-pressed={m.logo === k}
      style={{ height: 'auto', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      onClick={() => m.setLogo(k)}
    >
      <Logo size={26} kind={kind} src={src} />
      {label}
    </button>
  );
}

/** The rank list and the own-title box. */
function titleFields(m: BrandModel) {
  const { rank, title, rk } = m;
  return (
    <div className="field-row">
      <div className="field">
        <label className="field__label" htmlFor="br-rank">
          Βαθμός όποιου τη χρησιμοποιεί
        </label>
        <Select id="br-rank" className="ui-select" value={rank} onChange={(e: ValueEvent) => m.setRank(e.target.value)}>
          {BRAND_RANKS.map((r) => (
            <option key={r.rank} value={r.rank}>
              {r.name} · «{r.title}»
            </option>
          ))}
        </Select>
        <span className="field__help">Αλλάζει τον τίτλο και, αν δεν διάλεξες άλλο, το λογότυπο.</span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="br-title">
          Δικός σου τίτλος (προαιρετικά)
        </label>
        <input
          id="br-title"
          className="ui-input"
          value={title}
          placeholder={rk.title}
          maxLength={40}
          onChange={(e: ChangeEvent<HTMLInputElement>) => m.setTitle(e.target.value)}
        />
        <span className="field__help">Κενό = «{rk.title}».</span>
      </div>
    </div>
  );
}

/** The logo choices and the upload button. */
function logoField(m: BrandModel) {
  const { rk, upl } = m;
  return (
    <div className="field">
      <span className="field__label">Λογότυπο</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {opt(m, '', 'Του βαθμού', rk.logo)}
        {LOGO_KINDS.map(([k, l]) => opt(m, k, l, k))}
        {upl && opt(m, upl, 'Δικό σου', rk.logo, upl)}
        <label className="ui-btn ui-btn--outline" style={{ cursor: 'pointer' }}>
          Ανέβασε εικόνα…
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={m.pickFile}
          />
        </label>
      </div>
      <span className="field__help">
        Τα σχέδια είναι ενδεικτικά. Για το ακριβές διακριτικό ή το σήμα της μονάδας ανέβασε δική σου εικόνα (μικραίνει
        σε 128×128).
      </span>
    </div>
  );
}

/** The «Τίτλος και λογότυπο» card of «Ρυθμίσεις». */
export function BrandCard() {
  const m = useBrand();
  const { state } = useStore();
  return (
    <Card title="Τίτλος και λογότυπο">
      {titleFields(m)}
      {logoField(m)}
      <div
        className="brand-preview"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          width: 'fit-content',
          margin: '4px 0 12px',
        }}
      >
        <Logo size={30} {...appLogo(m.draft)} />
        <b style={{ fontSize: '15px' }}>{appTitle(m.draft)}</b>
        <span className="muted" style={{ fontSize: '12px' }}>
          {state.settings.unit[2] || ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button onClick={m.save}>Αποθήκευση</Button>
        {m.stored && (
          <Button variant="outline" onClick={m.reset}>
            Όπως ήταν («{DEFAULT_TITLE}»)
          </Button>
        )}
      </div>
    </Card>
  );
}
