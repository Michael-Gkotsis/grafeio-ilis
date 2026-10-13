// Σ.Ι. (Michael, 13/10): στις φόρμες dropdown Σ.Ι. (Ι1–Ι4), για το Ι3 ΜΕ ΟΠΛΟ / ΑΟΠΛΟ, και για Ι3/Ι4 κατηγορία πάθησης.
// Ρυθμίσεις › Σ.Ι.: για κάθε Σ.Ι. (και, αν θες, ανά κατηγορία πάθησης) σε ποιες υπηρεσίες μπαίνει, μία στήλη ανά υπηρεσία.
// Η «Δυνατότητα υπηρεσιών» του ατόμου μένει από πάνω.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, useToast } from '../ui';
import { useStore } from '../store';
import { blocksOf, PHASE_NAME, type BlockDef, type Person } from '../../shared/domain';
import { type UserLists } from '../../shared/ranks';
import { parseSi, siBases, siCats, siCellOf, siCombos, siLabel, siName, siOf, siRowKey, siSubs, SI_BASES, SI_CAT_BASES, SI_CATS, type SiConfig } from '../../shared/si';
type P = any;
const OTHER = '\u0001other';

// Σ.Ι., ΜΕ ΟΠΛΟ / ΑΟΠΛΟ και κατηγορία πάθησης. Ό,τι δεν αναγνωρίζεται γράφεται με το χέρι (όπως ο βαθμός).
export function SiField({ id, value, cat, onChange }: P) {
  const { state } = useStore(); const cfg = state.settings.lists?.si;
  const parts = parseSi(value, cfg);
  const known = !value || !!parts?.ok;
  const [typing, setTyping] = useState(!known);
  const bases = siBases(cfg); if (parts?.ok && !bases.includes(parts.base)) bases.push(parts.base);
  const base = typing ? OTHER : parts?.ok ? parts.base : '';
  const subs = parts?.ok ? siSubs(parts.base) : [];
  const hasCat = !typing && !!parts?.ok && SI_CAT_BASES.includes(parts.base);
  const cats = siCats(cfg); if (cat && !cats.includes(cat)) cats.push(cat);
  const setBase = (b: string) => {
    if (b === OTHER) { setTyping(true); onChange(known ? '' : value, ''); return; }
    setTyping(false);
    const keep = parts?.ok && siSubs(b).includes(parts.sub) ? parts.sub : '';
    onChange(b ? siLabel(b, keep) : '', SI_CAT_BASES.includes(b) ? cat || '' : '');
  };
  return html`<div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${id}>Σ.Ι.</label>
    <div style=${{ display: 'flex', gap: '6px' }}>
      <select id=${id} className="ui-input" style=${{ flex: 1 }} value=${base} onChange=${(e: any) => setBase(e.target.value)}>
        <option value="">—</option>${bases.map(b => html`<option key=${b} value=${b}>${b}</option>`)}<option value=${OTHER}>Άλλο (γράψε το)…</option>
      </select>
      ${!typing && subs.length > 0 && html`<select className="ui-input" style=${{ flex: 1.4 }} aria-label="Με όπλο ή άοπλος" value=${parts!.sub} onChange=${(e: any) => onChange(siLabel(parts!.base, e.target.value), cat || '')}>
        <option value="">—</option>${subs.map(s => html`<option key=${s} value=${s}>${s}</option>`)}
      </select>`}
      ${hasCat && html`<select className="ui-input" style=${{ flex: 1.6 }} aria-label="Κατηγορία πάθησης" value=${cat || ''} onChange=${(e: any) => onChange(value, e.target.value)}>
        <option value="">— πάθηση</option>${cats.map(c => html`<option key=${c} value=${c}>${c}</option>`)}
      </select>`}
    </div>
    ${typing && html`<input className="ui-input" style=${{ marginTop: '6px' }} aria-label="Σ.Ι. με το χέρι" placeholder="π.χ. Ι3 ΑΟΠΛΟ" value=${value || ''} autoFocus onChange=${(e: any) => onChange(e.target.value, '')}/>`}
  </div>`;
}

const CAT_SEP = ' · ';

export function SiCard() {
  const { state, run } = useStore(); const toast = useToast();
  const lists: UserLists = state.settings.lists || {};
  const cfg: SiConfig = lists.si || {};
  const cells = cfg.cells || {};
  const [nb, setNb] = useState(''); const [nc, setNc] = useState('');
  const [catRow, setCatRow] = useState('Ι3 ΑΟΠΛΟ'); const [catPick, setCatPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // στήλες: οι υπηρεσίες του εντύπου που ισχύει και μετά όσες έχει μόνο το άλλο έντυπο (χωρίς Λ/Υ-Δ/Υ και όσες αφαιρέθηκαν)
  const cols = useMemo(() => {
    const st = state.settings; const other = st.phase === 'spen' ? 'sven' : 'spen';
    const seen = new Set<string>(); const out: (BlockDef & { only?: string })[] = [];
    for (const b of blocksOf(st) || []) if (b.kind !== 'ly' && !b.hidden && !seen.has(b.id)) { seen.add(b.id); out.push(b); }
    for (const b of blocksOf(st, other) || []) if (b.kind !== 'ly' && !b.hidden && !seen.has(b.id)) { seen.add(b.id); out.push({ ...b, only: PHASE_NAME[other] }); }
    return out;
  }, [state.settings]);
  // πόσοι (σε δύναμη) έχουν κάθε γραμμή, και ποιες τιμές δεν αναγνωρίζονται
  const { count, odd, seenBases } = useMemo(() => {
    const count = new Map<string, number>(); const odd = new Map<string, number>(); const seenBases = new Set<string>();
    const add = (k: string) => count.set(k, (count.get(k) || 0) + 1);
    for (const p of state.people as Person[]) {
      if (!p.active || !p.si) continue;
      const x = siOf(p, lists);
      if (!x.known) { odd.set(p.si, (odd.get(p.si) || 0) + 1); continue; }
      add(x.label); seenBases.add(parseSi(x.label, cfg)!.base);
      if (x.cat) add(siRowKey(x.label, x.cat));
    }
    return { count, odd, seenBases };
  }, [state.people, lists]);
  // γραμμές: κάθε Σ.Ι. και από κάτω όσες κατηγορίες πάθησης έχουν δικούς τους κανόνες
  const rows = useMemo(() => {
    const main = siCombos(cfg); for (const b of seenBases) if (!main.includes(b)) main.push(b);
    return main.flatMap(l => [{ label: l, cat: '' }, ...Object.keys(cells).filter(k => k.startsWith(l + CAT_SEP)).map(k => ({ label: l, cat: k.slice(l.length + CAT_SEP.length) }))]);
  }, [cfg, cells, seenBases]);
  const catRows = siCombos(cfg).filter(l => SI_CAT_BASES.includes(parseSi(l, cfg)?.base || ''));

  const save = (si: SiConfig, text: string) => run({ t: 'setSettings', settings: { lists: { ...lists, si } }, text: 'Σ.Ι. ' + text }, false);
  const toggle = async (label: string, cat: string, b: BlockDef) => {
    const next = !siCellOf(lists, label, cat, b).ok;
    // ό,τι θα ίσχυε χωρίς αυτό το κελί: για κατηγορία πάθησης η Σ.Ι. της, αλλιώς η προεπιλογή
    const inherited = cat ? siCellOf(lists, label, '', b).ok : siCellOf({ ...lists, si: { ...cfg, cells: {} } }, label, '', b).ok;
    const k = siRowKey(label, cat); const row = { ...(cells[k] || {}) };
    if (next === inherited) delete row[b.id]; else row[b.id] = next;
    const nextCells = { ...cells, [k]: row }; if (!cat && !Object.keys(row).length) delete nextCells[k];
    const who = cat ? label + ' ' + cat : label;
    if (await save({ ...cfg, cells: nextCells }, who + ': ' + (next ? 'μπαίνει' : 'δεν μπαίνει') + ' σε ' + b.name)) toast({ text: who + (next ? ' μπαίνει' : ' δεν μπαίνει') + ' σε ' + b.name + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' });
  };
  const resetRow = (label: string, cat: string) => {
    const k = siRowKey(label, cat); const nextCells = { ...cells }; if (cat) nextCells[k] = {}; else delete nextCells[k];
    return save({ ...cfg, cells: nextCells }, (cat ? label + ' ' + cat + ': όπως το ' + label : label + ': όπως στην αρχή'));
  };
  const removeCatRow = (label: string, cat: string) => { const nextCells = { ...cells }; delete nextCells[siRowKey(label, cat)]; return save({ ...cfg, cells: nextCells }, label + ' ' + cat + ': όπως το ' + label); };
  const addCatRow = async () => {
    if (!catPick) return;
    const k = siRowKey(catRow, catPick); if (cells[k]) { setErr('Το ' + catRow + ' ' + catPick + ' έχει ήδη δικούς του κανόνες.'); return; }
    if (await save({ ...cfg, cells: { ...cells, [k]: {} } }, catRow + ' ' + catPick + ': δικοί του κανόνες')) { setCatPick(''); setErr(null); toast({ text: 'Άλλαξε τα τσεκ στη γραμμή ' + catRow + ' ' + catPick + '. Μέχρι τότε ισχύει ό,τι και για το ' + catRow + '.' }); }
  };
  const addBase = async () => {
    const n = siName(nb); if (!n) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    if (siBases(cfg).includes(n)) { setErr('Η Σ.Ι. «' + n + '» υπάρχει ήδη.'); return; }
    if (await save({ ...cfg, add: [...(cfg.add || []), n] }, '+ ' + n)) { toast({ text: 'Μπήκε η Σ.Ι. ' + n }); setNb(''); setErr(null); }
  };
  const addCat = async () => {
    const n = siName(nc); if (!n) return;
    if (siCats(cfg, true).includes(n)) { setErr('Η κατηγορία «' + n + '» υπάρχει ήδη.'); return; }
    if (await save({ ...cfg, cats: { ...(cfg.cats || {}), add: [...(cfg.cats?.add || []), n] } }, '+ κατηγορία ' + n)) { toast({ text: 'Μπήκε η κατηγορία πάθησης ' + n }); setNc(''); setErr(null); }
  };
  const usedCat = (c: string) => (state.people as Person[]).some(p => p.siCat && siName(p.siCat) === c) || Object.keys(cells).some(k => k.endsWith(CAT_SEP + c));
  const removeCat = (c: string) => save({ ...cfg, cats: { ...(cfg.cats || {}), add: (cfg.cats?.add || []).filter(x => siName(x) !== c) } }, 'σβήστηκε η κατηγορία ' + c);
  const ownBase = (b: string) => !SI_BASES.includes(b) && (cfg.add || []).some(x => siName(x) === b);
  const removeBase = (b: string) => save({ ...cfg, add: (cfg.add || []).filter(x => siName(x) !== b), cells: Object.fromEntries(Object.entries(cells).filter(([k]) => k !== b && !k.startsWith(b + CAT_SEP))) }, 'σβήστηκε το ' + b);
  const legacy = (lists.siUnarmed?.add || []).length > 0 || (lists.siUnarmed?.hide || []).length > 0;
  const ownCats = siCats(cfg).filter(c => !SI_CATS.includes(c));

  return html`<${Card} title="Σ.Ι.: σε ποιες υπηρεσίες μπαίνει">
    <p className="note" style=${{ marginTop: 0 }}>Μία στήλη για κάθε υπηρεσία. Αρχικά ο άοπλος (Ι3 ΑΟΠΛΟ, Ι4) δεν μπαίνει σε ένοπλη υπηρεσία και όλοι οι άλλοι μπαίνουν παντού· αν κάνεις μια υπηρεσία ένοπλη ή άοπλη (κάρτα Υπηρεσίες), αλλάζει και εδώ. Ό,τι ξετσεκάρεις, η αυτόματη συμπλήρωση δεν τον βάζει· με το χέρι μπαίνει μόνο με αιτία. Η «Δυνατότητα υπηρεσιών» στην κάρτα κάθε ατόμου ισχύει από πάνω. Λ/Υ και Δ/Υ ορίζονται με το χέρι, όπως πριν.</p>
    <div style=${{ overflowX: 'auto' }}><table className="sigrid">
      <thead><tr><th>Σ.Ι.</th><th>Άτομα</th>${cols.map(b => html`<th key=${b.id}>${b.name}${b.armed && html`<span className="sigrid__tag">ένοπλη</span>`}${b.only && html`<span className="sigrid__tag">μόνο ${b.only}</span>`}</th>`)}<th></th></tr></thead>
      <tbody>${rows.map(({ label, cat }) => {
        const k = siRowKey(label, cat); const n = count.get(k) || 0; const custom = !!cells[k] && Object.keys(cells[k]).length > 0;
        const sub = !!parseSi(label, cfg)?.sub;
        return html`<tr key=${k} className=${cat ? 'is-cat' : sub ? 'is-sub' : ''}>
          <td>${cat ? html`<span className="muted">${label}</span> <b>${cat}</b>` : html`<b>${label}</b>`}${!cat && ownBase(label) && html` <${Badge} tone="info">δική σου<//>`}</td>
          <td className="num">${n || ''}</td>
          ${cols.map(b => { const c = siCellOf(lists, label, cat, b); return html`<td key=${b.id} className=${c.from === (cat ? 'cat' : 'row') ? 'is-set' : ''}><input type="checkbox" className="ui-check" aria-label=${(cat ? label + ' ' + cat : label) + ': ' + b.name} checked=${c.ok} onChange=${() => toggle(label, cat, b)}/></td>`; })}
          <td style=${{ textAlign: 'right' }}>${custom && html`<${Button} size="sm" variant="ghost" data-tip=${cat ? 'Ό,τι και για το ' + label : 'Όπως στην αρχή: ο άοπλος όχι σε ένοπλη υπηρεσία'} onClick=${() => resetRow(label, cat)}>Επαναφορά<//>`}${cat && html`<${Button} size="sm" variant="ghost" aria-label=${'Χωρίς δικούς κανόνες: ' + label + ' ' + cat} data-tip=${'Να ισχύει ό,τι και για το ' + label} onClick=${() => removeCatRow(label, cat)}>✕<//>`}${!cat && ownBase(label) && !n && html`<${Button} size="sm" variant="ghost" aria-label=${'Σβήσε ' + label} onClick=${() => removeBase(label)}>✕<//>`}</td>
        </tr>`;
      })}</tbody>
    </table></div>
    ${odd.size > 0 && html`<${Alert} tone="warn"><span><b>Σ.Ι. που δεν αναγνωρίζονται:</b> ${[...odd].map(([v, n]) => '«' + v + '» (' + n + ')').join(' · ')}. Για αυτούς ισχύει ο παλιός κανόνας (άοπλος όποιος έχει «ΑΟΠΛ» ή αρχίζει από «Ι4»). Διόρθωσέ τους από τη «Διόρθωση στοιχείων».</span><//>`}
    ${legacy && html`<p className="note">Η λίστα «Σ.Ι. άοπλων» στις Λίστες ισχύει ακόμα για το ποιος είναι αρχικά άοπλος.</p>`}
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field" style=${{ maxWidth: '150px' }}><label className="field__label" htmlFor="si-cr">Δικοί κανόνες για</label><select id="si-cr" className="ui-input" value=${catRow} onChange=${(e: any) => setCatRow(e.target.value)}>${catRows.map(l => html`<option key=${l} value=${l}>${l}</option>`)}</select></div>
      <div className="field"><label className="field__label" htmlFor="si-cp">με πάθηση</label><select id="si-cp" className="ui-input" value=${catPick} onChange=${(e: any) => { setCatPick(e.target.value); setErr(null); }}><option value="">—</option>${siCats(cfg).map(c => html`<option key=${c} value=${c}>${c}</option>`)}</select></div>
      <div className="field" style=${{ flex: 0 }}><${Button} variant="outline" disabled=${!catPick} onClick=${addCatRow}>Πρόσθεσε γραμμή<//></div>
    </div>
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '8px' }}>
      <div className="field"><label className="field__label" htmlFor="si-b">Νέα Σ.Ι.</label><input id="si-b" className="ui-input" placeholder="π.χ. Ι5" value=${nb} onChange=${(e: any) => { setNb(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') addBase(); }}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} variant="outline" disabled=${!nb.trim()} onClick=${addBase}>Πρόσθεσε<//></div>
      <div className="field"><label className="field__label" htmlFor="si-c">Νέα κατηγορία πάθησης</label><input id="si-c" className="ui-input" placeholder="π.χ. ΓΑΣΤΡΕΝΤΕΡΟΛΟΓΙΚΟ" value=${nc} onChange=${(e: any) => { setNc(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') addCat(); }}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} variant="outline" disabled=${!nc.trim()} onClick=${addCat}>Πρόσθεσε<//></div>
    </div>
    ${ownCats.length > 0 && html`<p className="note">Δικές σου κατηγορίες: ${ownCats.map((c, i) => html`<span key=${c}>${i ? ', ' : ''}${c}${!usedCat(c) && html` <${Button} variant="link" aria-label=${'Σβήσε ' + c} onClick=${() => removeCat(c)}>✕<//>`}</span>`)}</p>`}
    <p className="note">Οι κατηγορίες πάθησης ακολουθούν τις ενότητες του Γενικού Πίνακα Νοσημάτων (π.δ. 11/2014). Μένουν μόνο στην εφαρμογή: στο Excel η Σ.Ι. γράφεται όπως πριν (π.χ. «Ι3 ΑΟΠΛΟ»), για να μη χαλάσει κάποιος τύπος που τη μετράει.</p>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}
