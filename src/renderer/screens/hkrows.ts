// Ρυθμίσεις › Μονάδα και έντυπα (Michael, 18/10): τύπος μονάδας (Ίλη → ΗΚΑΙ, Λόχος → ΗΚΑΛ) και όλες οι γραμμές
// (βαθμοί) της ΗΚΑΙ, με τους βαθμούς που μετρούν σε κάθε μία. Δικές σου γραμμές (π.χ. Λοχαγοί) μπαίνουν στο έντυπο ως
// νέες γραμμές με τους τύπους τους και μετρούν στα σύνολα (main/exports.ts). Κάθε γραμμή, και οι βασικές, παίρνει
// άλλο όνομα (lists.hkNames) χωρίς να αλλάξει το κλειδί της. Ανοίγει και από την ΗΚΑΙ (Michael, 18/10: «extend ή άλλο όνομα»).
import { useEffect, useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, Segmented, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { guessHk, hkRowsOf, itemKey, listOf, optionsOf, type HkRowDef } from '../../shared/ranks';
import { hkaiCounts, hkRankOf } from '../../shared/rules';
import { HK, HK_HEAD_FORM, UNIT_KINDS, formText, hkRowLabel, hkRowName, type UnitKind } from '../../shared/unit';
type P = any;

// Ίλη/Επιλαρχία ή Λόχος/Τάγμα (στις Ρυθμίσεις και στη Νέα ΕΣΣΟ)
export function UnitKindField({ value, onChange }: { value: UnitKind; onChange: (k: UnitKind) => void }) {
  return html`<div className="field"><span className="field__label">Τύπος μονάδας</span>
    <${Segmented} value=${value} onChange=${onChange} items=${UNIT_KINDS.map(k => ({ value: k.id, label: k.label + ' (' + k.report + ')' }))}/>
    <span className="field__help">Η αναφορά λέγεται ΗΚΑΙ σε ίλη και ΗΚΑΛ σε λόχο. Αλλάζουν μόνα τους τα ονόματα στην εφαρμογή και στα έντυπα (τίτλος, γραμμές αξιωματικών, «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ»). Δες και την κεφαλίδα από κάτω.</span></div>`;
}

const GROUPS: ['off' | 'nco', string, string][] = [['off', 'Αξιωματικοί', 'ΣΥΝΟΛΟ ΑΞΚΩΝ'], ['nco', 'Οπλίτες', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ']];
const EMPTY = { name: '', grp: 'off' as 'off' | 'nco', after: '', ranks: [] as string[], edit: null as string | null };

// «Γραμμές και ονόματα…»: η ίδια κάρτα σε παράθυρο, από την ΗΚΑΙ και από τα «Στελέχη ανά βαθμό»
export function HkRowsButton({ label = 'Γραμμές και ονόματα…' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return html`<${Button} size="sm" variant="outline" onClick=${() => setOpen(true)} data-tip=${'Νέα γραμμή (π.χ. Λοχαγοί) ή άλλο όνομα σε γραμμή της ' + HK()}>${label}<//>
    ${open && html`<${Dialog} size="lg" title=${'Γραμμές (βαθμοί) της ' + HK()} onClose=${() => setOpen(false)}><${HkRowsCard} bare/><//>`}`;
}

export function HkRowsCard({ bare }: { bare?: boolean }) {
  const { state, run, today } = useStore(); const toast = useToast();
  const lists = state.settings.lists || {}; const own: HkRowDef[] = lists.hkRows || []; const names = lists.hkNames || {};
  const R = hkRowsOf(lists); const st = state.settings;
  const [f, setF] = useState(EMPTY); const [err, setErr] = useState<string | null>(null);
  const [ren, setRen] = useState<{ key: string; name: string } | null>(null);
  // κάθε βαθμός (των λιστών και όσων υπάρχουν ήδη) στη γραμμή όπου μετρά: στελέχη με τη «Γραμμή» τους, στρατιώτες από τον βαθμό
  const cadreRanks = useMemo(() => optionsOf(listOf(lists, 'cadreRanks'), state.cadreList.map(c => c.rank)), [lists, state.cadreList]);
  const soldierRanks = useMemo(() => optionsOf(listOf(lists, 'soldierRanks'), state.people.filter(p => p.active).map(p => p.rank)), [lists, state.people]);
  const ranksOf = useMemo(() => {
    const m = new Map<string, Set<string>>(); const add = (row: string, r: string) => { if (!m.has(row)) m.set(row, new Set()); m.get(row)!.add(r); };
    cadreRanks.forEach(r => add(guessHk(r, lists), r)); soldierRanks.forEach(r => add(hkRankOf(r, lists), r));
    return m;
  }, [cadreRanks, soldierRanks, lists]);
  const counts = useMemo(() => hkaiCounts(state, today).rank, [state, today]);
  const allRanks = useMemo(() => optionsOf(f.grp === 'off' ? cadreRanks : [...soldierRanks, ...cadreRanks], []), [f.grp, cadreRanks, soldierRanks]);

  const save = async (rows: HkRowDef[], text: string, nm?: Record<string, string>) => run({ t: 'setHkRows', rows, ...(nm ? { names: nm } : {}), text: 'γραμμές της ' + HK() + ': ' + text }, false);
  // ίδιο όνομα με άλλη γραμμή (όπως φαίνεται τώρα ή στον λόχο) ή «ΣΥΝΟΛΟ»
  const taken = (name: string, except: string | null) => { const k = itemKey(name); return /ΣΥΝΟΛΟ/.test(k) || [...R.off, ...R.nco].some(r => r !== except && [r, hkRowName(r, 'lochos'), hkRowLabel(r, st)].some(x => itemKey(x) === k)); };
  const rename = async () => {
    if (!ren) return; const name = ren.name.trim().replace(/\s+/g, ' '); const base = hkRowName(ren.key, st.unitKind === 'lochos' ? 'lochos' : 'ili');
    if (name && taken(name, ren.key)) { setErr('Υπάρχει ήδη γραμμή «' + name + '»'); return; }
    const nm = { ...names }; if (!name || name === base) delete nm[ren.key]; else nm[ren.key] = name;
    if (await save(own, (nm[ren.key] ? base + ' → ' + name : base + ': το αρχικό όνομα'), nm)) { toast({ text: nm[ren.key] ? 'Η γραμμή ' + base + ' θα γράφεται «' + name + '» στην εφαρμογή και στην ' + HK() + '.' : 'Η γραμμή ' + base + ' πήρε ξανά το αρχικό της όνομα.' }); setRen(null); setErr(null); }
  };
  const submit = async () => {
    const name = f.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Γράψε το όνομα της γραμμής, π.χ. Λοχαγοί'); return; }
    if (taken(name, f.edit)) { setErr('Υπάρχει ήδη γραμμή «' + name + '»'); return; }
    const row: HkRowDef = { name, grp: f.grp, ...(f.after ? { after: f.after } : {}), ...(f.ranks.length ? { ranks: f.ranks } : {}) };
    const rows = f.edit ? own.map(x => (x.name === f.edit ? row : x.after === f.edit ? { ...x, after: name } : x)) : [...own, row];
    if (await save(rows, (f.edit ? 'άλλαξε η ' : 'νέα ') + name + (f.ranks.length ? ' (' + f.ranks.join(', ') + ')' : ''))) {
      toast({ text: (f.edit ? 'Άλλαξε η γραμμή ' : 'Μπήκε η γραμμή ') + name + '. Θα γραφτεί στην ' + HK() + ' κάτω από τους ' + hkRowLabel(f.after || (f.grp === 'off' ? R.off : R.nco).slice(-1)[0]) + '.' });
      setF(EMPTY); setErr(null);
    }
  };
  const drop = async (name: string) => {
    const x = own.find(y => y.name === name)!;
    if (await save(own.filter(y => y.name !== name).map(y => (y.after === name ? { ...y, after: x.after } : y)), 'σβήστηκε η ' + name)) toast({ text: 'Σβήστηκε η γραμμή ' + name + '. Όσοι μετρούσαν εκεί γυρνούν στη γραμμή του βαθμού τους (Ctrl+Z για αναίρεση).' });
  };
  const edit = (x: HkRowDef) => { setErr(null); setF({ name: x.name, grp: x.grp, after: x.after || '', ranks: x.ranks || [], edit: x.name }); };
  const toggleRank = (r: string) => setF({ ...f, ranks: f.ranks.includes(r) ? f.ranks.filter(x => x !== r) : [...f.ranks, r] });
  const groupRows = (g: 'off' | 'nco') => (g === 'off' ? R.off : R.nco).filter(r => r !== f.edit);

  const body = html`
    <p className="note" style=${{ marginTop: 0 }}>Όλες οι γραμμές του εντύπου με τη σειρά τους, οι βαθμοί που μετρούν σε κάθε μία και πόσοι είναι σήμερα. Κάθε γραμμή παίρνει «Άλλο όνομα» (γράφεται έτσι και στην ${HK()}). Μια νέα γραμμή (π.χ. Λοχαγοί, Ταγματάρχες) μπαίνει στην ${HK()} με τους τύπους της και μετρά στο σύνολο της ομάδας της.</p>
    ${GROUPS.map(([g, title, total]) => html`<div key=${g} className="field"><span className="field__label">${title}</span>
      <ul className="hist">${(g === 'off' ? R.off : R.nco).map(r => { const mine = own.find(x => x.name === r); const rk = [...(ranksOf.get(r) || [])];
        if (ren?.key === r) return html`<li key=${r}><div className="field-row" style=${{ alignItems: 'center' }}><input className="ui-input" style=${{ flex: 1, minWidth: '180px' }} aria-label=${'Άλλο όνομα για ' + hkRowLabel(r, st)} placeholder=${hkRowName(r, st.unitKind === 'lochos' ? 'lochos' : 'ili')} value=${ren.name} data-autofocus onChange=${(e: P) => setRen({ key: r, name: e.target.value })} onKeyDown=${(e: P) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { e.stopPropagation(); setRen(null); setErr(null); } }}/>
          <${Button} size="sm" onClick=${rename}>Αποθήκευση<//>${names[r] && html`<${Button} size="sm" variant="ghost" onClick=${() => setRen({ key: r, name: '' })} data-tip="Σβήνει το δικό σου όνομα">Αρχικό<//>`}<${Button} size="sm" variant="ghost" onClick=${() => { setRen(null); setErr(null); }}>Άκυρο<//></div></li>`;
        return html`<li key=${r}><b>${hkRowLabel(r, st)}</b>${mine && html` <${Badge} tone="info">δική σου<//>`}${names[r] && html` <span className="muted" data-tip="Το αρχικό όνομα">(${mine ? r : hkRowName(r, st.unitKind === 'lochos' ? 'lochos' : 'ili')})</span>`} <span className="muted">· ${counts[r]?.n || 0} σήμερα${rk.length ? ' · ' + rk.join(', ') : ''}</span>
          <${Button} size="sm" variant="ghost" onClick=${() => { setErr(null); setRen({ key: r, name: names[r] || '' }); }}>Άλλο όνομα<//>${mine && html`<${Button} size="sm" variant="ghost" onClick=${() => edit(mine)}>Αλλαγή<//><${Button} size="sm" variant="ghost" onClick=${() => drop(r)}>Σβήσε<//>`}</li>`; })}
        <li className="muted">${total}</li></ul></div>`)}
    <div className="field"><span className="field__label">${f.edit ? 'Αλλαγή γραμμής «' + f.edit + '»' : 'Νέα γραμμή'}</span>
      <div className="field-row">
        <div className="field"><label className="field__label" htmlFor="hr-n">Όνομα</label><input id="hr-n" className="ui-input" placeholder="π.χ. Λοχαγοί" value=${f.name} onChange=${(e: P) => setF({ ...f, name: e.target.value })}/></div>
        <div className="field" style=${{ flex: 'none' }}><span className="field__label">Ομάδα</span><${Segmented} value=${f.grp} onChange=${(grp: 'off' | 'nco') => setF({ ...f, grp, after: '' })} items=${GROUPS.map(([v, l]) => ({ value: v, label: l }))}/></div>
        <div className="field"><label className="field__label" htmlFor="hr-a">Κάτω από</label><${Select} id="hr-a" className="ui-input" value=${f.after} onChange=${(e: P) => setF({ ...f, after: e.target.value })}>
          <option value="">${'Στο τέλος (πριν το ' + (f.grp === 'off' ? 'ΣΥΝΟΛΟ ΑΞΚΩΝ' : 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ') + ')'}</option>${groupRows(f.grp).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r, st)}</option>`)}<//></div>
      </div>
      <span className="field__label" style=${{ marginTop: '6px' }}>Βαθμοί που μετρούν εδώ</span>
      <div className="filters" style=${{ flexWrap: 'wrap', gap: '6px' }}>${allRanks.map(r => html`<button key=${r} type="button" className="ui-chip ui-chip--sm" aria-pressed=${f.ranks.includes(r)} onClick=${() => toggleRank(r)}>${r}</button>`)}</div>
      <span className="field__help">Στελέχη και στρατιώτες με αυτούς τους βαθμούς μετρούν σε αυτή τη γραμμή (τα στελέχη μετακινούνται μόνα τους). Χωρίς βαθμό, η γραμμή μένει κενή ώσπου να τη διαλέξεις σε στέλεχος.</span>
      ${err && !ren && html`<${Alert} tone="bad"><span>${err}</span><//>`}
      <div className="toolbar"><${Button} onClick=${submit}>${f.edit ? 'Αποθήκευση' : 'Προσθήκη γραμμής'}<//>${(f.edit || f.name) && html`<${Button} variant="ghost" onClick=${() => { setF(EMPTY); setErr(null); }}>Άκυρο<//>`}</div>
    </div>`;
  const all = html`${ren && err && html`<${Alert} tone="bad"><span>${err}</span><//>`}${body}`;
  return bare ? html`<div>${all}</div>` : html`<${Card} title=${'Γραμμές (βαθμοί) της ' + HK()}>${all}<//>`;
}

// Κεφαλίδα της ΗΚΑΙ (Michael, 18/10): οι 2 γραμμές πάνω αριστερά στο έντυπο. Κενό = ό,τι έχει το έντυπο (ΚΕΤΘ / 2Η ΕΠΧΙΑ).
export function HkHeadFields({ value, onChange, kind }: { value: string[]; onChange: (v: string[]) => void; kind?: UnitKind }) {
  return html`<div className="field"><span className="field__label">Κεφαλίδα της ${HK()} (2 γραμμές πάνω αριστερά)</span>
    <div className="field-row">${[0, 1].map(i => html`<input key=${i} className="ui-input" style=${{ flex: 1, minWidth: '160px' }} aria-label=${'Κεφαλίδα της ' + HK() + ', γραμμή ' + (i + 1)} placeholder=${formText({ unitKind: kind }, HK_HEAD_FORM[i])} value=${value[i] || ''} onChange=${(e: P) => { const v = [value[0] || '', value[1] || '']; v[i] = e.target.value; onChange(v); }}/>`)}</div>
    <span className="field__help">Κενό: μένει αυτή του εντύπου (φαίνεται αχνά). Η κεφαλίδα των άλλων εντύπων (ΦΡΟΥΡΑ, εξοδούχοι) είναι στις Ρυθμίσεις › Μονάδα και έντυπα.</span></div>`;
}
export function HkHeadCard() {
  const { state, run } = useStore(); const toast = useToast();
  const cur = state.settings.hkai || {}; const saved = [cur.head?.[0] || '', cur.head?.[1] || ''];
  const [v, setV] = useState(saved); useEffect(() => setV(saved), [saved.join('\n')]); const dirty = v.some((x, i) => x !== saved[i]);
  const save = async () => {
    const head = v.map(x => x.trim()); const hkai = { ...cur }; if (head.some(Boolean)) hkai.head = head; else delete hkai.head;
    if (await run({ t: 'setSettings', settings: { hkai }, text: 'κεφαλίδα της ' + HK() }, false)) toast({ text: head.some(Boolean) ? 'Η ' + HK() + ' θα βγαίνει με κεφαλίδα «' + head.filter(Boolean).join(' / ') + '».' : 'Η ' + HK() + ' κρατά την κεφαλίδα του εντύπου.' });
  };
  return html`<${Card} title=${'Κεφαλίδα της ' + HK()}>
    <${HkHeadFields} value=${v} onChange=${setV} kind=${state.settings.unitKind}/>
    ${dirty && html`<div className="toolbar" style=${{ marginTop: '6px' }}><${Button} size="sm" onClick=${save}>Αποθήκευση<//><${Button} size="sm" variant="ghost" onClick=${() => setV(saved)}>Άκυρο<//></div>`}
  <//>`;
}
