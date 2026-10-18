// Ρυθμίσεις › Μονάδα και έντυπα (Michael, 18/10): τύπος μονάδας (Ίλη → ΗΚΑΙ, Λόχος → ΗΚΑΛ) και όλες οι γραμμές
// (βαθμοί) της ΗΚΑΙ, με τους βαθμούς που μετρούν σε κάθε μία. Δικές σου γραμμές (π.χ. Λοχαγοί) μπαίνουν στο έντυπο ως
// νέες γραμμές με τους τύπους τους και μετρούν στα σύνολα (main/exports.ts).
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Segmented, useToast } from '../ui';
import { useStore } from '../store';
import { guessHk, hkRowsOf, itemKey, listOf, optionsOf, type HkRowDef } from '../../shared/ranks';
import { hkaiCounts, hkRankOf } from '../../shared/rules';
import { HK, UNIT_KINDS, hkRowLabel, unitKindOf, type UnitKind } from '../../shared/unit';
type P = any;

// Ίλη/Επιλαρχία ή Λόχος/Τάγμα (στις Ρυθμίσεις και στη Νέα ΕΣΣΟ)
export function UnitKindField({ value, onChange }: { value: UnitKind; onChange: (k: UnitKind) => void }) {
  return html`<div className="field"><span className="field__label">Τύπος μονάδας</span>
    <${Segmented} value=${value} onChange=${onChange} items=${UNIT_KINDS.map(k => ({ value: k.id, label: k.label + ' (' + k.report + ')' }))}/>
    <span className="field__help">Η αναφορά λέγεται ΗΚΑΙ σε ίλη και ΗΚΑΛ σε λόχο. Αλλάζουν μόνα τους τα ονόματα στην εφαρμογή και στα έντυπα (τίτλος, γραμμές αξιωματικών, «ΔΚΤΗΣ ΙΛΗΣ» → «ΔΚΤΗΣ ΛΟΧΟΥ»). Δες και την κεφαλίδα από κάτω.</span></div>`;
}

const GROUPS: ['off' | 'nco', string, string][] = [['off', 'Αξιωματικοί', 'ΣΥΝΟΛΟ ΑΞΚΩΝ'], ['nco', 'Οπλίτες', 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ']];
const EMPTY = { name: '', grp: 'off' as 'off' | 'nco', after: '', ranks: [] as string[], edit: null as string | null };

export function HkRowsCard() {
  const { state, run, today } = useStore(); const toast = useToast();
  const lists = state.settings.lists || {}; const own: HkRowDef[] = lists.hkRows || [];
  const R = hkRowsOf(lists); const kind = unitKindOf(state.settings);
  const [f, setF] = useState(EMPTY); const [err, setErr] = useState<string | null>(null);
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

  const save = async (rows: HkRowDef[], text: string) => run({ t: 'setHkRows', rows, text: 'γραμμές της ' + HK() + ': ' + text }, false);
  const submit = async () => {
    const name = f.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Γράψε το όνομα της γραμμής, π.χ. Λοχαγοί'); return; }
    const k = itemKey(name);
    if ([...R.off, ...R.nco].some(r => r !== f.edit && (itemKey(r) === k || itemKey(hkRowLabel(r, 'lochos')) === k)) || /ΣΥΝΟΛΟ/.test(k)) { setErr('Υπάρχει ήδη γραμμή «' + name + '»'); return; }
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

  return html`<${Card} title=${'Γραμμές (βαθμοί) της ' + HK()}>
    <p className="note" style=${{ marginTop: 0 }}>Όλες οι γραμμές του εντύπου με τη σειρά τους, οι βαθμοί που μετρούν σε κάθε μία και πόσοι είναι σήμερα. Μια δική σου γραμμή (π.χ. Λοχαγοί, Ταγματάρχες) μπαίνει στην ${HK()} ως νέα γραμμή, με τους τύπους της, και μετρά στο σύνολο της ομάδας της.</p>
    ${GROUPS.map(([g, title, total]) => html`<div key=${g} className="field"><span className="field__label">${title}</span>
      <ul className="hist">${(g === 'off' ? R.off : R.nco).map(r => { const mine = own.find(x => x.name === r); const rk = [...(ranksOf.get(r) || [])];
        return html`<li key=${r}><b>${hkRowLabel(r, kind)}</b>${mine && html` <${Badge} tone="info">δική σου<//>`} <span className="muted">· ${counts[r]?.n || 0} σήμερα${rk.length ? ' · ' + rk.join(', ') : ''}</span>
          ${mine && html` <${Button} size="sm" variant="ghost" onClick=${() => edit(mine)}>Αλλαγή<//><${Button} size="sm" variant="ghost" onClick=${() => drop(r)}>Σβήσε<//>`}</li>`; })}
        <li className="muted">${total}</li></ul></div>`)}
    <div className="field"><span className="field__label">${f.edit ? 'Αλλαγή γραμμής «' + f.edit + '»' : 'Νέα γραμμή'}</span>
      <div className="field-row">
        <div className="field"><label className="field__label" htmlFor="hr-n">Όνομα</label><input id="hr-n" className="ui-input" placeholder="π.χ. Λοχαγοί" value=${f.name} onChange=${(e: P) => setF({ ...f, name: e.target.value })}/></div>
        <div className="field" style=${{ flex: 'none' }}><span className="field__label">Ομάδα</span><${Segmented} value=${f.grp} onChange=${(grp: 'off' | 'nco') => setF({ ...f, grp, after: '' })} items=${GROUPS.map(([v, l]) => ({ value: v, label: l }))}/></div>
        <div className="field"><label className="field__label" htmlFor="hr-a">Κάτω από</label><select id="hr-a" className="ui-input" value=${f.after} onChange=${(e: P) => setF({ ...f, after: e.target.value })}>
          <option value="">${'Στο τέλος (πριν το ' + (f.grp === 'off' ? 'ΣΥΝΟΛΟ ΑΞΚΩΝ' : 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ') + ')'}</option>${groupRows(f.grp).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r, kind)}</option>`)}</select></div>
      </div>
      <span className="field__label" style=${{ marginTop: '6px' }}>Βαθμοί που μετρούν εδώ</span>
      <div className="filters" style=${{ flexWrap: 'wrap', gap: '6px' }}>${allRanks.map(r => html`<button key=${r} type="button" className="ui-chip ui-chip--sm" aria-pressed=${f.ranks.includes(r)} onClick=${() => toggleRank(r)}>${r}</button>`)}</div>
      <span className="field__help">Στελέχη και στρατιώτες με αυτούς τους βαθμούς μετρούν σε αυτή τη γραμμή (τα στελέχη μετακινούνται μόνα τους). Χωρίς βαθμό, η γραμμή μένει κενή ώσπου να τη διαλέξεις σε στέλεχος.</span>
      ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
      <div className="toolbar"><${Button} onClick=${submit}>${f.edit ? 'Αποθήκευση' : 'Προσθήκη γραμμής'}<//>${(f.edit || f.name) && html`<${Button} variant="ghost" onClick=${() => { setF(EMPTY); setErr(null); }}>Άκυρο<//>`}</div>
    </div>
  <//>`;
}
