// Ρυθμίσεις › Λίστες (Michael, 13/10): βαθμοί στρατιωτών, βαθμοί στελεχών και Ο/Σ που προτείνουν οι φόρμες και τα
// dropdown του Excel. Τα βασικά κρύβονται αλλά δεν σβήνονται· τα δικά σου σβήνονται μόνο αν δεν τα έχει κανείς.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Segmented, useToast } from '../ui';
import { useStore } from '../store';
import { LIST_NAME, guessHk, itemKey, itemName, listRows, type ListId, type ListRow, type UserLists } from '../../shared/ranks';
import { HK_NCO, HK_OFFICERS, hkRankOf } from '../../shared/rules';

const IDS: ListId[] = ['soldierRanks', 'cadreRanks', 'specs'];
const SHORT: Record<ListId, string> = { soldierRanks: 'Βαθμοί στρατιωτών', cadreRanks: 'Βαθμοί στελεχών', specs: 'Ο/Σ' };
// γραμμές της ΗΚΑΙ που ταιριάζουν σε κάθε λίστα βαθμών
const HK_ROWS: Partial<Record<ListId, string[]>> = { soldierRanks: HK_NCO, cadreRanks: [...HK_OFFICERS, ...HK_NCO.slice(0, 3)] };
const HELP: Record<ListId, string> = {
  soldierRanks: 'Στη φόρμα στρατιώτη και στο dropdown «Βαθμός» του Δυναμολογίου. Κάθε δικός σου βαθμός λέει σε ποια γραμμή της ΗΚΑΙ μετρά.',
  cadreRanks: 'Στη φόρμα «Νέο στέλεχος». Ο βαθμός διαλέγει μόνος του τη γραμμή της ΗΚΑΙ (αλλάζει και στη φόρμα).',
  specs: 'Στη φόρμα στρατιώτη και στο dropdown «Ο/Σ» του Δυναμολογίου.'
};
const guess = (id: ListId, name: string) => (id === 'soldierRanks' ? hkRankOf(name) : id === 'cadreRanks' ? guessHk(name) : '');

export function ListsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const [id, setId] = useState<ListId>('soldierRanks');
  const [name, setName] = useState(''); const [hk, setHk] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const lists: UserLists = state.settings.lists || {};
  const rows = listRows(lists, id);
  const hkRows = HK_ROWS[id];
  // ποιες τιμές έχει ήδη κάποιος (αυτές δεν σβήνονται, μόνο κρύβονται)
  const used = useMemo(() => {
    const vals = id === 'cadreRanks' ? state.cadreList.map(c => c.rank) : state.people.map(p => (id === 'specs' ? p.spec : p.rank));
    return new Set(vals.filter(Boolean).map(itemKey));
  }, [id, state.people, state.cadreList]);
  const save = (next: UserLists, text: string) => run({ t: 'setSettings', settings: { lists: next }, text: 'λίστα ' + LIST_NAME[id] + ': ' + text }, false);
  const withList = (fn: (u: { add: { name: string; hk?: string }[]; hide: string[] }) => void): UserLists => {
    const u = { add: [...(lists[id]?.add || [])], hide: [...(lists[id]?.hide || [])] }; fn(u);
    return { ...lists, [id]: u };
  };
  const pick = (v: ListId) => { setId(v); setName(''); setHk(null); setErr(null); };
  const curHk = hkRows ? hk || guess(id, name) : '';
  const add = async () => {
    const n = itemName(name); if (!n) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    const k = itemKey(n); const same = rows.find(r => itemKey(r.name) === k);
    if (same && !same.hidden) { setErr('Το «' + same.name + '» υπάρχει ήδη στη λίστα.'); return; }
    // κρυμμένο: ξαναφαίνεται (κι αν είναι δικό σου, με τη γραμμή ΗΚΑΙ που διάλεξες τώρα)
    const next = withList(u => {
      u.hide = u.hide.filter(x => itemKey(x) !== k);
      if (!same?.builtin) { u.add = u.add.filter(x => itemKey(x.name) !== k); u.add.push({ name: n, ...(curHk ? { hk: curHk } : {}) }); }
    });
    if (await save(next, '+ ' + n + (curHk ? ' (ΗΚΑΙ: ' + curHk + ')' : ''))) { toast({ text: 'Μπήκε στη λίστα: ' + n }); setName(''); setHk(null); setErr(null); }
  };
  const toggle = (r: ListRow) => save(withList(u => { u.hide = r.hidden ? u.hide.filter(x => itemKey(x) !== itemKey(r.name)) : [...u.hide, r.name]; }), (r.hidden ? 'ξανά το ' : 'κρυφό το ') + r.name);
  const remove = (r: ListRow) => save(withList(u => { u.add = u.add.filter(x => itemKey(x.name) !== itemKey(r.name)); u.hide = u.hide.filter(x => itemKey(x) !== itemKey(r.name)); }), 'σβήστηκε το ' + r.name);
  const setRowHk = (r: ListRow, v: string) => save(withList(u => { u.add = u.add.map(x => (itemKey(x.name) === itemKey(r.name) ? { ...x, hk: v } : x)); }), r.name + ' στην ΗΚΑΙ: ' + v);

  return html`<${Card} title="Λίστες" actions=${html`<${Segmented} small=${true} value=${id} onChange=${pick} items=${IDS.map(v => ({ value: v, label: SHORT[v] }))}/>`}>
    <p className="note" style=${{ marginTop: 0 }}>${HELP[id]} Ό,τι κρύψεις δεν προτείνεται πια, αλλά όσοι το έχουν ήδη το κρατούν. Στο Excel η λίστα μπαίνει με την επόμενη εγγραφή ή με «Ενημέρωση Excel».</p>
    <ul className="hist">${rows.map(r => html`<li key=${r.name} className=${r.hidden ? 'muted' : ''}>
      <b style=${r.hidden ? { textDecoration: 'line-through' } : undefined}>${r.name}</b>
      ${r.builtin ? html`<${Badge} tone="outline">βασικό<//>` : html`<${Badge} tone="info">δικό σου<//>`}
      ${hkRows && (r.builtin ? html`<span className="muted" style=${{ fontSize: '12px' }}>ΗΚΑΙ: ${guess(id, r.name)}</span>`
        : html`<select className="ui-select" aria-label=${'Γραμμή ΗΚΑΙ για ' + r.name} value=${r.hk || guess(id, r.name)} onChange=${(e: any) => setRowHk(r, e.target.value)}>${hkRows.map(x => html`<option key=${x}>${x}</option>`)}</select>`)}
      <span style=${{ flex: 1 }}></span>
      ${r.builtin || used.has(itemKey(r.name))
        ? html`<${Button} size="sm" variant="ghost" onClick=${() => toggle(r)} data-tip=${r.hidden ? 'Να προτείνεται ξανά' : 'Να μην προτείνεται στις φόρμες και στο Excel'}>${r.hidden ? 'Εμφάνιση' : 'Απόκρυψη'}<//>`
        : html`<${Button} size="sm" variant="ghost" aria-label=${'Σβήσε ' + r.name} onClick=${() => remove(r)}>✕<//>`}
    </li>`)}</ul>
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field"><label className="field__label" htmlFor="ls-n">Νέο: ${SHORT[id].toLowerCase()}</label><input id="ls-n" className="ui-input" placeholder=${id === 'specs' ? 'π.χ. ΠΝ' : 'π.χ. ΚΛΗΡ'} value=${name} onChange=${(e: any) => { setName(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>
      ${hkRows && html`<div className="field"><label className="field__label" htmlFor="ls-hk">Γραμμή στην ΗΚΑΙ</label><select id="ls-hk" className="ui-input" value=${curHk} onChange=${(e: any) => setHk(e.target.value)}>${hkRows.map(x => html`<option key=${x}>${x}</option>`)}</select></div>`}
      <div className="field" style=${{ flex: 0 }}><${Button} disabled=${!name.trim()} onClick=${add}>Πρόσθεσε<//></div></div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}
