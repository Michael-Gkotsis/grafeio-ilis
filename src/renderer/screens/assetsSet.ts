// Ρυθμίσεις › Οπλισμός και υλικό (Michael, 17/11, φάση 4· λίστες με κουμπιά 24/11): αριστερά οι κατηγορίες σε τρεις ομάδες (Όπλα, Υλικό,
// Οχήματα) με πλήθος εγγραφών, δεξιά η κατηγορία που διάλεξες: όνομα, είδος, συντήρηση κάθε Ν μήνες, τύποι, παρελκόμενα που έχει συνήθως
// (με προεπιλεγμένη ποσότητα) και δικά σου πεδία, όλα ως λίστες με ✎ (μετονομασία), ✕ (αφαίρεση) και «+». Μετά οι λέξεις θέσης και οι
// μέρες προειδοποίησης. Όλα είναι δεδομένα του χρήστη (settings.assets): ό,τι βάλεις εδώ φαίνεται στο Μητρώο και στο Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ».
// Η μετονομασία τύπου που υπάρχει ήδη στις ρυθμίσεις γίνεται αμέσως με την εντολή renameAssetType (αλλάζει και τις εγγραφές, μία αναίρεση).
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { PLACE_MEANS, assetCfgOf, cleanAccs, defaultCats, DEFAULT_PLACES, ASSET_WARN_DAYS, newAssetCatId, registry } from '../../shared/assets';
import { normGreek } from '../../shared/text';
import type { AssetCat, PlaceWord } from '../../shared/domain';

interface CatF { id: string; name: string; kind: AssetCat['kind']; every: string; types: string[]; accs: { name: string; qty: string }[]; fields: { id: string; name: string }[]; everyKm: string; hours: boolean }
const KINDS: [AssetCat['kind'], string][] = [['weapon', 'Όπλα'], ['material', 'Υλικό'], ['vehicle', 'Οχήματα']];
const toF = (c: AssetCat): CatF => ({ id: c.id, name: c.name, kind: c.kind, every: c.every ? String(c.every) : '', types: [...c.types], accs: (c.accs || []).map(x => ({ name: x.name, qty: x.qty && x.qty > 1 ? String(x.qty) : '' })), fields: c.fields.map(x => ({ ...x })), everyKm: c.everyKm ? String(c.everyKm) : '', hours: !!c.hours });
const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const uniq = (l: string[]) => { const o: string[] = []; for (const x of l.map(clean)) if (x && !o.some(y => normGreek(y) === normGreek(x))) o.push(x); return o; };
const toCat = (f: CatF): AssetCat => {
  const every = Math.floor(Number(String(f.every).replace(',', '.'))); const c: AssetCat = { id: f.id, name: f.name.trim(), kind: f.kind, types: uniq(f.types), fields: f.fields.filter(x => clean(x.name)).map(x => ({ id: x.id, name: clean(x.name) })) };
  const accs = cleanAccs(f.accs.map(x => ({ name: x.name, qty: Number(x.qty) }))); if (accs.length) c.accs = accs;
  const km = Math.floor(Number(String(f.everyKm).replace(/\./g, '').replace(',', '.')));
  if (every > 0) c.every = every; if (f.kind === 'vehicle') { if (km > 0) c.everyKm = km; if (f.hours) c.hours = true; } return c;
};
const fromState = (st: any) => { const c = assetCfgOf(st); return { cats: c.cats.map(toF), places: c.places.map(p => ({ ...p })), warn: String(c.warnDays) }; };

// Λίστα από «κουμπάκια»: ✎ μετονομασία, ✕ αφαίρεση, «+ …» προσθήκη (ανοίγουν παράθυρο με ένα όνομα)
function Chips({ label, items, addLabel, onEdit, onRemove, onAdd }: { label: string; items: string[]; addLabel: string; onEdit: (i: number) => void; onRemove: (i: number) => void; onAdd: () => void }) {
  return html`<div className="asset-chips" role="group" aria-label=${label}>${items.map((t, i) => html`<span className="asset-chip" key=${i}><span className="asset-chip__t">${t}</span>
    <button type="button" className="asset-chip__b" aria-label=${'Μετονομασία: ' + t} data-tip="Μετονομασία" onClick=${() => onEdit(i)}>✎</button>
    <button type="button" className="asset-chip__b" aria-label=${'Αφαίρεση: ' + t} data-tip="Αφαίρεση" onClick=${() => onRemove(i)}>✕</button></span>`)}
    <button type="button" className="asset-chip asset-chip--add" onClick=${onAdd}>${addLabel}</button></div>`;
}
// Παράθυρο ενός ονόματος (και προαιρετικά ποσότητας) για τύπο, παρελκόμενο ή πεδίο
interface Ask { what: 'type' | 'acc' | 'field'; i: number; name: string; qty: string }
function NameDialog({ ask, title, qty, error, onClose, onOk }: { ask: Ask; title: string; qty?: boolean; error: (name: string) => string; onClose: () => void; onOk: (name: string, qty: string) => void }) {
  const [name, setName] = useState(ask.name); const [q, setQ] = useState(ask.qty);
  const err = clean(name) ? error(clean(name)) : 'Γράψε όνομα'; const go = () => { if (!err) onOk(clean(name), q); };
  return html`<${Dialog} title=${title} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!err} why=${err} onClick=${go}>Εντάξει<//>`}>
    <div className="field-row"><div className="field" style=${{ flex: 3 }}><label className="field__label" htmlFor="an-name">Όνομα</label><input id="an-name" className="ui-input" value=${name} data-autofocus="" onChange=${(e: any) => setName(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') go(); }}/></div>
      ${qty && html`<div className="field"><label className="field__label" htmlFor="an-qty">Ποσότητα (προαιρετικά)</label><input id="an-qty" className="ui-input" type="number" min="1" max="999" value=${q} placeholder="π.χ. 2" onChange=${(e: any) => setQ(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') go(); }}/></div>`}</div><//>`;
}

export function AssetsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const [f, setF] = useState(() => fromState(state.settings));
  const [sel, setSel] = useState(() => f.cats[0]?.id || '');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [del, setDel] = useState<{ kind: 'cat' | 'type'; text: string; ok: () => void } | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(fromState(state.settings));
  const reg = useMemo(() => registry(state), [state]);
  const used = (id: string) => reg.filter(r => r.a.cat === id).length;
  const usedType = (id: string, t: string) => reg.filter(r => r.a.cat === id && normGreek(r.a.type) === normGreek(t)).length;
  const bad = !f.cats.length || f.cats.some(c => !c.name.trim()) || f.places.some(p => !p.word.trim()) || !(Number(f.warn) >= 0);
  const c = f.cats.find(x => x.id === sel) || f.cats[0];
  const setC = (id: string, patch: Partial<CatF>) => setF(p => ({ ...p, cats: p.cats.map(x => (x.id === id ? { ...x, ...patch } : x)) }));
  const setP = (i: number, patch: Partial<PlaceWord>) => setF({ ...f, places: f.places.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const save = async () => {
    if (bad) return false;
    const cfg = { cats: f.cats.map(toCat), places: f.places.map(p => ({ word: p.word.trim().toUpperCase(), means: p.means, ...(p.note?.trim() ? { note: p.note.trim() } : {}) })), warnDays: Math.floor(Number(f.warn)) };
    const ok = await run({ t: 'setSettings', settings: { assets: cfg }, text: 'μητρώο οπλισμού και υλικού (' + cfg.cats.length + ' κατηγορίες)' }, false);
    if (ok) { setF(fromState(ok.settings)); toast({ text: 'Αποθηκεύτηκαν οι ρυθμίσεις του μητρώου' }); }   // η φόρμα ξαναγίνεται όπως αποθηκεύτηκε: αλλιώς μένει η μπάρα «Δεν αποθηκεύτηκαν»
    return ok;
  };
  usePending(dirty, { label: 'Οπλισμός και υλικό', save, discard: () => setF(fromState(state.settings)) });
  const reset = () => { const n = { cats: defaultCats(state.settings.lists).map(toF), places: DEFAULT_PLACES.map(p => ({ ...p })), warn: String(ASSET_WARN_DAYS) }; setF(n); setSel(n.cats[0]?.id || ''); };
  const addCat = () => { const id = newAssetCatId(f.cats.map(toCat)); setF({ ...f, cats: [...f.cats, { id, name: '', kind: 'material', every: '', types: [], accs: [], fields: [], everyKm: '', hours: false }] }); setSel(id); };
  const delCat = (x: CatF) => {
    const n = used(x.id); const go = () => { const rest = f.cats.filter(y => y.id !== x.id); setF({ ...f, cats: rest }); setSel(rest[0]?.id || ''); setDel(null); };
    if (n) setDel({ kind: 'cat', text: 'Η κατηγορία «' + (x.name || 'Νέα κατηγορία') + '» έχει ' + n + ' είδη. Δεν σβήνονται: θα φαίνονται χωρίς κατηγορία.', ok: go }); else go();
  };
  // τύπος: νέος ή μετονομασία. Αν ο τύπος υπάρχει ήδη στις αποθηκευμένες ρυθμίσεις, η μετονομασία γίνεται αμέσως με την εντολή (αλλάζει και τις εγγραφές)
  const putType = async (x: CatF, i: number, name: string) => {
    if (i < 0) { setC(x.id, { types: [...x.types, name] }); return; }
    const from = x.types[i]; const saved = assetCfgOf(state.settings).cats.find(y => y.id === x.id);
    if (clean(from) === name) return;
    if (saved?.types.some(t => normGreek(t) === normGreek(from))) {
      const n = usedType(x.id, from); if (!(await run({ t: 'renameAssetType', cat: x.id, from, to: name }, false))) return;
      toast({ text: 'Ο τύπος «' + from + '» έγινε «' + name + '»' + (n ? ' και σε ' + n + ' εγγραφές' : '') });
    }
    setF(p => ({ ...p, cats: p.cats.map(y => (y.id === x.id ? { ...y, types: y.types.map((t, j) => (j === i ? name : t)) } : y)) }));
  };
  const delType = (x: CatF, i: number) => {
    const t = x.types[i]; const n = usedType(x.id, t); const go = () => { setC(x.id, { types: x.types.filter((_, j) => j !== i) }); setDel(null); };
    if (n) setDel({ kind: 'type', text: 'Ο τύπος «' + t + '» έχει ' + n + ' εγγραφές. Θα μείνουν όπως είναι, με το κείμενο «' + t + '», αλλά ο τύπος δεν θα υπάρχει στη λίστα.', ok: go }); else go();
  };
  const newFieldId = (x: CatF) => { let n = 1; while (x.fields.some(y => y.id === 'f' + n)) n++; return 'f' + n; };
  const submit = (x: CatF, a: Ask, name: string, qty: string) => {
    setAsk(null);
    if (a.what === 'type') return void putType(x, a.i, name);
    if (a.what === 'acc') return setC(x.id, { accs: a.i < 0 ? [...x.accs, { name, qty }] : x.accs.map((y, j) => (j === a.i ? { name, qty } : y)) });
    setC(x.id, { fields: a.i < 0 ? [...x.fields, { id: newFieldId(x), name }] : x.fields.map((y, j) => (j === a.i ? { ...y, name } : y)) });
  };
  const dupErr = (names: string[], i: number) => (name: string) => (names.some((y, j) => j !== i && normGreek(y) === normGreek(name)) ? 'Υπάρχει ήδη' : '');
  const accTxt = (a: { name: string; qty: string }) => a.name + (Number(a.qty) > 1 ? ' · ' + Number(a.qty) : '');
  return html`<div className="stack" data-assets-set="">
    <p className="note" style=${{ margin: 0 }}>Το <b>Μητρώο</b> του Οπλισμού κρατά όπλα και υλικό, και η οθόνη <b>Οχήματα</b> τα οχήματα. Οι κατηγορίες, οι τύποι, τα παρελκόμενα και τα πεδία τους είναι δικά σου: ό,τι γράψεις εδώ φαίνεται στο Μητρώο και στο Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ». Δεν αλλάζει τα υπάρχοντα Excel.</p>
    <div className="asset-set">
      <nav className="asset-set__cats" aria-label="Κατηγορίες">
        ${KINDS.map(([k, l]) => html`<div key=${k}><div className="asset-set__sec">${l}</div>
          ${f.cats.filter(x => x.kind === k).map(x => html`<button type="button" key=${x.id} className=${'asset-set__cat' + (c && x.id === c.id ? ' is-on' : '')} aria-current=${c && x.id === c.id ? 'true' : undefined} onClick=${() => setSel(x.id)}><span>${x.name || 'Νέα κατηγορία'}</span><span className="asset-set__n">${used(x.id)}</span></button>`)}</div>`)}
        <button type="button" className="asset-set__add" onClick=${addCat}>+ Κατηγορία</button>
      </nav>
      ${c && html`<section className="ui-card asset-set__edit" key=${c.id}>
        <div className="ui-card__head"><h2>${c.name || 'Νέα κατηγορία'} <${Badge} tone="outline">${used(c.id)} είδη<//></h2><${Button} size="sm" variant="ghost" onClick=${() => delCat(c)} data-tip=${used(c.id) ? 'Έχει ' + used(c.id) + ' είδη: θα φαίνονται χωρίς κατηγορία (δεν σβήνονται)' : 'Σβήσε την κατηγορία'}>Σβήσε…<//></div>
        <div className="ui-card__body">
          <div className="field-row">
            <div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${'ac-n-' + c.id}>Όνομα</label><input id=${'ac-n-' + c.id} className="ui-input" value=${c.name} placeholder="π.χ. Τυφέκια" onChange=${(e: any) => setC(c.id, { name: e.target.value })}/></div>
            <div className="field"><label className="field__label" htmlFor=${'ac-k-' + c.id}>Είδος</label><${Select} id=${'ac-k-' + c.id} className="ui-input" value=${c.kind} onChange=${(e: any) => setC(c.id, { kind: e.target.value })}>${KINDS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}<//></div>
            <div className="field"><label className="field__label" htmlFor=${'ac-e-' + c.id}>Συντήρηση κάθε (μήνες)</label><input id=${'ac-e-' + c.id} className="ui-input" type="number" min="0" max="120" style=${{ maxWidth: '110px' }} value=${c.every} onChange=${(e: any) => setC(c.id, { every: e.target.value })}/></div>
            ${c.kind === 'vehicle' && html`<div className="field"><label className="field__label" htmlFor=${'ac-km-' + c.id}>Συντήρηση κάθε N ${c.hours ? 'ώρες' : 'χλμ'}</label><input id=${'ac-km-' + c.id} className="ui-input" type="number" min="0" style=${{ maxWidth: '110px' }} value=${c.everyKm} placeholder="5000" onChange=${(e: any) => setC(c.id, { everyKm: e.target.value })}/></div>
            <label className="check" style=${{ alignSelf: 'end', paddingBottom: '8px' }} data-tip="Για ερπυστριοφόρα: η ένδειξη είναι ώρες κινητήρα και φαίνεται «ώρ.» αντί για «χλμ»"><input type="checkbox" checked=${c.hours} onChange=${(e: any) => setC(c.id, { hours: e.target.checked })}/><span>Μετρά ώρες κινητήρα</span></label>`}</div>
          <div className="field"><span className="field__label">Τύποι</span>
            <${Chips} label="Τύποι" items=${c.types} addLabel="+ Τύπος" onAdd=${() => setAsk({ what: 'type', i: -1, name: '', qty: '' })} onEdit=${(i: number) => setAsk({ what: 'type', i, name: c.types[i], qty: '' })} onRemove=${(i: number) => delType(c, i)}/>
            <span className="field__help">Η μετονομασία ενός τύπου που υπάρχει ήδη αλλάζει αμέσως και τις εγγραφές που τον έχουν (αναιρείται με Ctrl+Z).</span></div>
          <div className="field"><span className="field__label">Παρελκόμενα που έχει συνήθως</span>
            <${Chips} label="Παρελκόμενα" items=${c.accs.map(accTxt)} addLabel="+ Παρελκόμενο" onAdd=${() => setAsk({ what: 'acc', i: -1, name: '', qty: '' })} onEdit=${(i: number) => setAsk({ what: 'acc', i, name: c.accs[i].name, qty: c.accs[i].qty })} onRemove=${(i: number) => setC(c.id, { accs: c.accs.filter((_, j) => j !== i) })}/>
            <span className="field__help">Τα σημειωμένα με αριθμό έχουν αυτή την ποσότητα (π.χ. 2 γεμιστήρες).</span></div>
          <div className="field"><span className="field__label">Δικά σου πεδία</span>
            <${Chips} label="Δικά σου πεδία" items=${c.fields.map(x => x.name)} addLabel="+ Πεδίο" onAdd=${() => setAsk({ what: 'field', i: -1, name: '', qty: '' })} onEdit=${(i: number) => setAsk({ what: 'field', i, name: c.fields[i].name, qty: '' })} onRemove=${(i: number) => setC(c.id, { fields: c.fields.filter((_, j) => j !== i) })}/></div>
        </div></section>`}
    </div>
    ${ask && c && html`<${NameDialog} ask=${ask} qty=${ask.what === 'acc'}
      title=${(ask.i < 0 ? 'Νέος ' : 'Μετονομασία: ') + (ask.what === 'type' ? 'τύπος' : ask.what === 'acc' ? 'παρελκόμενο' : 'πεδίο')}
      error=${dupErr(ask.what === 'type' ? c.types : ask.what === 'acc' ? c.accs.map(x => x.name) : c.fields.map(x => x.name), ask.i)}
      onClose=${() => setAsk(null)} onOk=${(name: string, qty: string) => submit(c, ask, name, qty)}/>`}
    ${del && html`<${Dialog} role="alertdialog" title=${del.kind === 'cat' ? 'Να σβηστεί η κατηγορία;' : 'Να αφαιρεθεί ο τύπος;'} onClose=${() => setDel(null)}
      footer=${html`<${Button} variant="outline" onClick=${() => setDel(null)}>Άκυρο<//><${Button} onClick=${del.ok}>${del.kind === 'cat' ? 'Σβήσε' : 'Αφαίρεσε'}<//>`}><p style=${{ margin: 0 }}>${del.text}</p><//>`}
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
