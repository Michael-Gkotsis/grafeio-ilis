// Tab «Προσωπικά» στην καρτέλα οπλίτη και στελέχους (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ (+ για οπλίτες: e-mail, e-mail συγγενή, ομάδα αίματος). Φαίνονται μόνο εδώ (ούτε έντυπα, ούτε άλλες
// οθόνες)· των οπλιτών γράφονται και στο Excel του Δυναμολογίου (στήλες IBAN, ΑΜΚΑ, ΑΦΜ, Michael 3/11), των στελεχών στο δικό τους Excel (ΣΤΕΛΕΧΗ, Αρχεία Excel). Αποθηκεύονται μόνα τους όταν βγεις από το πεδίο ή φύγεις από την καρτέλα·
// ο έλεγχος (ψηφία κ.λπ.) μόνο προειδοποιεί, δεν εμποδίζει.
import { useEffect, useRef, useState } from 'react';
import { html } from '../ui';
import { useStore } from '../store';
import { Select } from '../select';
import { BLOOD_GROUPS, PFIELDS, XFIELDS, normExtra, normPersonal, showPersonal, warnPersonal, type Extras, type Personal, type PKey, type XKey } from '../../shared/personal';

type P = any;
type Key = PKey | XKey;
type Rec = Personal & Extras;
const draftOf = (rec: Rec): Record<Key, string> => ({ iban: showPersonal('iban', rec.iban), amka: showPersonal('amka', rec.amka), afm: showPersonal('afm', rec.afm), email: rec.email || '', relEmail: rec.relEmail || '', blood: rec.blood || '' });
const isX = (k: Key): k is XKey => k === 'email' || k === 'relEmail' || k === 'blood';
const norm1 = (k: Key, v: unknown) => (isX(k) ? normExtra(k, v) : normPersonal(k, v));

// who: { pid } ή { cid }, rec: το άτομο ή το στέλεχος (key=id στον γονιό, ώστε να ξαναρχίζει σε κάθε άλλο άτομο)
export function PersonalTab({ who, rec }: P) {
  const { run } = useStore();
  const [f, setF] = useState(() => draftOf(rec));
  const [saved, setSaved] = useState<Key | null>(null);
  const soldier = who.pid != null;   // e-mail και ομάδα αίματος: μόνο οπλίτες
  const live = useRef({ f, rec, who, run }); live.current = { f, rec, who, run };
  const save = async (k: Key) => {
    const { f: cur, rec: r, who: w, run: go } = live.current;
    const v = norm1(k, cur[k]);
    if (v === ((r as any)[k] || '')) return;
    if (await go({ t: 'setPersonal', ...w, [k]: v }, false)) setSaved(k);
  };
  // φεύγει από την καρτέλα με πεδίο που γράφτηκε και δεν «έχασε» ακόμα την εστίαση: αποθηκεύεται κι αυτό
  useEffect(() => () => {
    const { f: cur, rec: r, who: w, run: go } = live.current;
    const patch: Rec = {};
    for (const x of [...PFIELDS, ...(w.pid != null ? XFIELDS : [])]) { const v = norm1(x.k, cur[x.k]); if (v !== ((r as any)[x.k] || '')) (patch as any)[x.k] = v; }
    if (Object.keys(patch).length) void go({ t: 'setPersonal', ...w, ...patch }, false);
  }, []);
  return html`<div data-personal="" style=${{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: soldier ? '560px' : '440px' }}>
    ${PFIELDS.map(x => { const w = warnPersonal(x.k, f[x.k]); return html`<div className="field" key=${x.k}>
      <label className="field__label" htmlFor=${'pr-' + x.k}>${x.label}</label>
      <input id=${'pr-' + x.k} className="ui-input num" autoComplete="off" spellCheck=${false} placeholder=${x.ph} value=${f[x.k]}
        onChange=${(e: any) => { setSaved(null); setF({ ...f, [x.k]: e.target.value }); }}
        onBlur=${() => { setF(c => ({ ...c, [x.k]: showPersonal(x.k, c[x.k]) })); void save(x.k); }}
        onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>
      ${w ? html`<span className="field__help" data-warn="" style=${{ color: 'var(--warn, #b45309)' }}>${w} (αποθηκεύεται κι έτσι)</span>` : saved === x.k ? html`<span className="field__help">Αποθηκεύτηκε</span>` : null}
    </div>`; })}
    ${soldier && html`<hr data-extra-sep="" style=${{ border: 0, borderTop: '1px solid var(--line, #d4d4d8)', margin: '2px 0' }}/>
    <div data-extra="" style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      ${XFIELDS.map(x => html`<div className="field" key=${x.k}>
        <label className="field__label" htmlFor=${'pr-' + x.k}>${x.label}</label>
        ${x.k === 'blood'
          ? html`<${Select} id="pr-blood" className="ui-input" value=${f.blood}
              onChange=${async (e: any) => { const v = e.target.value; setSaved(null); setF(c => ({ ...c, blood: v })); if (await run({ t: 'setPersonal', ...who, blood: v }, false)) setSaved('blood'); }}>
              <option value="">—</option>
              ${BLOOD_GROUPS.map(g => html`<option key=${g} value=${g}>${g}</option>`)}
              ${f.blood && !BLOOD_GROUPS.includes(f.blood) ? html`<option value=${f.blood}>${f.blood}</option>` : null}
            <//>`
          : html`<input id=${'pr-' + x.k} className="ui-input" type="text" autoComplete="off" spellCheck=${false} placeholder=${x.ph} value=${f[x.k]}
              onChange=${(e: any) => { setSaved(null); setF({ ...f, [x.k]: e.target.value }); }}
              onBlur=${() => { setF(c => ({ ...c, [x.k]: c[x.k].trim() })); void save(x.k); }}
              onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>`}
        ${saved === x.k ? html`<span className="field__help">Αποθηκεύτηκε</span>` : null}
      </div>`)}
    </div>`}
    <p className="note" style=${{ margin: 0 }}>${who.cid != null ? 'Γράφονται στο δικό τους Excel των στελεχών (Ρυθμίσεις › Αρχεία Excel › Στελέχη), στις στήλες IBAN, ΑΜΚΑ, ΑΦΜ που μπαίνουν μόνες τους στο τέλος του πίνακα. Δεν μπαίνουν σε εκτυπώσεις και δεν εμφανίζονται σε άλλη οθόνη.' : 'IBAN, ΑΜΚΑ, ΑΦΜ: μόνο στο Excel του Δυναμολογίου (στήλες που μπαίνουν μόνες τους στο τέλος του πίνακα), όχι σε εκτυπώσεις. E-mail, e-mail συγγενή και ομάδα αίματος: και στο φύλλο ΘΑΛΑΜΟΙ, και στα Έντυπα ως στήλες.'}</p>
  </div>`;
}
