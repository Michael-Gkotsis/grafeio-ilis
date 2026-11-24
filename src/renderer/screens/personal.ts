// Tab «Προσωπικά» στην καρτέλα οπλίτη και στελέχους (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ (+ για οπλίτες: e-mail, e-mail συγγενή, ομάδα αίματος). Φαίνονται μόνο εδώ (ούτε έντυπα, ούτε άλλες
// οθόνες)· των οπλιτών γράφονται και στο Excel του Δυναμολογίου (στήλες IBAN, ΑΜΚΑ, ΑΦΜ, Michael 3/11), των στελεχών στο δικό τους Excel (ΣΤΕΛΕΧΗ, Αρχεία Excel). Αποθηκεύονται μόνα τους όταν βγεις από το πεδίο ή φύγεις από την καρτέλα·
// ο έλεγχος (ψηφία κ.λπ.) μόνο προειδοποιεί, δεν εμποδίζει.
import { useEffect, useRef, useState } from 'react';
import { html, Button } from '../ui';
import { useStore } from '../store';
import { Select } from '../select';
import { DateField } from '../common';
import { isUnit } from '../../shared/mode';
import { listOf, itemKey } from '../../shared/ranks';
import { BLOOD_GROUPS, PFIELDS, XFIELDS, normExtra, normPersonal, showPersonal, warnPersonal, type Extras, type Personal, type PKey, type XKey } from '../../shared/personal';

type P = any;
type Key = PKey | XKey;
type Rec = Personal & Extras & { religion?: string; eid?: string; eke?: { from?: string; to?: string } };
const draftOf = (rec: Rec): Record<Key, string> => ({ iban: showPersonal('iban', rec.iban), amka: showPersonal('amka', rec.amka), afm: showPersonal('afm', rec.afm), email: rec.email || '', relEmail: rec.relEmail || '', blood: rec.blood || '' });
const isX = (k: Key): k is XKey => k === 'email' || k === 'relEmail' || k === 'blood';
const norm1 = (k: Key, v: unknown) => (isX(k) ? normExtra(k, v) : normPersonal(k, v));

// who: { pid } ή { cid }, rec: το άτομο ή το στέλεχος (key=id στον γονιό, ώστε να ξαναρχίζει σε κάθε άλλο άτομο)
export function PersonalTab({ who, rec }: P) {
  const { run, state, today } = useStore();
  const [f, setF] = useState(() => draftOf(rec));
  const [saved, setSaved] = useState<Key | 'religion' | 'eid' | 'eke' | null>(null);
  const lists = useStore().state.settings.lists;
  const [rel, setRel] = useState(rec.religion || '');   // θρήσκευμα (Michael, 18/11): επιλογή από τη λίστα Ρυθμίσεις › Λίστες, αποθηκεύεται μόλις διαλέξεις
  const religions = listOf(lists, 'religions');
  const [eid, setEid] = useState(rec.eid || '');   // ειδικότητα (Michael, 24/11): επιλογή από τη λίστα Ρυθμίσεις › Λίστες › Ειδικότητες
  const eids = listOf(lists, 'eids');
  const soldier = who.pid != null;   // e-mail και ομάδα αίματος: μόνο οπλίτες
  const eke = soldier && isUnit(state.settings);   // Σε ΕΚΕ (Michael, 24/11): μόνο οπλίτες, μόνο λειτουργία μονάδας· αποθηκεύεται μόλις αλλάξει
  const setEke = async (from?: string, to?: string) => { setSaved(null); if (await run({ t: 'setEke', pid: who.pid, ...(from ? { from } : {}), ...(to ? { to } : {}) }, false)) setSaved('eke'); };
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
    <div className="field" data-eid="">
      <label className="field__label" htmlFor="pr-eid">Ειδικότητα</label>
      <${Select} id="pr-eid" className="ui-input" value=${eid}
        onChange=${async (e: any) => { const v = e.target.value; setSaved(null); setEid(v); if (await run({ t: 'setPersonal', ...who, eid: v }, false)) setSaved('eid'); }}>
        <option value="">— (δεν έχει δηλωθεί)</option>
        ${eids.map(g => html`<option key=${g} value=${g}>${g}</option>`)}
        ${eid && !eids.some(g => itemKey(g) === itemKey(eid)) ? html`<option value=${eid}>${eid}</option>` : null}
      <//>
      ${saved === 'eid' ? html`<span className="field__help">Αποθηκεύτηκε</span>` : html`<span className="field__help">Η λίστα συμπληρώνεται στις Ρυθμίσεις › Λίστες › Ειδικότητες. Δεν επηρεάζει υπηρεσίες ή ΗΚΑΙ.</span>`}
    </div>
    ${eke && html`<div className="field" data-eke="">
      <label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!rec.eke} onChange=${(e: any) => (e.target.checked ? setEke(today) : setEke())}/>Σε ΕΚΕ (εκπαίδευση ειδικότητας)</label>
      ${rec.eke && html`<div className="field-row">
        <div className="field"><label className="field__label" htmlFor="pr-eke-from">Από</label><${DateField} id="pr-eke-from" className="ui-input" max=${rec.eke.to} value=${rec.eke.from || ''} onChange=${(e: any) => e.target.value && setEke(e.target.value, rec.eke?.to)}/></div>
        <div className="field"><label className="field__label" htmlFor="pr-eke-to">Έως <small className="muted">(προαιρετικό)</small></label><${DateField} id="pr-eke-to" className="ui-input" min=${rec.eke.from} value=${rec.eke.to || ''} onChange=${(e: any) => e.target.value && setEke(rec.eke?.from, e.target.value)}/>
          ${rec.eke.to && rec.eke.from && html`<${Button} variant="link" onClick=${() => setEke(rec.eke?.from)}>Χωρίς «Έως»<//>`}</div>
      </div>`}
      ${saved === 'eke' ? html`<span className="field__help">Αποθηκεύτηκε</span>` : html`<span className="field__help">Μόνο για να ξέρουμε και να το βγάζεις στα Έντυπα. Δεν αλλάζει υπηρεσίες, έξοδο ή ΗΚΑΙ. Το «Έως» είναι προαιρετικό (αν δεν το ξέρεις ακόμα).</span>`}
    </div>`}
    <div className="field" data-religion="">
      <label className="field__label" htmlFor="pr-religion">Θρήσκευμα</label>
      <${Select} id="pr-religion" className="ui-input" value=${rel}
        onChange=${async (e: any) => { const v = e.target.value; setSaved(null); setRel(v); if (await run({ t: 'setPersonal', ...who, religion: v }, false)) setSaved('religion'); }}>
        <option value="">— (δεν έχει δηλωθεί)</option>
        ${religions.map(g => html`<option key=${g} value=${g}>${g}</option>`)}
        ${rel && !religions.some(g => itemKey(g) === itemKey(rel)) ? html`<option value=${rel}>${rel}</option>` : null}
      <//>
      ${saved === 'religion' ? html`<span className="field__help">Αποθηκεύτηκε</span>` : html`<span className="field__help">Η λίστα συμπληρώνεται στις Ρυθμίσεις › Λίστες › Θρησκεύματα. Δεν επηρεάζει υπηρεσίες ή ΗΚΑΙ.</span>`}
    </div>
    <p className="note" style=${{ margin: 0 }}>${who.cid != null ? 'Γράφονται στο δικό τους Excel των στελεχών (Ρυθμίσεις › Αρχεία Excel › Στελέχη), στις στήλες IBAN, ΑΜΚΑ, ΑΦΜ που μπαίνουν μόνες τους στο τέλος του πίνακα. Δεν μπαίνουν σε εκτυπώσεις και δεν εμφανίζονται σε άλλη οθόνη.' : 'IBAN, ΑΜΚΑ, ΑΦΜ: μόνο στο Excel του Δυναμολογίου (στήλες που μπαίνουν μόνες τους στο τέλος του πίνακα), όχι σε εκτυπώσεις. E-mail, e-mail συγγενή και ομάδα αίματος: και στο φύλλο ΘΑΛΑΜΟΙ, και στα Έντυπα ως στήλες.'}</p>
  </div>`;
}
