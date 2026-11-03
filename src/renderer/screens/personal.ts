// Tab «Προσωπικά» στην καρτέλα οπλίτη και στελέχους (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ. Γράφονται μόνο εδώ και φαίνονται μόνο εδώ
// (ούτε Excel, ούτε έντυπα, ούτε άλλες οθόνες). Αποθηκεύονται μόνα τους όταν βγεις από το πεδίο ή φύγεις από την καρτέλα·
// ο έλεγχος (ψηφία κ.λπ.) μόνο προειδοποιεί, δεν εμποδίζει.
import { useEffect, useRef, useState } from 'react';
import { html } from '../ui';
import { useStore } from '../store';
import { PFIELDS, normPersonal, showPersonal, warnPersonal, type Personal, type PKey } from '../../shared/personal';

type P = any;
const draftOf = (rec: Personal): Record<PKey, string> => ({ iban: showPersonal('iban', rec.iban), amka: showPersonal('amka', rec.amka), afm: showPersonal('afm', rec.afm) });

// who: { pid } ή { cid }, rec: το άτομο ή το στέλεχος (key=id στον γονιό, ώστε να ξαναρχίζει σε κάθε άλλο άτομο)
export function PersonalTab({ who, rec }: P) {
  const { run } = useStore();
  const [f, setF] = useState(() => draftOf(rec));
  const [saved, setSaved] = useState<PKey | null>(null);
  const live = useRef({ f, rec, who, run }); live.current = { f, rec, who, run };
  const save = async (k: PKey) => {
    const { f: cur, rec: r, who: w, run: go } = live.current;
    const v = normPersonal(k, cur[k]);
    if (v === (r[k as keyof Personal] || '')) return;
    if (await go({ t: 'setPersonal', ...w, [k]: v }, false)) setSaved(k);
  };
  // φεύγει από την καρτέλα με πεδίο που γράφτηκε και δεν «έχασε» ακόμα την εστίαση: αποθηκεύεται κι αυτό
  useEffect(() => () => {
    const { f: cur, rec: r, who: w, run: go } = live.current;
    const patch: Personal = {};
    for (const x of PFIELDS) { const v = normPersonal(x.k, cur[x.k]); if (v !== (r[x.k] || '')) patch[x.k] = v; }
    if (Object.keys(patch).length) void go({ t: 'setPersonal', ...w, ...patch }, false);
  }, []);
  return html`<div data-personal="" style=${{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '440px' }}>
    ${PFIELDS.map(x => { const w = warnPersonal(x.k, f[x.k]); return html`<div className="field" key=${x.k}>
      <label className="field__label" htmlFor=${'pr-' + x.k}>${x.label}</label>
      <input id=${'pr-' + x.k} className="ui-input num" autoComplete="off" spellCheck=${false} placeholder=${x.ph} value=${f[x.k]}
        onChange=${(e: any) => { setSaved(null); setF({ ...f, [x.k]: e.target.value }); }}
        onBlur=${() => { setF(c => ({ ...c, [x.k]: showPersonal(x.k, c[x.k]) })); void save(x.k); }}
        onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>
      ${w ? html`<span className="field__help" data-warn="" style=${{ color: 'var(--warn, #b45309)' }}>${w} (αποθηκεύεται κι έτσι)</span>` : saved === x.k ? html`<span className="field__help">Αποθηκεύτηκε</span>` : null}
    </div>`; })}
    <p className="note" style=${{ margin: 0 }}>Φαίνονται μόνο εδώ, στην καρτέλα. Δεν γράφονται σε Excel ή εκτυπώσεις και δεν εμφανίζονται σε άλλη οθόνη.</p>
  </div>`;
}
