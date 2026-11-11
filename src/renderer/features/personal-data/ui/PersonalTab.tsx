// The «Προσωπικά» tab of a soldier's or cadre member's card (Michael, 3/11).
// Purpose: `PersonalTab` draws IBAN, ΑΜΚΑ, ΑΦΜ (+ for soldiers: e-mail, relative's e-mail, blood group). They show only here (not in
//   forms, not on other screens); soldiers' are also written to the Δυναμολόγιο Excel, the cadre's to their own Excel.
// Does NOT: hold state or save (model/usePersonal.ts). The checks only warn.
// Owner layer: renderer/features/personal-data. Why: moved verbatim from screens/personal.ts (Phase 5.3c); both sheets use it.
// Covering test: test/personal.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Select, type ValueEvent } from '../../../shared/ui';
import {
  BLOOD_GROUPS,
  PFIELDS,
  showPersonal,
  warnPersonal,
  XFIELDS,
  type Extras,
  type Personal,
} from '../../../../shared/personal';
import { usePersonal, type Personal_, type PersonalWho } from '../model/usePersonal';

/** Props of `PersonalTab`. */
export interface PersonalTabProps {
  who: PersonalWho;
  /** The person or the cadre member (mount with a key per person, so it starts again for each). */
  rec: Personal & Extras;
}

/** The IBAN, ΑΜΚΑ and ΑΦΜ fields, each with its warning or «Αποθηκεύτηκε». */
function personalBasic(d: Personal_) {
  const { f, setF, saved, setSaved, save } = d;
  return (
    <>
      {PFIELDS.map((x) => {
        const w = warnPersonal(x.k, f[x.k]);
        return (
          <div className="field" key={x.k}>
            <label className="field__label" htmlFor={'pr-' + x.k}>
              {x.label}
            </label>
            <input
              id={'pr-' + x.k}
              className="ui-input num"
              autoComplete="off"
              spellCheck={false}
              placeholder={x.ph}
              value={f[x.k]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setSaved(null);
                setF({ ...f, [x.k]: e.target.value });
              }}
              onBlur={() => {
                setF((c) => ({ ...c, [x.k]: showPersonal(x.k, c[x.k]) }));
                void save(x.k);
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            {w ? (
              <span className="field__help" data-warn="" style={{ color: 'var(--warn, #b45309)' }}>
                {w} (αποθηκεύεται κι έτσι)
              </span>
            ) : saved === x.k ? (
              <span className="field__help">Αποθηκεύτηκε</span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** The soldiers-only fields (e-mail, relative's e-mail, blood group) after a rule. */
function personalExtra(d: Personal_, who: PersonalWho) {
  const { run, f, setF, saved, setSaved, save } = d;
  return (
    <>
      <hr data-extra-sep="" style={{ border: 0, borderTop: '1px solid var(--line, #d4d4d8)', margin: '2px 0' }} />
      <div data-extra="" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        {XFIELDS.map((x) => (
          <div className="field" key={x.k}>
            <label className="field__label" htmlFor={'pr-' + x.k}>
              {x.label}
            </label>
            {x.k === 'blood' ? (
              <Select
                id="pr-blood"
                className="ui-input"
                value={f.blood}
                onChange={async (e: ValueEvent) => {
                  const v = e.target.value;
                  setSaved(null);
                  setF((c) => ({ ...c, blood: v }));
                  if (await run({ t: 'setPersonal', ...who, blood: v }, false)) setSaved('blood');
                }}
              >
                <option value="">—</option>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                {f.blood && !BLOOD_GROUPS.includes(f.blood) ? <option value={f.blood}>{f.blood}</option> : null}
              </Select>
            ) : (
              <input
                id={'pr-' + x.k}
                className="ui-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={x.ph}
                value={f[x.k]}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setSaved(null);
                  setF({ ...f, [x.k]: e.target.value });
                }}
                onBlur={() => {
                  setF((c) => ({ ...c, [x.k]: c[x.k].trim() }));
                  void save(x.k);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            )}
            {saved === x.k ? <span className="field__help">Αποθηκεύτηκε</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}

/** Tab «Προσωπικά» στην καρτέλα οπλίτη και στελέχους. who: { pid } ή { cid }, rec: το άτομο ή το στέλεχος. */
export function PersonalTab({ who, rec }: PersonalTabProps) {
  const d = usePersonal(who, rec);
  const { soldier } = d;
  return (
    <div
      data-personal=""
      style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: soldier ? '560px' : '440px' }}
    >
      {personalBasic(d)}
      {soldier && personalExtra(d, who)}
      <p className="note" style={{ margin: 0 }}>
        {who.cid != null
          ? 'Γράφονται στο δικό τους Excel των στελεχών (Ρυθμίσεις › Αρχεία Excel › Στελέχη), στις στήλες IBAN, ΑΜΚΑ, ΑΦΜ που μπαίνουν μόνες τους στο τέλος του πίνακα. Δεν μπαίνουν σε εκτυπώσεις και δεν εμφανίζονται σε άλλη οθόνη.'
          : 'IBAN, ΑΜΚΑ, ΑΦΜ: μόνο στο Excel του Δυναμολογίου (στήλες που μπαίνουν μόνες τους στο τέλος του πίνακα), όχι σε εκτυπώσεις. E-mail, e-mail συγγενή και ομάδα αίματος: και στο φύλλο ΘΑΛΑΜΟΙ, και στα Έντυπα ως στήλες.'}
      </p>
    </div>
  );
}
