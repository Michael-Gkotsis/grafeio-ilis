// Σ.Ι. (Michael, 13/10): dropdown βασικής (Ι1–Ι4) και κατηγορίας (ΜΕ ΟΠΛΟ / ΑΟΠΛΟ για Ι3, Ι4) στις φόρμες,
// και Ρυθμίσεις › Σ.Ι.: για κάθε συνδυασμό ποιες υπηρεσίες κάνει. Η «Δυνατότητα υπηρεσιών» του ατόμου μένει από πάνω.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, useToast } from '../ui';
import { useStore } from '../store';
import { CAP_KINDS, CAP_ACC, type DutyKind, type Person } from '../../shared/domain';
import { type UserLists } from '../../shared/ranks';
import { parseSi, siBases, siCombos, siCustom, siDefaultDeny, siDenyOf, siLabel, siName, siSubs, SI_BASES, SI_SUBS, type SiConfig } from '../../shared/si';
type P = any;
const OTHER = '\u0001other';

// Δύο dropdown: Σ.Ι. και, όταν έχει, κατηγορία. Ό,τι δεν αναγνωρίζεται γράφεται με το χέρι (όπως ο βαθμός).
export function SiField({ id, value, onChange }: P) {
  const { state } = useStore(); const cfg = state.settings.lists?.si;
  const parts = parseSi(value, cfg);
  const known = !value || !!parts?.ok;
  const [typing, setTyping] = useState(!known);
  const bases = siBases(cfg); if (parts?.ok && !bases.includes(parts.base)) bases.push(parts.base);
  const base = typing ? OTHER : parts?.ok ? parts.base : '';
  const subs = parts?.ok ? siSubs(parts.base, cfg) : [];
  const setBase = (b: string) => {
    if (b === OTHER) { setTyping(true); onChange(known ? '' : value); return; }
    setTyping(false);
    const keep = parts?.ok && siSubs(b, cfg).includes(parts.sub) ? parts.sub : '';
    onChange(b ? siLabel(b, keep) : '');
  };
  return html`<div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${id}>Σ.Ι.</label>
    <div style=${{ display: 'flex', gap: '6px' }}>
      <select id=${id} className="ui-input" style=${{ flex: 1 }} value=${base} onChange=${(e: any) => setBase(e.target.value)}>
        <option value="">—</option>${bases.map(b => html`<option key=${b} value=${b}>${b}</option>`)}<option value=${OTHER}>Άλλο (γράψε το)…</option>
      </select>
      ${!typing && subs.length > 0 && html`<select className="ui-input" style=${{ flex: 1.4 }} aria-label="Κατηγορία Σ.Ι." value=${parts!.sub} onChange=${(e: any) => onChange(siLabel(parts!.base, e.target.value))}>
        <option value="">— κατηγορία</option>${subs.map(s => html`<option key=${s} value=${s}>${s}</option>`)}
      </select>`}
    </div>
    ${typing && html`<input className="ui-input" style=${{ marginTop: '6px' }} aria-label="Σ.Ι. με το χέρι" placeholder="π.χ. Ι3 ΑΟΠΛΟ" value=${value || ''} autoFocus onChange=${(e: any) => onChange(e.target.value)}/>`}
  </div>`;
}

// το κείμενο μετά τη βασική: «Ι 3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ» → «ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ»
const subText = (v: string) => { const t = v.replace(/^\s*[ΙIιi]\s*[\/.]?\s*\d+\s*/, ''); return t !== v ? t : v.replace(/^\S+\s*/, ''); };
const denyTxt = (d: DutyKind[]) => (d.length ? 'όχι ' + d.map(k => CAP_ACC[k]).join(', ') : 'όλες');
const isUnarmedDeny = (d: DutyKind[]) => d.includes('op') && d.includes('sk');

export function SiCard() {
  const { state, run } = useStore(); const toast = useToast();
  const lists: UserLists = state.settings.lists || {};
  const cfg: SiConfig = lists.si || {};
  const [nb, setNb] = useState(''); const [subBase, setSubBase] = useState('Ι3'); const [ns, setNs] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // πόσοι (σε δύναμη) έχουν κάθε συνδυασμό, και ποιες τιμές δεν αναγνωρίζονται
  const { count, odd, seenBases } = useMemo(() => {
    const count = new Map<string, number>(); const odd = new Map<string, { n: number; base: string | null }>(); const seenBases = new Set<string>();
    for (const p of state.people as Person[]) {
      if (!p.active || !p.si) continue;
      const x = parseSi(p.si, cfg);
      if (x?.ok) { const l = siLabel(x.base, x.sub); count.set(l, (count.get(l) || 0) + 1); seenBases.add(x.base); }
      else { const o = odd.get(p.si) || { n: 0, base: x ? x.base : null }; o.n++; odd.set(p.si, o); }
    }
    return { count, odd, seenBases };
  }, [state.people, cfg]);
  // και οι βασικές που βρέθηκαν στο Δυναμολόγιο χωρίς να είναι στη λίστα (π.χ. Ι5)
  const rows = useMemo(() => {
    const out = siCombos(cfg);
    for (const b of seenBases) if (!out.includes(b)) out.push(b);
    return out;
  }, [cfg, seenBases]);
  const save = (si: SiConfig, text: string) => run({ t: 'setSettings', settings: { lists: { ...lists, si } }, text: 'Σ.Ι. ' + text }, false);
  const setDeny = async (label: string, d: DutyKind[]) => {
    const def = siDefaultDeny(label, lists);
    const same = d.length === def.length && d.every(k => def.includes(k));
    const deny = { ...(cfg.deny || {}) }; if (same) delete deny[label]; else deny[label] = CAP_KINDS.map(x => x[0]).filter(k => d.includes(k));
    if (await save({ ...cfg, deny }, label + ': ' + denyTxt(d))) toast({ text: label + ': ' + (same ? 'όπως η προεπιλογή, ' : '') + denyTxt(d) + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' });
  };
  const toggle = (label: string, k: DutyKind) => { const d = siDenyOf(label, lists); setDeny(label, d.includes(k) ? d.filter(x => x !== k) : [...d, k]); };
  const ownBase = (b: string) => !SI_BASES.includes(b) && (cfg.add || []).some(x => siName(x) === b);
  const ownSub = (b: string, s: string) => !(SI_SUBS[b] || []).includes(s) && (cfg.subs?.[b] || []).some(x => siName(x) === s);
  const dropDeny = (pred: (l: string) => boolean) => Object.fromEntries(Object.entries(cfg.deny || {}).filter(([l]) => !pred(l)));
  const addBase = async () => {
    const n = siName(nb); if (!n) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    if (siBases(cfg).includes(n)) { setErr('Η Σ.Ι. «' + n + '» υπάρχει ήδη.'); return; }
    if (await save({ ...cfg, add: [...(cfg.add || []), n] }, '+ ' + n)) { toast({ text: 'Μπήκε η Σ.Ι. ' + n }); setNb(''); setErr(null); }
  };
  const addSub = async (b: string, raw: string) => {
    const n = siName(raw); if (!n || !b) return;
    if (/[,"]/.test(n)) { setErr('Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.'); return; }
    if (siSubs(b, cfg).includes(n)) { setErr('Η κατηγορία «' + n + '» υπάρχει ήδη στο ' + b + '.'); return; }
    if (await save({ ...cfg, subs: { ...(cfg.subs || {}), [b]: [...(cfg.subs?.[b] || []), n] } }, '+ ' + siLabel(b, n))) { toast({ text: 'Μπήκε η κατηγορία ' + siLabel(b, n) + '. Όρισε στον πίνακα ποιες υπηρεσίες κάνει.' }); setNs(''); setErr(null); }
  };
  const removeBase = (b: string) => save({ ...cfg, add: (cfg.add || []).filter(x => siName(x) !== b), subs: Object.fromEntries(Object.entries(cfg.subs || {}).filter(([k]) => k !== b)), deny: dropDeny(l => l === b || l.startsWith(b + ' ')) }, 'σβήστηκε το ' + b);
  const removeSub = (b: string, s: string) => save({ ...cfg, subs: { ...(cfg.subs || {}), [b]: (cfg.subs?.[b] || []).filter(x => siName(x) !== s) }, deny: dropDeny(l => l === siLabel(b, s)) }, 'σβήστηκε το ' + siLabel(b, s));
  const legacy = (lists.siUnarmed?.add || []).length > 0 || (lists.siUnarmed?.hide || []).length > 0;

  return html`<${Card} title="Σ.Ι.: ποιες υπηρεσίες κάνει">
    <p className="note" style=${{ marginTop: 0 }}>Για κάθε Σ.Ι. τσέκαρε τις υπηρεσίες που κάνει. Ό,τι δεν κάνει, η αυτόματη συμπλήρωση δεν τον βάζει· με το χέρι μπαίνει μόνο με αιτία. Η «Δυνατότητα υπηρεσιών» στην κάρτα κάθε ατόμου ισχύει από πάνω. Όποιος δεν κάνει ούτε οπλοφύλακα ούτε σκοπιά μετρά ως άοπλος στα «Αυστηρά Άοπλοι». Λ/Υ και Δ/Υ ορίζονται με το χέρι, όπως πριν.</p>
    <div style=${{ overflowX: 'auto' }}><table className="sigrid">
      <thead><tr><th>Σ.Ι.</th><th>Άτομα</th>${CAP_KINDS.map(([k, l]) => html`<th key=${k}>${l}</th>`)}<th></th></tr></thead>
      <tbody>${rows.map(label => {
        const d = siDenyOf(label, lists); const x = parseSi(label, cfg); const b = x?.base || label; const s = x?.sub || '';
        const mine = s ? ownSub(b, s) : ownBase(b); const n = count.get(label) || 0;
        return html`<tr key=${label} className=${s ? 'is-sub' : ''}>
          <td><b>${label}</b>${isUnarmedDeny(d) && html` <${Badge} tone="outline">άοπλος<//>`}${mine && html` <${Badge} tone="info">δικό σου<//>`}</td>
          <td className="num">${n || ''}</td>
          ${CAP_KINDS.map(([k, l]) => html`<td key=${k}><input type="checkbox" className="ui-check" aria-label=${label + ': ' + l} checked=${!d.includes(k)} onChange=${() => toggle(label, k)}/></td>`)}
          <td style=${{ textAlign: 'right' }}>${siCustom(label, lists) && html`<${Button} size="sm" variant="ghost" data-tip=${'Προεπιλογή: ' + denyTxt(siDefaultDeny(label, lists))} onClick=${() => setDeny(label, siDefaultDeny(label, lists))}>Προεπιλογή<//>`}${mine && !n && html`<${Button} size="sm" variant="ghost" aria-label=${'Σβήσε ' + label} onClick=${() => (s ? removeSub(b, s) : removeBase(b))}>✕<//>`}</td>
        </tr>`;
      })}</tbody>
    </table></div>
    ${odd.size > 0 && html`<${Alert} tone="warn"><span><b>Σ.Ι. που δεν αναγνωρίζονται:</b> ${[...odd].map(([v, o], i) => html`<span key=${v}>${i ? ' · ' : ''}«${v}» (${o.n})${o.base && html` <${Button} variant="link" onClick=${() => addSub(o.base!, subText(v))}>κατηγορία του ${o.base}<//>`}</span>`)}. Για αυτούς ισχύει ο παλιός κανόνας (άοπλος όποιος έχει «ΑΟΠΛ» ή αρχίζει από «Ι4»). Διόρθωσέ τους από τη «Διόρθωση στοιχείων» ή πρόσθεσε την κατηγορία.</span><//>`}
    ${legacy && html`<p className="note">Η λίστα «Σ.Ι. άοπλων» στις Λίστες ισχύει ακόμα για τις προεπιλογές του πίνακα.</p>`}
    <div className="field-row" style=${{ alignItems: 'flex-end', marginTop: '12px' }}>
      <div className="field"><label className="field__label" htmlFor="si-b">Νέα Σ.Ι.</label><input id="si-b" className="ui-input" placeholder="π.χ. Ι5" value=${nb} onChange=${(e: any) => { setNb(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') addBase(); }}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} variant="outline" disabled=${!nb.trim()} onClick=${addBase}>Πρόσθεσε<//></div>
      <div className="field" style=${{ maxWidth: '110px' }}><label className="field__label" htmlFor="si-sb">Κατηγορία στο</label><select id="si-sb" className="ui-input" value=${subBase} onChange=${(e: any) => setSubBase(e.target.value)}>${siBases(cfg).map(b => html`<option key=${b} value=${b}>${b}</option>`)}</select></div>
      <div className="field"><label className="field__label" htmlFor="si-s">Νέα κατηγορία</label><input id="si-s" className="ui-input" placeholder="π.χ. ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ" value=${ns} onChange=${(e: any) => { setNs(e.target.value); setErr(null); }} onKeyDown=${(e: any) => { if (e.key === 'Enter') addSub(subBase, ns); }}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} variant="outline" disabled=${!ns.trim()} onClick=${() => addSub(subBase, ns)}>Πρόσθεσε<//></div>
    </div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}
