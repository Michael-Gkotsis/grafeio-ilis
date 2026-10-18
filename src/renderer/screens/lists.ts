// Ρυθμίσεις › Λίστες (Michael, 13/10): βαθμοί, Ο/Σ, ιατρικά, είδη ποινής, άδειας και απουσίας στελεχών που προτείνουν οι φόρμες
// και τα dropdown του Excel. Τα βασικά κρύβονται αλλά δεν σβήνονται· τα δικά σου σβήνονται μόνο αν δεν τα έχει κανείς.
// Κάθε δικό σου στοιχείο λέει ρητά πώς μετρά (γραμμή ή στήλη της ΗΚΑΙ, κείμενο ποινής): τίποτα δεν μαντεύεται. Τι κάνει ένα
// ιατρικό ή ένα είδος ποινής (υπηρεσίες, έξοδος, ΗΚΑΙ) ορίζεται στις Υπηρεσίες και αργίες (Michael, 18/10).
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { normGreek } from '../../shared/text';
import { CADRE_ABS, TYPES, type TypeKey } from '../../shared/domain';
import { LEAVE_COLS, LIST_BASE, LIST_NAME, MED_LIKE, guessHk, hkCadreRows, hkRowsOf, siUnarmed, itemKey, itemName, leaveCol, listRows, weaponBack, type ListId, type ListItem, type ListRow, type UserLists } from '../../shared/ranks';
import { HK_A, HK_K, hkRankOf } from '../../shared/rules';
import { hkRowLabel, HK } from '../../shared/unit';
import { punAcc, punMax } from '../../shared/punish';

const IDS: ListId[] = ['soldierRanks', 'cadreRanks', 'specs', 'medKinds', 'punKinds', 'leaveKinds', 'cadreAbs', 'weaponTypes', 'weaponOut', 'siUnarmed'];
const HELP = (): Record<ListId, string> => ({
  soldierRanks: 'Στη φόρμα στρατιώτη και στο dropdown «Βαθμός» του Δυναμολογίου. Κάθε δικός σου βαθμός λέει σε ποια γραμμή της ' + HK() + ' μετρά.',
  cadreRanks: 'Στη φόρμα «Νέο στέλεχος». Ο βαθμός διαλέγει μόνος του τη γραμμή της ' + HK() + ' (αλλάζει και στη φόρμα).',
  specs: 'Στη φόρμα στρατιώτη και στο dropdown «Ο/Σ» του Δυναμολογίου.',
  weaponTypes: 'Στη στήλη «Τύπος» της καρτέλας Οπλισμός και στο Excel «Οπλισμός».',
  weaponOut: 'Στην «Έξοδο όπλων» της καρτέλας Οπλισμός. Κάθε λόγος εξόδου έχει τον λόγο εισαγωγής του (π.χ. ΕΚΠ → ΛΗΞ ΕΚΠ), που μπαίνει μόνος του όταν επιστρέφει το όπλο.',
  punKinds: 'Στη δήλωση ποινής. Κάθε ποινή κόβει την έξοδο, μετρά στη στήλη «Τιμ.» και γράφεται στην ' + HK() + ' (4. Ποινές). Το «κείμενο» μπαίνει στην πρόταση «με δύο (02) ημέρες …». Σε ποιες υπηρεσίες μπαίνει κάθε είδος ορίζεις στις Υπηρεσίες και αργίες.',
  leaveKinds: 'Στη δήλωση άδειας. Κάθε άδεια: απών, χωρίς υπηρεσίες. Η στήλη λέει πού μετρά στην ' + HK() + '.',
  cadreAbs: 'Στην «Κατάσταση» στελέχους (καρτέλα Στελέχη). Η στήλη λέει πού μετρά στην ' + HK() + ', στους κωλυόμενους ή στους απόντες· «μόνο στη λίστα» δεν μετρά.',
  siUnarmed: 'Όποιος έχει τέτοιο Σ.Ι. είναι άοπλος: δεν μπαίνει οπλοφύλακας ούτε σκοπός, και μετρά ως άοπλος στα «Αυστηρά Άοπλοι». Ένα δικό σου ισχύει για κάθε Σ.Ι. που αρχίζει από αυτό (χωρίς κενά και τελείες). Η «Δυνατότητα υπηρεσιών» κάθε ατόμου ισχύει όπως πριν.',
  medKinds: 'Στη δήλωση ιατρικού και στη στήλη «είδος» του Excel ΕΑ-ΕΥ. Τι κάνει κάθε ιατρικό (σε ποιες υπηρεσίες μπαίνει, αν βγαίνει έξοδο, πού μετρά στην ' + HK() + ') το ορίζεις στις Υπηρεσίες και αργίες, όπου εμφανίζεται μόλις το προσθέσεις, αρχικά χωρίς περιορισμούς. «Μόνο προειδοποίηση» (π.χ. ΠΑΡΑΠΕΜΠΤΙΚΟ 401): όταν μπαίνει σε υπηρεσία βγαίνει προειδοποίηση και η αυτόματη συμπλήρωση τον βάζει μόνο αν δεν υπάρχει άλλος. Ο κωδικός μπαίνει στις μέρες απουσίας του Excel «Έλεγχος υπηρεσιών» (κενό = του βασικού). Αν κάποιο φύλλο του Excel σου μετράει με τύπο, π.χ. COUNTIF(…;"ΕΑ"), το νέο όνομα δεν μετριέται εκεί.'
});
// επιλογή που έχει κάθε δικό σου στοιχείο: [πεδίο, τίτλος, επιλογές [τιμή, όνομα]]
type Pick = { f: 'hk' | 'col'; label: string; opts: [string, string][] };
const rowsOf = (l: string[]): [string, string][] => l.map(x => [x, hkRowLabel(x)]);
// καταστάσεις στελεχών: κάθε στήλη της ΗΚΑΙ, κωλυόμενοι και απόντες
const HK_COLS: [string, string][] = [...HK_K.filter(([k]) => k !== 'bl').map(([k, , full]) => [k, 'Κωλ.: ' + full] as [string, string]), ...HK_A.map(([k, , full]) => [k, 'Απ.: ' + full] as [string, string])];
// οι γραμμές της ΗΚΑΙ μαζί με όσες πρόσθεσες (Ρυθμίσεις › Μονάδα και έντυπα), με το όνομά τους στην ΗΚΑΛ σε λόχο
const pickOf = (id: ListId, lists?: UserLists): Pick | undefined => (id === 'soldierRanks' ? { f: 'hk', label: 'Γραμμή στην ' + HK(), opts: rowsOf(hkRowsOf(lists).nco) }
  : id === 'cadreRanks' ? { f: 'hk', label: 'Γραμμή στην ' + HK(), opts: rowsOf(hkCadreRows(lists)) } : PICK()[id]);
const PICK = (): Partial<Record<ListId, Pick>> => ({
  leaveKinds: { f: 'col', label: 'Στήλη στην ' + HK(), opts: LEAVE_COLS },
  cadreAbs: { f: 'col', label: 'Στήλη στην ' + HK(), opts: [['', 'Μόνο στη λίστα (δεν μετρά)'], ...HK_COLS] }
});
// ιατρικά: «ΕΛ.ΓΥΜΝ» και «ΕΛ ΓΥΜΝ» είναι το ίδιο, όπως στο Excel
const keyOf = (id: ListId) => (id === 'medKinds' ? (v: string) => itemKey(v).replace(/[^Α-ΩA-Z0-9]/g, '') : itemKey);
// κωδικός ημερολογίου: με τελεία ή κάθετο, όπως Κ.Α, Ε.Υ, για να μη μοιάζει με κωδικό υπηρεσίας
const codeOk = (c: string) => !c || (/[./]/.test(c) && c.length <= 8 && !/[,"]/.test(c));
// τι ισχύει για ένα στοιχείο (βασικό ή δικό σου), όπως το βλέπει η εφαρμογή
function current(id: ListId, r: ListItem, lists: UserLists): string {
  switch (id) {
    case 'soldierRanks': return hkRankOf(r.name, lists);
    case 'cadreRanks': return guessHk(r.name, lists);
    case 'leaveKinds': return leaveCol(r.name, lists);
    case 'cadreAbs': return CADRE_ABS.find(x => x[1] === r.name)?.[2] ?? (r.col || '');
    default: return '';
  }
}
const optLbl = (p: Pick, v: string) => p.opts.find(o => o[0] === v)?.[1] || v;

export function ListsCard() {
  const { state, run } = useStore(); const toast = useToast(); const nav = useNav();
  const [id, setId] = useState<ListId>('soldierRanks');
  // η λίστα «Σ.Ι. άοπλων» έγινε ο πίνακας Σ.Ι. (κάρτα «Σ.Ι.»): φαίνεται μόνο σε όποιον έχει ήδη αλλάξει κάτι εκεί
  const ids = IDS.filter(v => v !== 'siUnarmed' || !!(state.settings.lists?.siUnarmed?.add?.length || state.settings.lists?.siUnarmed?.hide?.length));
  const [name, setName] = useState(''); const [choice, setChoice] = useState<string | null>(null);
  const [acc, setAcc] = useState(''); const [max, setMax] = useState(''); const [code, setCode] = useState(''); const [warn, setWarn] = useState(false); const [back, setBack] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const lists: UserLists = state.settings.lists || {};
  const rows = listRows(lists, id);
  const pick = pickOf(id, lists);
  // ποιες τιμές έχει ήδη κάποιος (αυτές δεν σβήνονται, μόνο κρύβονται)
  const used = useMemo(() => {
    const vals = id === 'cadreRanks' ? state.cadreList.map(c => c.rank)
      : id === 'cadreAbs' ? state.cadreAbs.map(a => a.kind)
      : id === 'punKinds' ? state.statuses.filter(x => x.type === 'PUN').map(x => x.kind || '')
      : id === 'leaveKinds' ? state.statuses.filter(x => x.type === 'LEAVE').map(x => x.kind || '')
      : id === 'medKinds' ? state.statuses.filter(x => MED_LIKE.includes(x.type)).map(x => x.kind || '')
      : id === 'siUnarmed' ? []
      : id === 'weaponTypes' ? state.people.map(p => p.wtype || '')
      : id === 'weaponOut' ? (state.weaponLog || []).map(m => m.reason)
      : state.people.map(p => (id === 'specs' ? p.spec : p.rank));
    return new Set(vals.filter(Boolean).map(keyOf(id)));
  }, [id, state.people, state.cadreList, state.cadreAbs, state.statuses, state.weaponLog]);
  const save = (next: UserLists, text: string) => run({ t: 'setSettings', settings: { lists: next }, text: 'λίστα ' + LIST_NAME[id] + ': ' + text }, false);
  const withList = (fn: (u: { add: ListItem[]; hide: string[] }) => void): UserLists => {
    const u = { add: [...(lists[id]?.add || [])], hide: [...(lists[id]?.hide || [])] }; fn(u);
    return { ...lists, [id]: u };
  };
  const reset = () => { setName(''); setChoice(null); setAcc(''); setMax(''); setCode(''); setWarn(false); setBack(''); setErr(null); };
  const toDuty = () => nav.set({ tab: 'duty' });
  const select = (v: ListId) => { setId(v); reset(); };
  const n = itemName(name, id); const key = keyOf(id); const isUsed = (r: ListRow) => used.has(key(r.name));
  const cd = code.trim().toUpperCase();
  const curChoice = pick ? choice ?? (pick.f === 'hk' ? current(id, { name: n }, lists) : pick.opts[0][0]) : '';
  const add = async () => {
    if (!n) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    if (id === 'siUnarmed' && normGreek(n).replace(/[^Α-ΩA-Z0-9]/g, '').length < 2) { setErr('Γράψε ολόκληρο το Σ.Ι. (π.χ. Ι5): ένα γράμμα μόνο θα έκανε άοπλους σχεδόν όλους.'); return; }
    if (id === 'medKinds' && !codeOk(cd)) { setErr('Ο κωδικός θέλει τελεία ή κάθετο, π.χ. Ε.Γ, για να μη μοιάζει με κωδικό υπηρεσίας (ως 8 χαρακτήρες).'); return; }
    const k = itemKey(n); const same = rows.find(r => key(r.name) === key(n));
    if (same && !same.hidden) { setErr('Το «' + same.name + '» υπάρχει ήδη στη λίστα.'); return; }
    const m = Math.floor(+max); if (max.trim() && !(m > 0)) { setErr('Οι ανώτατες ημέρες θέλουν αριθμό πάνω από 0 (ή άφησέ το κενό).'); return; }
    // νέο ιατρικό: βασικός τύπος ΕΑΡΒ (χωρίς περιορισμούς), τι κάνει ορίζεται στις Υπηρεσίες και αργίες
    const item0: ListItem = { name: n, ...(pick && curChoice ? { [pick.f]: curChoice } : {}), ...(id === 'medKinds' ? { like: 'EARV' as TypeKey, ...(warn ? { warn: true } : {}) } : {}), ...(id === 'punKinds' && acc.trim() ? { acc: acc.trim() } : {}), ...(id === 'punKinds' && m > 0 ? { max: m } : {}), ...(id === 'medKinds' && cd ? { code: cd } : {}), ...(id === 'weaponOut' && back.trim() ? { back: back.trim().replace(/\s+/g, ' ').toUpperCase() } : {}) };
    const item = JSON.parse(JSON.stringify(item0)) as ListItem;   // χωρίς κενά πεδία
    // κρυμμένο: ξαναφαίνεται (κι αν είναι δικό σου, με ό,τι διάλεξες τώρα)
    const next = withList(u => {
      u.hide = u.hide.filter(x => itemKey(x) !== k);
      // ιατρικό που υπήρχε: κρατά τον βασικό του τύπο, για να ισχύουν όσα όρισες στις Υπηρεσίες και αργίες
      const was = u.add.find(x => itemKey(x.name) === k); if (id === 'medKinds' && was?.like) item.like = was.like;
      if (!same?.builtin) { u.add = u.add.filter(x => itemKey(x.name) !== k); u.add.push(item); }
    });
    const what = id === 'weaponOut' ? ' (εισαγωγή: ' + weaponBack(n, next) + ')' : id === 'medKinds' ? ([warn && 'μόνο προειδοποίηση', cd && 'κωδικός ' + cd].filter(Boolean).join(', ').replace(/^(.+)$/, ' ($1)')) : pick && curChoice ? ' (' + HK() + ': ' + optLbl(pick, curChoice) + ')' : id === 'punKinds' ? ' (κείμενο «' + punAcc(n, next) + '»' + (m > 0 ? ', ως ' + m + ' ημ.' : '') + ')' : '';
    if (!(await save(next, '+ ' + n + what))) return;
    if (id === 'medKinds' || id === 'punKinds') toast({ text: 'Μπήκε στη λίστα: ' + n + '. ' + (id === 'medKinds' ? 'Όρισε τι κάνει (υπηρεσίες, έξοδος, ' + HK() + ')' : 'Σε ποιες υπηρεσίες μπαίνει, το ορίζεις') + ' στις Υπηρεσίες και αργίες.', actions: [{ label: 'Τι κάνει', fn: toDuty }] });
    else toast({ text: 'Μπήκε στη λίστα: ' + n });
    reset();
  };
  const toggle = (r: ListRow) => save(withList(u => { u.hide = r.hidden ? u.hide.filter(x => itemKey(x) !== itemKey(r.name)) : [...u.hide, r.name]; }), (r.hidden ? 'ξανά το ' : 'κρυφό το ') + r.name);
  const remove = (r: ListRow) => save(withList(u => { u.add = u.add.filter(x => itemKey(x.name) !== itemKey(r.name)); u.hide = u.hide.filter(x => itemKey(x) !== itemKey(r.name)); }), 'σβήστηκε το ' + r.name);
  const setRow = (r: ListRow, f: 'hk' | 'col' | 'code' | 'back', v: string, text: string) => save(withList(u => { u.add = u.add.map(x => { if (itemKey(x.name) !== itemKey(r.name)) return x; const y = { ...x, [f]: v }; if (!v) delete y[f]; return y; }); }), r.name + ': ' + text);
  const setPick = (r: ListRow, v: string) => setRow(r, pick!.f, v, 'στην ' + HK() + ': ' + optLbl(pick!, v));
  // «μόνο προειδοποίηση» ενός ιατρικού (checkbox, Michael 18/10): δεν αλλάζει τι κάνει στις υπηρεσίες
  const setWarnOf = (r: ListRow, on: boolean) => save(withList(u => { u.add = u.add.map(x => { if (itemKey(x.name) !== itemKey(r.name)) return x; const y: ListItem = { ...x, warn: true }; if (!on) delete y.warn; return y; }); }), r.name + ': ' + (on ? 'μόνο προειδοποίηση' : 'χωρίς προειδοποίηση'));
  const setCodeOf = (r: ListRow, v: string) => { const c = v.trim().toUpperCase(); if (c === (r.code || '')) return; if (!codeOk(c)) { setErr('Ο κωδικός του «' + r.name + '» θέλει τελεία ή κάθετο, π.χ. Ε.Γ.'); return; } setErr(null); setRow(r, 'code', c, c ? 'κωδικός ' + c : 'κωδικός του βασικού'); };
  const setBackOf = (r: ListRow, v: string) => { const b = v.trim().replace(/\s+/g, ' ').toUpperCase(); if (b === (r.back || '')) return; setRow(r, 'back', b, 'εισαγωγή ' + (b || weaponBack(r.name))); };
  const info = (r: ListRow) => {
    if (id === 'weaponOut') return 'εισαγωγή: ' + weaponBack(r.name, lists);
    if (id === 'punKinds') { const mx = punMax(r.name, lists); return 'κείμενο: «' + punAcc(r.name, lists) + '»' + (mx ? ' · ως ' + mx + ' ημ.' : ''); }
    if (id === 'siUnarmed') {
      // μόνο αυτός ο κανόνας: οι άλλοι κρυφοί, για να μετρηθούν όσοι πιάνει
      const only: UserLists = { siUnarmed: r.builtin ? { hide: LIST_BASE.siUnarmed.filter(x => x !== r.name) } : { add: [r], hide: [...LIST_BASE.siUnarmed] } };
      const n = state.people.filter(p => p.active && siUnarmed(p.si, only)).length;
      return (r.name === 'ΑΟΠΛ' && r.builtin ? 'περιέχει «ΑΟΠΛ» ή «ΧΩΡΙΣ ΟΠΛΟ»' : 'αρχίζει από «' + r.name + '»') + ' · ' + (n === 1 ? '1 άτομο' : n + ' άτομα') + (r.hidden ? ' (δεν ισχύει)' : '');
    }
    if (id === 'medKinds') { const t = TYPES[MED_LIKE.find(k => TYPES[k].label === r.name) || 'EA']; return t.long + (t.code ? ' · κωδικός ' + t.code : ''); }
    return pick ? HK() + ': ' + optLbl(pick, current(id, r, lists)) : '';
  };

  return html`<${Card} title="Λίστες" actions=${html`<select className="ui-select" aria-label="Ποια λίστα" value=${id} onChange=${(e: any) => select(e.target.value)}>${ids.map(v => html`<option key=${v} value=${v}>${LIST_NAME[v]}</option>`)}</select>`}>
    <p className="note" style=${{ marginTop: 0 }}>${HELP()[id]}${id === 'siUnarmed' ? ' Όποιο βασικό απενεργοποιήσεις δεν ισχύει πια.' : ' Ό,τι κρύψεις δεν προτείνεται πια, αλλά όσοι το έχουν ήδη το κρατούν.'}${id === 'soldierRanks' || id === 'specs' ? ' Στο Excel η λίστα μπαίνει με την επόμενη εγγραφή ή με «Ενημέρωση Excel».' : ''}</p>
    <ul className="hist">${rows.map(r => html`<li key=${r.name} className=${r.hidden ? 'muted' : ''}>
      <b style=${r.hidden ? { textDecoration: 'line-through' } : undefined}>${r.name}</b>
      ${r.builtin ? html`<${Badge} tone="outline">βασικό<//>` : html`<${Badge} tone="info">δικό σου<//>`}
      ${id === 'weaponOut' && !r.builtin
        ? html`<input key=${r.name + '|' + (r.back || '')} className="ui-input" style=${{ width: '200px' }} aria-label=${'Λόγος εισαγωγής: ' + r.name} data-tip="Μπαίνει μόνος του όταν επιστρέφει το όπλο" placeholder=${'ΛΗΞ ' + r.name} defaultValue=${r.back || ''} onBlur=${(e: any) => setBackOf(r, e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>`
        : id === 'medKinds' && !r.builtin
        ? html`<input key=${r.name + '|' + (r.code || '')} className="ui-input" style=${{ width: '90px' }} aria-label=${'Κωδικός ημερολογίου: ' + r.name} data-tip="Κωδικός στις μέρες του Excel «Έλεγχος υπηρεσιών»" placeholder=${(r.like && TYPES[r.like]?.code) || 'κωδικός'} defaultValue=${r.code || ''} onBlur=${(e: any) => setCodeOf(r, e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') e.target.blur(); }}/>
          <label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${!!r.warn} onChange=${(e: any) => setWarnOf(r, e.target.checked)}/> Μόνο προειδοποίηση</label>
          <${Button} size="sm" variant="outline" data-tip="Σε ποιες υπηρεσίες μπαίνει, έξοδος και ${HK()}" onClick=${toDuty}>Τι κάνει<//>`
        : pick && !r.builtin
        ? html`<select className="ui-select" aria-label=${pick.label + ': ' + r.name} value=${current(id, r, lists)} onChange=${(e: any) => setPick(r, e.target.value)}>${pick.opts.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>`
        : html`<span className="muted" style=${{ fontSize: '12px' }}>${info(r)}</span>`}
      <span style=${{ flex: 1 }}></span>
      ${id === 'medKinds' && r.builtin ? html`<span className="muted" style=${{ fontSize: '12px' }}>βασικός τύπος</span>`
        : r.builtin || isUsed(r)
        ? html`<${Button} size="sm" variant="ghost" onClick=${() => toggle(r)} data-tip=${id === 'siUnarmed' ? (r.hidden ? 'Να ισχύει ξανά' : 'Να μη θεωρείται άοπλος όποιος έχει αυτό το Σ.Ι.') : r.hidden ? 'Να προτείνεται ξανά' : 'Να μην προτείνεται στις φόρμες' + (id === 'soldierRanks' || id === 'specs' ? ' και στο Excel' : '')}>${id === 'siUnarmed' ? (r.hidden ? 'Να ισχύει' : 'Να μην ισχύει') : r.hidden ? 'Εμφάνιση' : 'Απόκρυψη'}<//>`
        : html`<${Button} size="sm" variant="ghost" aria-label=${'Σβήσε ' + r.name} onClick=${() => remove(r)}>✕<//>`}
    </li>`)}</ul>
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field"><label className="field__label" htmlFor="ls-n">Νέο: ${LIST_NAME[id].toLowerCase()}</label><input id="ls-n" className="ui-input" placeholder=${PH[id]} value=${name} onChange=${(e: any) => { setName(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>
      ${pick && html`<div className="field"><label className="field__label" htmlFor="ls-c">${pick.label}</label><select id="ls-c" className="ui-input" value=${curChoice} onChange=${(e: any) => setChoice(e.target.value)}>${pick.opts.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select></div>`}
      ${id === 'punKinds' && html`<div className="field"><label className="field__label" htmlFor="ls-a">Κείμενο ποινής</label><input id="ls-a" className="ui-input" placeholder=${n ? n.toLowerCase() : 'π.χ. επίπληξη'} value=${acc} onChange=${(e: any) => setAcc(e.target.value)}/></div>
        <div className="field" style=${{ maxWidth: '130px' }}><label className="field__label" htmlFor="ls-m">Ως ημέρες</label><input id="ls-m" className="ui-input" type="number" min="1" placeholder="χωρίς όριο" value=${max} onChange=${(e: any) => setMax(e.target.value)}/></div>`}
      ${id === 'weaponOut' && html`<div className="field"><label className="field__label" htmlFor="ls-b">Λόγος εισαγωγής</label><input id="ls-b" className="ui-input" placeholder=${n ? 'ΛΗΞ ' + n : 'π.χ. ΛΗΞ ΦΡΟΥΡΑΣ'} value=${back} onChange=${(e: any) => setBack(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>`}
      ${id === 'medKinds' && html`<div className="field" style=${{ maxWidth: '130px' }}><label className="field__label" htmlFor="ls-k">Κωδικός</label><input id="ls-k" className="ui-input" placeholder="π.χ. Ε.Γ" value=${code} onChange=${(e: any) => { setCode(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') add(); }}/></div>
        <div className="field" style=${{ flex: 'none' }}><label className="ui-checkrow" style=${{ height: '38px' }}><input id="ls-w" type="checkbox" className="ui-check" checked=${warn} onChange=${(e: any) => setWarn(e.target.checked)}/> Μόνο προειδοποίηση</label></div>`}
      <div className="field" style=${{ flex: 0 }}><${Button} disabled=${!name.trim()} onClick=${add}>Πρόσθεσε<//></div></div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}
const PH: Record<ListId, string> = { soldierRanks: 'π.χ. ΚΛΗΡ', cadreRanks: 'π.χ. ΣΜΧΟΣ', specs: 'π.χ. ΠΝ', punKinds: 'π.χ. Επίπληξη', leaveKinds: 'π.χ. Γονική', cadreAbs: 'π.χ. Σχολείο', medKinds: 'π.χ. ΕΛ ΓΥΜΝ', siUnarmed: 'π.χ. Ι5', weaponTypes: 'π.χ. M1911', weaponOut: 'π.χ. ΦΡΟΥΡΑ' };
