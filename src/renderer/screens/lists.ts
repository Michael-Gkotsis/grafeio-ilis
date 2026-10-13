// Ρυθμίσεις › Λίστες (Michael, 13/10): βαθμοί, Ο/Σ, ιατρικά, είδη ποινής, άδειας και απουσίας στελεχών που προτείνουν οι φόρμες
// και τα dropdown του Excel. Τα βασικά κρύβονται αλλά δεν σβήνονται· τα δικά σου σβήνονται μόνο αν δεν τα έχει κανείς.
// Κάθε δικό σου στοιχείο λέει ρητά πώς μετρά (γραμμή ή στήλη της ΗΚΑΙ, κείμενο ποινής, σαν ποιο ιατρικό): τίποτα δεν μαντεύεται.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, useToast } from '../ui';
import { useStore } from '../store';
import { CADRE_ABS, TYPES, TYPE_KEYS, effects, type TypeKey } from '../../shared/domain';
import { LEAVE_COLS, LIST_NAME, MED_LIKE, guessHk, itemKey, itemName, leaveCol, listRows, type ListId, type ListItem, type ListRow, type UserLists } from '../../shared/ranks';
import { HK_A, HK_NCO, HK_OFFICERS, hkRankOf } from '../../shared/rules';
import { punAcc, punMax } from '../../shared/punish';

const IDS: ListId[] = ['soldierRanks', 'cadreRanks', 'specs', 'medKinds', 'punKinds', 'leaveKinds', 'cadreAbs'];
const HELP: Record<ListId, string> = {
  soldierRanks: 'Στη φόρμα στρατιώτη και στο dropdown «Βαθμός» του Δυναμολογίου. Κάθε δικός σου βαθμός λέει σε ποια γραμμή της ΗΚΑΙ μετρά.',
  cadreRanks: 'Στη φόρμα «Νέο στέλεχος». Ο βαθμός διαλέγει μόνος του τη γραμμή της ΗΚΑΙ (αλλάζει και στη φόρμα).',
  specs: 'Στη φόρμα στρατιώτη και στο dropdown «Ο/Σ» του Δυναμολογίου.',
  punKinds: 'Στη δήλωση ποινής. Κάθε ποινή κόβει την έξοδο, μετρά στη στήλη «Τιμ.» και αιτείται στην ΗΚΑΙ. Το «κείμενο» μπαίνει στην πρόταση «με δύο (02) ημέρες …».',
  leaveKinds: 'Στη δήλωση άδειας. Κάθε άδεια: απών, χωρίς υπηρεσίες. Η στήλη λέει πού μετρά στην ΗΚΑΙ.',
  cadreAbs: 'Στην «Απουσία» στελέχους. Η στήλη λέει πού μετρά στην ΗΚΑΙ· «μόνο στη λίστα» δεν μετρά.',
  medKinds: 'Στη δήλωση ιατρικού και στη στήλη «είδος» του Excel ΕΑ-ΕΥ. Κάθε δικό σου ιατρικό συμπεριφέρεται σαν ΕΑ, ΕΥ, ΕΟ ή ΕΑΡΒ: ίδιοι κανόνες σε υπηρεσίες, έξοδο και ΗΚΑΙ, με το δικό του όνομα. Ο κωδικός μπαίνει στις μέρες απουσίας του Excel «Έλεγχος υπηρεσιών» (κενό = του βασικού). Αν κάποιο φύλλο του Excel σου μετράει με τύπο, π.χ. COUNTIF(…;"ΕΑ"), το νέο όνομα δεν μετριέται εκεί.'
};
// επιλογή που έχει κάθε δικό σου στοιχείο: [πεδίο, τίτλος, επιλογές [τιμή, όνομα]]
type Pick = { f: 'hk' | 'col' | 'like'; label: string; opts: [string, string][] };
const rowsOf = (l: string[]): [string, string][] => l.map(x => [x, x]);
const HK_COLS: [string, string][] = HK_A.map(([k, , full]) => [k, full]);
const PICK: Partial<Record<ListId, Pick>> = {
  soldierRanks: { f: 'hk', label: 'Γραμμή στην ΗΚΑΙ', opts: rowsOf(HK_NCO) },
  cadreRanks: { f: 'hk', label: 'Γραμμή στην ΗΚΑΙ', opts: rowsOf([...HK_OFFICERS, ...HK_NCO.slice(0, 3)]) },
  leaveKinds: { f: 'col', label: 'Στήλη στην ΗΚΑΙ', opts: LEAVE_COLS },
  cadreAbs: { f: 'col', label: 'Στήλη στην ΗΚΑΙ', opts: [['', 'Μόνο στη λίστα (δεν μετρά)'], ...HK_COLS] },
  medKinds: { f: 'like', label: 'Συμπεριφέρεται σαν', opts: MED_LIKE.map(k => [k, TYPES[k].label + ' (' + TYPES[k].long.toLowerCase() + ')']) }
};
// βασικός τύπος ενός βασικού ιατρικού (ΕΑ → EA)
const medBase = (name: string) => TYPE_KEYS.find(k => MED_LIKE.includes(k) && TYPES[k].label === name);
// ιατρικά: «ΕΛ.ΓΥΜΝ» και «ΕΛ ΓΥΜΝ» είναι το ίδιο, όπως στο Excel
const keyOf = (id: ListId) => (id === 'medKinds' ? (v: string) => itemKey(v).replace(/[^Α-ΩA-Z0-9]/g, '') : itemKey);
// κωδικός ημερολογίου: με τελεία ή κάθετο, όπως Κ.Α, Ε.Υ, για να μη μοιάζει με κωδικό υπηρεσίας
const codeOk = (c: string) => !c || (/[./]/.test(c) && c.length <= 8 && !/[,"]/.test(c));
// τι ισχύει για ένα στοιχείο (βασικό ή δικό σου), όπως το βλέπει η εφαρμογή
function current(id: ListId, r: ListItem, lists: UserLists): string {
  switch (id) {
    case 'soldierRanks': return r.hk || hkRankOf(r.name);
    case 'cadreRanks': return r.hk || guessHk(r.name);
    case 'leaveKinds': return leaveCol(r.name, lists);
    case 'cadreAbs': return CADRE_ABS.find(x => x[1] === r.name)?.[2] ?? (r.col || '');
    case 'medKinds': return r.like || medBase(r.name) || 'EA';
    default: return '';
  }
}
const optLbl = (p: Pick, v: string) => p.opts.find(o => o[0] === v)?.[1] || v;

export function ListsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const [id, setId] = useState<ListId>('soldierRanks');
  const [name, setName] = useState(''); const [choice, setChoice] = useState<string | null>(null);
  const [acc, setAcc] = useState(''); const [max, setMax] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const lists: UserLists = state.settings.lists || {};
  const rows = listRows(lists, id);
  const pick = PICK[id];
  // ποιες τιμές έχει ήδη κάποιος (αυτές δεν σβήνονται, μόνο κρύβονται)
  const used = useMemo(() => {
    const vals = id === 'cadreRanks' ? state.cadreList.map(c => c.rank)
      : id === 'cadreAbs' ? state.cadreAbs.map(a => a.kind)
      : id === 'punKinds' ? state.statuses.filter(x => x.type === 'PUN').map(x => x.kind || '')
      : id === 'leaveKinds' ? state.statuses.filter(x => x.type === 'LEAVE').map(x => x.kind || '')
      : id === 'medKinds' ? state.statuses.filter(x => MED_LIKE.includes(x.type)).map(x => x.kind || '')
      : state.people.map(p => (id === 'specs' ? p.spec : p.rank));
    return new Set(vals.filter(Boolean).map(keyOf(id)));
  }, [id, state.people, state.cadreList, state.cadreAbs, state.statuses]);
  const save = (next: UserLists, text: string) => run({ t: 'setSettings', settings: { lists: next }, text: 'λίστα ' + LIST_NAME[id] + ': ' + text }, false);
  const withList = (fn: (u: { add: ListItem[]; hide: string[] }) => void): UserLists => {
    const u = { add: [...(lists[id]?.add || [])], hide: [...(lists[id]?.hide || [])] }; fn(u);
    return { ...lists, [id]: u };
  };
  const reset = () => { setName(''); setChoice(null); setAcc(''); setMax(''); setCode(''); setErr(null); };
  const select = (v: ListId) => { setId(v); reset(); };
  const n = itemName(name, id); const key = keyOf(id); const isUsed = (r: ListRow) => used.has(key(r.name));
  const cd = code.trim().toUpperCase();
  const curChoice = pick ? choice ?? (pick.f === 'hk' ? current(id, { name: n }, lists) : pick.opts[0][0]) : '';
  const add = async () => {
    if (!n) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    if (id === 'medKinds' && !codeOk(cd)) { setErr('Ο κωδικός θέλει τελεία ή κάθετο, π.χ. Ε.Γ, για να μη μοιάζει με κωδικό υπηρεσίας (ως 8 χαρακτήρες).'); return; }
    const k = itemKey(n); const same = rows.find(r => key(r.name) === key(n));
    if (same && !same.hidden) { setErr('Το «' + same.name + '» υπάρχει ήδη στη λίστα.'); return; }
    const m = Math.floor(+max); if (max.trim() && !(m > 0)) { setErr('Οι ανώτατες ημέρες θέλουν αριθμό πάνω από 0 (ή άφησέ το κενό).'); return; }
    const item: ListItem = { name: n, ...(pick && curChoice ? { [pick.f]: curChoice } : {}), ...(id === 'punKinds' && acc.trim() ? { acc: acc.trim() } : {}), ...(id === 'punKinds' && m > 0 ? { max: m } : {}), ...(id === 'medKinds' && cd ? { code: cd } : {}) };
    // κρυμμένο: ξαναφαίνεται (κι αν είναι δικό σου, με ό,τι διάλεξες τώρα)
    const next = withList(u => {
      u.hide = u.hide.filter(x => itemKey(x) !== k);
      if (!same?.builtin) { u.add = u.add.filter(x => itemKey(x.name) !== k); u.add.push(item); }
    });
    const what = id === 'medKinds' ? ' (σαν ' + TYPES[curChoice as TypeKey].label + (cd ? ', κωδικός ' + cd : '') + ')' : pick && curChoice ? ' (ΗΚΑΙ: ' + optLbl(pick, curChoice) + ')' : id === 'punKinds' ? ' (κείμενο «' + punAcc(n, next) + '»' + (m > 0 ? ', ως ' + m + ' ημ.' : '') + ')' : '';
    if (await save(next, '+ ' + n + what)) { toast({ text: 'Μπήκε στη λίστα: ' + n }); reset(); }
  };
  const toggle = (r: ListRow) => save(withList(u => { u.hide = r.hidden ? u.hide.filter(x => itemKey(x) !== itemKey(r.name)) : [...u.hide, r.name]; }), (r.hidden ? 'ξανά το ' : 'κρυφό το ') + r.name);
  const remove = (r: ListRow) => save(withList(u => { u.add = u.add.filter(x => itemKey(x.name) !== itemKey(r.name)); u.hide = u.hide.filter(x => itemKey(x) !== itemKey(r.name)); }), 'σβήστηκε το ' + r.name);
  const setRow = (r: ListRow, f: 'hk' | 'col' | 'like' | 'code', v: string, text: string) => save(withList(u => { u.add = u.add.map(x => { if (itemKey(x.name) !== itemKey(r.name)) return x; const y = { ...x, [f]: v }; if (!v) delete y[f]; return y; }); }), r.name + ': ' + text);
  const setPick = (r: ListRow, v: string) => setRow(r, pick!.f, v, (id === 'medKinds' ? 'σαν ' : 'στην ΗΚΑΙ: ') + optLbl(pick!, v));
  const setCodeOf = (r: ListRow, v: string) => { const c = v.trim().toUpperCase(); if (c === (r.code || '')) return; if (!codeOk(c)) { setErr('Ο κωδικός του «' + r.name + '» θέλει τελεία ή κάθετο, π.χ. Ε.Γ.'); return; } setErr(null); setRow(r, 'code', c, c ? 'κωδικός ' + c : 'κωδικός του βασικού'); };
  const info = (r: ListRow) => {
    if (id === 'punKinds') { const mx = punMax(r.name, lists); return 'κείμενο: «' + punAcc(r.name, lists) + '»' + (mx ? ' · ως ' + mx + ' ημ.' : ''); }
    if (id === 'medKinds') { const t = TYPES[current(id, r, lists) as TypeKey]; return t.long + (effects(t) ? ': ' + effects(t) : ': χωρίς περιορισμούς') + (t.code ? ' · κωδικός ' + t.code : ''); }
    return pick ? 'ΗΚΑΙ: ' + optLbl(pick, current(id, r, lists)) : '';
  };

  return html`<${Card} title="Λίστες" actions=${html`<select className="ui-select" aria-label="Ποια λίστα" value=${id} onChange=${(e: any) => select(e.target.value)}>${IDS.map(v => html`<option key=${v} value=${v}>${LIST_NAME[v]}</option>`)}</select>`}>
    <p className="note" style=${{ marginTop: 0 }}>${HELP[id]} Ό,τι κρύψεις δεν προτείνεται πια, αλλά όσοι το έχουν ήδη το κρατούν.${id === 'soldierRanks' || id === 'specs' ? ' Στο Excel η λίστα μπαίνει με την επόμενη εγγραφή ή με «Ενημέρωση Excel».' : ''}</p>
    <ul className="hist">${rows.map(r => html`<li key=${r.name} className=${r.hidden ? 'muted' : ''}>
      <b style=${r.hidden ? { textDecoration: 'line-through' } : undefined}>${r.name}</b>
      ${r.builtin ? html`<${Badge} tone="outline">βασικό<//>` : html`<${Badge} tone="info">δικό σου<//>`}
      ${pick && !r.builtin
        ? html`<select className="ui-select" aria-label=${pick.label + ': ' + r.name} value=${current(id, r, lists)} disabled=${id === 'medKinds' && isUsed(r)} data-tip=${id === 'medKinds' && isUsed(r) ? 'Το έχουν ήδη κάποιοι: για άλλη συμπεριφορά φτιάξε νέο ιατρικό' : undefined} onChange=${(e: any) => setPick(r, e.target.value)}>${pick.opts.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>
          ${id === 'medKinds' && html`<input key=${r.name + '|' + (r.code || '')} className="ui-input" style=${{ width: '90px' }} aria-label=${'Κωδικός ημερολογίου: ' + r.name} placeholder=${TYPES[current(id, r, lists) as TypeKey].code || 'κωδικός'} defaultValue=${r.code || ''} onBlur=${(e: any) => setCodeOf(r, e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>`}`
        : html`<span className="muted" style=${{ fontSize: '12px' }}>${info(r)}</span>`}
      <span style=${{ flex: 1 }}></span>
      ${id === 'medKinds' && r.builtin ? html`<span className="muted" style=${{ fontSize: '12px' }}>βασικός τύπος</span>`
        : r.builtin || isUsed(r)
        ? html`<${Button} size="sm" variant="ghost" onClick=${() => toggle(r)} data-tip=${r.hidden ? 'Να προτείνεται ξανά' : 'Να μην προτείνεται στις φόρμες' + (id === 'soldierRanks' || id === 'specs' ? ' και στο Excel' : '')}>${r.hidden ? 'Εμφάνιση' : 'Απόκρυψη'}<//>`
        : html`<${Button} size="sm" variant="ghost" aria-label=${'Σβήσε ' + r.name} onClick=${() => remove(r)}>✕<//>`}
    </li>`)}</ul>
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field"><label className="field__label" htmlFor="ls-n">Νέο: ${LIST_NAME[id].toLowerCase()}</label><input id="ls-n" className="ui-input" placeholder=${PH[id]} value=${name} onChange=${(e: any) => { setName(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>
      ${pick && html`<div className="field"><label className="field__label" htmlFor="ls-c">${pick.label}</label><select id="ls-c" className="ui-input" value=${curChoice} onChange=${(e: any) => setChoice(e.target.value)}>${pick.opts.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>`}
      ${id === 'punKinds' && html`<div className="field"><label className="field__label" htmlFor="ls-a">Κείμενο ποινής</label><input id="ls-a" className="ui-input" placeholder=${n ? n.toLowerCase() : 'π.χ. επίπληξη'} value=${acc} onChange=${(e: any) => setAcc(e.target.value)}/></div>
        <div className="field" style=${{ maxWidth: '130px' }}><label className="field__label" htmlFor="ls-m">Ως ημέρες</label><input id="ls-m" className="ui-input" type="number" min="1" placeholder="χωρίς όριο" value=${max} onChange=${(e: any) => setMax(e.target.value)}/></div>`}
      ${id === 'medKinds' && html`<div className="field" style=${{ maxWidth: '130px' }}><label className="field__label" htmlFor="ls-k">Κωδικός</label><input id="ls-k" className="ui-input" placeholder=${TYPES[curChoice as TypeKey]?.code || 'π.χ. Ε.Γ'} value=${code} onChange=${(e: any) => { setCode(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>`}
      <div className="field" style=${{ flex: 0 }}><${Button} disabled=${!name.trim()} onClick=${add}>Πρόσθεσε<//></div></div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}
const PH: Record<ListId, string> = { soldierRanks: 'π.χ. ΚΛΗΡ', cadreRanks: 'π.χ. ΣΜΧΟΣ', specs: 'π.χ. ΠΝ', punKinds: 'π.χ. Επίπληξη', leaveKinds: 'π.χ. Γονική', cadreAbs: 'π.χ. Σχολείο', medKinds: 'π.χ. ΕΛ ΓΥΜΝ' };
