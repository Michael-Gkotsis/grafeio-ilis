// Ρυθμίσεις › Μητρώο οπλισμού και υλικού (Michael, 17/11, φάση 4): κατηγορίες (όνομα, είδος, τύποι, πεδία, συντήρηση κάθε Ν μήνες),
// λέξεις θέσης (λέξη → τι σημαίνει) και μέρες προειδοποίησης. Όλα είναι δεδομένα του χρήστη (settings.assets), όχι κώδικας:
// ό,τι βάλεις εδώ φαίνεται στο Μητρώο και στο Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ». Η κατηγορία με εγγραφές μπορεί να σβηστεί (προειδοποιεί, δεν μπλοκάρει).
import { useState } from 'react';
import { html, Alert, Badge, Button, Card, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { PLACE_MEANS, assetCfgOf, defaultCats, DEFAULT_PLACES, ASSET_WARN_DAYS, newAssetCatId, registry } from '../../shared/assets';
import type { AssetCat, PlaceWord } from '../../shared/domain';

interface CatF { id: string; name: string; kind: AssetCat['kind']; every: string; types: string; fields: string; everyKm: string; hours: boolean; fieldIds: Record<string, string> }
const KINDS: [AssetCat['kind'], string][] = [['weapon', 'Όπλα'], ['material', 'Υλικό'], ['vehicle', 'Οχήματα (οθόνη «Οχήματα»)']];
const toF = (c: AssetCat): CatF => ({ id: c.id, name: c.name, kind: c.kind, every: c.every ? String(c.every) : '', types: c.types.join('\n'), fields: c.fields.map(x => x.name).join('\n'), everyKm: c.everyKm ? String(c.everyKm) : '', hours: !!c.hours, fieldIds: Object.fromEntries(c.fields.map(x => [x.name, x.id])) });
const lines = (t: string) => { const o: string[] = []; for (const l of t.split('\n')) { const v = l.replace(/\s+/g, ' ').trim(); if (v && !o.some(x => x.toLowerCase() === v.toLowerCase())) o.push(v); } return o; };
const toCat = (f: CatF): AssetCat => {
  const used = new Set<string>(); const fields = lines(f.fields).map(name => { let id = f.fieldIds[name]; if (!id || used.has(id)) { let n = 1; while (used.has('f' + n) || Object.values(f.fieldIds).includes('f' + n)) n++; id = 'f' + n; } used.add(id); return { id, name }; });
  const every = Math.floor(Number(String(f.every).replace(',', '.'))); const c: AssetCat = { id: f.id, name: f.name.trim(), kind: f.kind, types: lines(f.types), fields };
  const km = Math.floor(Number(String(f.everyKm).replace(/\./g, '').replace(',', '.')));
  if (every > 0) c.every = every; if (f.kind === 'vehicle') { if (km > 0) c.everyKm = km; if (f.hours) c.hours = true; } return c;
};
const fromState = (st: any) => { const c = assetCfgOf(st); return { cats: c.cats.map(toF), places: c.places.map(p => ({ ...p })), warn: String(c.warnDays) }; };

export function AssetsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const [f, setF] = useState(() => fromState(state.settings));
  const dirty = JSON.stringify(f) !== JSON.stringify(fromState(state.settings));
  const used = (id: string) => registry(state).filter(r => r.a.cat === id).length;
  const bad = !f.cats.length || f.cats.some(c => !c.name.trim()) || f.places.some(p => !p.word.trim()) || !(Number(f.warn) >= 0);
  const setC = (id: string, patch: Partial<CatF>) => setF({ ...f, cats: f.cats.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const setP = (i: number, patch: Partial<PlaceWord>) => setF({ ...f, places: f.places.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const save = async () => {
    if (bad) return false;
    const cfg = { cats: f.cats.map(toCat), places: f.places.map(p => ({ word: p.word.trim().toUpperCase(), means: p.means, ...(p.note?.trim() ? { note: p.note.trim() } : {}) })), warnDays: Math.floor(Number(f.warn)) };
    const ok = await run({ t: 'setSettings', settings: { assets: cfg }, text: 'μητρώο οπλισμού και υλικού (' + cfg.cats.length + ' κατηγορίες)' }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι ρυθμίσεις του μητρώου' });
    return ok;
  };
  usePending(dirty, { label: 'Μητρώο οπλισμού και υλικού', save, discard: () => setF(fromState(state.settings)) });
  const reset = () => setF({ cats: defaultCats(state.settings.lists).map(toF), places: DEFAULT_PLACES.map(p => ({ ...p })), warn: String(ASSET_WARN_DAYS) });
  return html`<div className="stack" data-assets-set="">
    <p className="note" style=${{ margin: 0 }}>Το <b>Μητρώο</b> του Οπλισμού κρατά όπλα και υλικό, και η οθόνη <b>Οχήματα</b> τα οχήματα (κατηγορίες είδους «Οχήματα»). Οι κατηγορίες, οι τύποι και τα πεδία τους είναι δικά σου: ό,τι γράψεις εδώ φαίνεται στο Μητρώο και στο Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ». Δεν αλλάζει τα υπάρχοντα Excel.</p>
    ${f.cats.map(c => html`<${Card} key=${c.id} title=${html`${c.name || 'Νέα κατηγορία'} <${Badge} tone="outline">${used(c.id)} είδη<//>`}
      actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, cats: f.cats.filter(x => x.id !== c.id) })} data-tip=${used(c.id) ? 'Έχει ' + used(c.id) + ' είδη: θα φαίνονται χωρίς κατηγορία (δεν σβήνονται)' : 'Σβήσε την κατηγορία'}>Σβήσε<//>`}>
      <div className="field-row">
        <div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${'ac-n-' + c.id}>Όνομα</label><input id=${'ac-n-' + c.id} className="ui-input" value=${c.name} placeholder="π.χ. Τυφέκια" onChange=${(e: any) => setC(c.id, { name: e.target.value })}/></div>
        <div className="field"><label className="field__label" htmlFor=${'ac-k-' + c.id}>Είδος</label><${Select} id=${'ac-k-' + c.id} className="ui-input" value=${c.kind} onChange=${(e: any) => setC(c.id, { kind: e.target.value })}>${KINDS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}<//></div>
        <div className="field"><label className="field__label" htmlFor=${'ac-e-' + c.id}>Συντήρηση κάθε (μήνες)</label><input id=${'ac-e-' + c.id} className="ui-input" type="number" min="0" max="120" style=${{ maxWidth: '90px' }} value=${c.every} onChange=${(e: any) => setC(c.id, { every: e.target.value })}/></div>
        ${c.kind === 'vehicle' && html`<div className="field"><label className="field__label" htmlFor=${'ac-km-' + c.id}>Συντήρηση κάθε N ${c.hours ? 'ώρες' : 'χλμ'}</label><input id=${'ac-km-' + c.id} className="ui-input" type="number" min="0" style=${{ maxWidth: '110px' }} value=${c.everyKm} placeholder="5000" onChange=${(e: any) => setC(c.id, { everyKm: e.target.value })}/></div>
        <label className="check" style=${{ alignSelf: 'end', paddingBottom: '8px' }} data-tip="Για ερπυστριοφόρα: η ένδειξη είναι ώρες κινητήρα και φαίνεται «ώρ.» αντί για «χλμ»"><input type="checkbox" checked=${c.hours} onChange=${(e: any) => setC(c.id, { hours: e.target.checked })}/><span>Μετρά ώρες κινητήρα</span></label>`}</div>
      <div className="field-row">
        <div className="field"><label className="field__label" htmlFor=${'ac-t-' + c.id}>Τύποι (ένας ανά γραμμή)</label><textarea id=${'ac-t-' + c.id} className="ui-input" rows="3" value=${c.types} placeholder="G3A3" onChange=${(e: any) => setC(c.id, { types: e.target.value })}/></div>
        <div className="field"><label className="field__label" htmlFor=${'ac-f-' + c.id}>Πεδία της κατηγορίας (ένα ανά γραμμή)</label><textarea id=${'ac-f-' + c.id} className="ui-input" rows="3" value=${c.fields} placeholder="π.χ. Αριθμός κάνης" onChange=${(e: any) => setC(c.id, { fields: e.target.value })}/></div></div><//>`)}
    <div><${Button} variant="outline" onClick=${() => setF({ ...f, cats: [...f.cats, { id: newAssetCatId(f.cats.map(toCat)), name: '', kind: 'material', every: '', types: '', fields: '', everyKm: '', hours: false, fieldIds: {} }] })}>+ Κατηγορία<//></div>
    <${Card} title="Λέξεις θέσης">
      <p className="note" style=${{ margin: '0 0 8px' }}>Η πρώτη λέξη της θέσης (π.χ. «ΚΙΒΩΤΙΟ 53» → ΚΙΒΩΤΙΟ) λέει τι σημαίνει. Χρησιμεύουν στα φίλτρα και στα αρχεία άλλων μονάδων. Η λέξη «Οπλοβαστός» είναι αυτή που γράφεται στο Excel για τα όπλα με θέση οπλοβαστού.</p>
      ${f.places.map((p, i) => html`<div className="field-row" key=${i}>
        <div className="field"><label className="field__label" htmlFor=${'pw-w-' + i}>Λέξη</label><input id=${'pw-w-' + i} className="ui-input" value=${p.word} placeholder="π.χ. ΚΙΒΩΤΙΟ" onChange=${(e: any) => setP(i, { word: e.target.value })}/></div>
        <div className="field"><label className="field__label" htmlFor=${'pw-m-' + i}>Σημαίνει</label><${Select} id=${'pw-m-' + i} className="ui-input" value=${p.means} onChange=${(e: any) => setP(i, { means: e.target.value })}>${PLACE_MEANS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}<//></div>
        <div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${'pw-n-' + i}>Σημείωση</label><input id=${'pw-n-' + i} className="ui-input" value=${p.note || ''} onChange=${(e: any) => setP(i, { note: e.target.value })}/></div>
        <${Button} size="sm" variant="ghost" style=${{ alignSelf: 'end' }} onClick=${() => setF({ ...f, places: f.places.filter((_, j) => j !== i) })}>Σβήσε<//></div>`)}
      <div><${Button} size="sm" variant="outline" onClick=${() => setF({ ...f, places: [...f.places, { word: '', means: 'other' }] })}>+ Λέξη θέσης<//></div><//>
    <${Card} title="Προειδοποίηση συντήρησης">
      <div className="field"><label className="field__label" htmlFor="as-warn">Προειδοποίηση συντήρησης πριν από (μέρες)</label><input id="as-warn" className="ui-input" type="number" min="0" max="365" style=${{ maxWidth: '110px' }} value=${f.warn} onChange=${(e: any) => setF({ ...f, warn: e.target.value })}/></div>
      <p className="note" style=${{ margin: 0 }}>Το φίλτρο «Συντήρηση σε N μέρες» του Μητρώου δείχνει και όσα έχουν περάσει την ημερομηνία.</p><//>
    ${bad && html`<${Alert} tone="warn">Κάθε κατηγορία και κάθε λέξη θέσης θέλει όνομα· χρειάζεται τουλάχιστον μία κατηγορία.<//>`}
    <div style=${{ display: 'flex', gap: '8px' }}><${Button} disabled=${!dirty || bad} onClick=${save}>Αποθήκευση<//><${Button} variant="outline" disabled=${!dirty} onClick=${() => setF(fromState(state.settings))}>Άκυρο<//><span style=${{ flex: 1 }}></span><${Button} variant="ghost" onClick=${reset} data-tip="Βάζει ξανά τις κατηγορίες και τις λέξεις θέσης της εφαρμογής (αποθηκεύεται με «Αποθήκευση»)">Επαναφορά προεπιλογών<//></div>
  </div>`;
}
