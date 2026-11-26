// features/cadre · «Άδειες και απαλλαγές» (Michael, 17/11, πρόταση λοχία): η καρτέλα στελέχους με τα υπόλοιπα αδειών της χρονιάς και
// την Καρτέλα απαλλαγών, και το κουτί των Ρυθμίσεων (είδη αδειών, μέτρηση, απαλλαγές). Η λογική είναι στο shared/cadreBalance.ts.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, Segmented, useDirty, useToast, Why } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { cadreAbsKinds } from '../../shared/ranks';
import { APAL, DEFAULT_LEAVE, apalCard, apalLedger, leaveCfgOf, newQuotaId, quotaBalances, type QuotaBal } from '../../shared/cadreBalance';
import type { Cadre, CadreGrant, LeaveQuota } from '../../shared/domain';
import { dm } from '../../shared/dates';
import { rankTxt } from '../../shared/ranks';

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// Μία πλάκα ανά είδος άδειας: πόσες μένουν (μεγάλο), «N από M», μπάρα
function Tile({ b }: { b: QuotaBal }) {
  const frac = b.entitled > 0 ? Math.max(0, Math.min(1, b.left / b.entitled)) : 0;
  const parts = [b.base ? num(b.base) + ' τη χρονιά' : '', b.extra ? '+ ' + num(b.extra) + ' έξτρα' : '', b.carry ? '+ ' + num(b.carry) + ' από πέρσι' : ''].filter(Boolean).join(' ');
  return html`<div className=${'lv-tile' + (b.left < 0 ? ' is-bad' : '') + (!b.quota.all ? ' is-own' : '')} data-lv-quota=${b.quota.id}>
    <div className="lv-tile__name">${b.quota.name}${!b.quota.all ? ' (έξτρα)' : ''}</div>
    <div className="lv-tile__big"><b>${num(b.left)}</b> <span>μένουν</span></div>
    <div className="lv-bar" role="img" aria-label=${num(b.left) + ' από ' + num(b.entitled)}><i style=${{ width: Math.round(frac * 100) + '%' }}></i></div>
    <div className="lv-tile__sub">${num(b.left)} από ${num(b.entitled)} · πήρε ${num(b.used)}${parts && html`<br/>${parts}`}${!b.quota.all && html`<br/>μόνο σε όποιον τη δώσεις`}</div></div>`;
}

export function LeaveTab({ c, year, setYear, years, onApal }: { c: Cadre; year: number; setYear: (y: number) => void; years: number[]; onApal: () => void }) {
  const { state, today, run, undoMark } = useStore(); const toast = useToast();
  const [dlg, setDlg] = useState<null | { kind: 'extra' | 'carry' | 'start'; grant?: CadreGrant }>(null); const [xl, setXl] = useState(false);
  const cfg = leaveCfgOf(state.settings);
  const bals = useMemo(() => quotaBalances(state, c.id, year), [state.cadreAbs, state.cadreGrants, state.settings, c.id, year]);
  const ledger = useMemo(() => apalLedger(state, c, today), [state.guards, state.dutyLog, state.cadreAbs, state.cadreGrants, state.settings, state.cadreList, c, today]);
  const card = useMemo(() => apalCard(ledger, year, cfg.apalExpire), [ledger, year, cfg.apalExpire]);
  const grants = (state.cadreGrants || []).filter(g => g.cid === c.id && g.year === year && g.quota !== APAL);
  const carry = grants.filter(g => g.kind === 'carry').reduce((a, g) => a + g.days, 0);
  const qname = (id: string) => cfg.quotas.find(q => q.id === id)?.name || id;
  const del = async (g: CadreGrant) => { if (await run({ t: 'deleteCadreGrant', id: g.id }, false)) toast({ text: 'Διαγράφηκε', actions: [undoMark()] }); };
  const exportXl = async () => {
    setXl(true);
    try { const r = await window.api.exportCadreLeave(year, c.id); toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': υπόλοιπα αδειών και καρτέλα απαλλαγών.' : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` }); }
    finally { setXl(false); }
  };
  return html`<div className="lv" data-cadre-leave="">
    <div className="lv__top"><label className="lv__year"><b>Έτος</b><${Select} className="ui-select" aria-label="Έτος" value=${String(year)} onChange=${(e: any) => setYear(+e.target.value)}>${years.map(y => html`<option key=${y} value=${String(y)}>${y}</option>`)}<//></label>
      <${Button} variant="outline" size="sm" disabled=${xl} onClick=${exportXl}>${xl ? 'Δημιουργία…' : 'Βγάλε Excel καρτέλας'}<//></div>
    ${bals.length ? html`<div className="lv-tiles">${bals.map(b => html`<${Tile} key=${b.quota.id} b=${b}/>`)}</div>` : html`<p className="note" style=${{ margin: 0 }}>Δεν υπάρχει είδος άδειας για το ${year}. Όρισέ τα στις Ρυθμίσεις › Μονάδα και έντυπα.</p>`}
    <div className="lv__acts"><${Button} variant="outline" size="sm" onClick=${() => setDlg({ kind: 'extra' })}>+ Έξτρα άδεια σε αυτόν…<//>
      <${Button} variant="outline" size="sm" onClick=${() => setDlg({ kind: 'carry' })}>Υπόλοιπο από πέρσι: ${num(carry)}<//>
      <span className="muted" style=${{ fontSize: '12px' }}>Οι μέρες του κάθε είδους αλλάζουν στις Ρυθμίσεις › Μονάδα και έντυπα.</span></div>
    ${grants.length > 0 && html`<ul className="rec lv__grants">${grants.map(g => html`<li key=${g.id}><div><b>${qname(g.quota)}</b> · ${g.kind === 'carry' ? 'από πέρσι' : 'έξτρα'} <b>${g.days > 0 ? '+' : ''}${num(g.days)}</b>${g.note ? html`<small>${g.note}</small>` : ''}</div>
      <${Button} size="sm" variant="ghost" onClick=${() => setDlg({ kind: g.kind as any, grant: g })}>Αλλαγή<//><${Button} size="sm" variant="ghost" onClick=${() => del(g)}>Διαγραφή<//></li>`)}</ul>`}
    <section className="lv-led" data-cadre-apal="">
      <div className="lv-led__head"><h3>Καρτέλα απαλλαγών</h3><${Badge} tone=${card.left < 0 ? 'bad' : 'ok'}>${num(card.left)} μένουν<//>
        <span style=${{ flex: 1 }}></span><${Button} size="sm" onClick=${onApal}>+ Πήρε απαλλαγή…<//></div>
      <div style=${{ overflowX: 'auto' }}><table className="lv-table"><thead><tr><th>Μέρα</th><th>Τι έγινε</th><th className="r">Κέρδισε</th><th className="r">Πήρε</th><th className="r">Μένουν</th></tr></thead><tbody>
        ${card.opening !== 0 && html`<tr className="lv-open"><td></td><td>Υπόλοιπο από πέρσι</td><td></td><td></td><td className="r">${num(card.opening)}</td></tr>`}
        ${card.rows.map((r, i) => html`<tr key=${i}><td className="num">${dm(r.d)}</td><td>${r.what}${r.kind === 'start' && r.id && html` <button type="button" className="linkish" onClick=${() => setDlg({ kind: 'start', grant: (state.cadreGrants || []).find(g => g.id === r.id) })}>Αλλαγή</button>`}</td>
          <td className="r">${r.gain ? '+' + num(r.gain) : ''}</td><td className="r">${r.take ? '−' + num(r.take) : ''}</td><td className=${'r' + (r.left < 0 ? ' lv-neg' : '')}>${num(r.left)}</td></tr>`)}
        ${!card.rows.length && html`<tr><td colSpan="5" className="muted" style=${{ textAlign: 'center', padding: '12px' }}>Καμία κίνηση το ${year}.</td></tr>`}
      </tbody></table></div>
      <div className="lv-led__foot">
        <span>Κάθε υπηρεσία δίνει ${num(cfg.apalPerDuty)} απαλλαγ${cfg.apalPerDuty === 1 ? 'ή' : 'ές'}${cfg.apalHolExtra ? ' (+' + num(cfg.apalHolExtra) + ' σε ΣΚ/αργία)' : ''} μόνη της. Η «Απαλλαγή» που γράφεις στις Καταστάσεις την αφαιρεί${cfg.apalExpire === 'year' ? '. Στο τέλος της χρονιάς οι απαλλαγές που έμειναν λήγουν' : ''}. Για ό,τι έγινε πριν από την εφαρμογή: </span>
        <${Button} size="sm" variant="outline" onClick=${() => setDlg({ kind: 'start', grant: (state.cadreGrants || []).find(g => g.cid === c.id && g.quota === APAL && g.year === year) })}>Αρχικό υπόλοιπο…<//></div>
    </section>
    ${dlg && html`<${GrantDialog} c=${c} year=${year} kind=${dlg.kind} grant=${dlg.grant} onClose=${() => setDlg(null)}/>`}
  </div>`;
}

// Έξτρα άδεια (π.χ. Γονική 9 μέρες), υπόλοιπο από πέρσι ή αρχικό υπόλοιπο απαλλαγών. Δεν μπλοκάρει ποτέ
function GrantDialog({ c, year, kind, grant, onClose }: { c: Cadre; year: number; kind: 'extra' | 'carry' | 'start'; grant?: CadreGrant; onClose: () => void }) {
  const { state, today, run } = useStore(); const toast = useToast();
  const cfg = leaveCfgOf(state.settings);
  const quotas = kind === 'extra' ? [...cfg.quotas.filter(q => !q.all), ...cfg.quotas.filter(q => q.all)] : cfg.quotas;
  const [f, setF] = useState({ quota: grant?.quota || (kind === 'start' ? APAL : quotas[0]?.id || ''), days: grant ? String(grant.days) : '', year: grant?.year || year, note: grant?.note || '' });
  const dirty = useDirty(f); const days = Number(String(f.days).replace(',', '.'));
  const bad = !isFinite(days) || days === 0 || !f.quota;
  const title = kind === 'start' ? 'Αρχικό υπόλοιπο απαλλαγών' : kind === 'carry' ? 'Υπόλοιπο από πέρσι' : 'Έξτρα άδεια';
  const save = async () => {
    if (await run({ t: 'saveCadreGrant', grant: { ...(grant ? { id: grant.id } : {}), cid: c.id, year: f.year, quota: f.quota, days, kind, ...(f.note.trim() ? { note: f.note.trim() } : {}) } }, false)) {
      onClose(); toast({ text: rankTxt(c) + ' ' + c.last + ': ' + title.toLowerCase() + ' ' + num(days) });
    }
  };
  const yrs = [...new Set([+today.slice(0, 4) - 1, +today.slice(0, 4), +today.slice(0, 4) + 1, year, f.year])].sort();
  return html`<${Dialog} title=${title + ': ' + rankTxt(c) + ' ' + c.last} onClose=${onClose} dirty=${dirty && 'Δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${bad && 'Γράψε πόσες μέρες (όχι 0)'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${bad} why="Γράψε πόσες μέρες (όχι 0)" onClick=${save}>Αποθήκευση<//>`}>
    ${kind !== 'start' && html`<div className="field"><label className="field__label" htmlFor="lg-q">Είδος άδειας</label><${Select} id="lg-q" className="ui-input" value=${f.quota} onChange=${(e: any) => setF({ ...f, quota: e.target.value })}>${quotas.map(q => html`<option key=${q.id} value=${q.id}>${q.name}${q.all ? '' : ' (μόνο όπου δοθεί)'}</option>`)}<//>
      ${kind === 'extra' && !cfg.quotas.some(q => !q.all) && html`<span className="field__help">Για άδεια που δεν έχουν όλοι (π.χ. Γονική), φτιάξε είδος στις Ρυθμίσεις › Μονάδα και έντυπα με «Μόνο σε όποιον τη δώσεις».</span>`}</div>`}
    <div className="field-row"><div className="field"><label className="field__label" htmlFor="lg-d">${kind === 'start' ? 'Απαλλαγές που έχει' : 'Μέρες'}</label><input id="lg-d" className="ui-input" type="text" inputMode="decimal" data-autofocus="" style=${{ maxWidth: '120px' }} value=${f.days} onChange=${(e: any) => setF({ ...f, days: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="lg-y">${kind === 'start' ? 'Από την 1/1 του' : 'Χρονιά'}</label><${Select} id="lg-y" className="ui-input" value=${String(f.year)} onChange=${(e: any) => setF({ ...f, year: +e.target.value })}>${yrs.map(y => html`<option key=${y} value=${String(y)}>${y}</option>`)}<//></div></div>
    <div className="field"><label className="field__label" htmlFor="lg-n">Σημείωση</label><input id="lg-n" className="ui-input" value=${f.note} placeholder=${kind === 'start' ? 'π.χ. όσες είχε ως 31/10' : kind === 'carry' ? 'π.χ. από το ' + (f.year - 1) : 'π.χ. Γονική άδεια ΔΝ 123/2026'} onChange=${(e: any) => setF({ ...f, note: e.target.value })}/></div>
    ${kind === 'start' && html`<span className="field__help">Μπαίνει στην αρχή της χρονιάς και προστίθεται στις απαλλαγές που κέρδισε από τις υπηρεσίες της εφαρμογής.</span>`}
  <//>`;
}

// ---- Ρυθμίσεις › Μονάδα και έντυπα: Άδειες και απαλλαγές στελεχών ----
export function CadreLeaveCard() {
  const { state, run } = useStore(); const toast = useToast();
  const fromState = (st = state.settings) => { const c = leaveCfgOf(st); return { quotas: c.quotas.map(q => ({ ...q, kinds: [...q.kinds] })), count: c.count, apalPerDuty: String(c.apalPerDuty), apalHolExtra: String(c.apalHolExtra), apalExpire: c.apalExpire }; };
  const [f, setF] = useState(fromState);
  const dirty = JSON.stringify(f) !== JSON.stringify(fromState());
  const kinds = useMemo(() => cadreAbsKinds(state.settings.lists), [state.settings.lists]);
  const kname = (k: string) => kinds.find(x => x[0] === k)?.[1] || k;
  const n = (v: string) => { const x = Number(String(v).replace(',', '.')); return isFinite(x) && x >= 0 ? x : NaN; };
  const bad = f.quotas.some(q => !q.name.trim() || !isFinite(q.perYear) || q.perYear < 0) || isNaN(n(f.apalPerDuty)) || isNaN(n(f.apalHolExtra));
  const setQ = (id: string, patch: Partial<LeaveQuota>) => setF({ ...f, quotas: f.quotas.map(q => (q.id === id ? { ...q, ...patch } : q)) });
  const save = async () => {
    if (bad) return false;
    const cfg = { quotas: f.quotas.map(q => ({ ...q, name: q.name.trim() })), count: f.count, apalPerDuty: n(f.apalPerDuty), apalHolExtra: n(f.apalHolExtra), apalExpire: f.apalExpire };
    const ok = await run({ t: 'setSettings', settings: { cadreLeave: cfg }, text: 'άδειες και απαλλαγές στελεχών (' + cfg.quotas.map(q => q.name + ' ' + q.perYear).join(', ') + ')' }, false);
    if (ok) { setF(fromState(ok.settings)); toast({ text: 'Αποθηκεύτηκαν οι άδειες και οι απαλλαγές των στελεχών' }); }   // η φόρμα ξαναγίνεται όπως αποθηκεύτηκε (π.χ. «0,5» → «0.5»)
    return ok;
  };
  usePending(dirty, { label: 'Άδειες και απαλλαγές στελεχών', save, discard: () => setF(fromState()) });
  const used = (id: string) => (state.cadreGrants || []).some(g => g.quota === id);
  return html`<${Card} title="Άδειες και απαλλαγές στελεχών" actions=${html`<${Button} size="sm" disabled=${!dirty || bad} why=${bad ? 'Έλεγξε τα πεδία' : 'Καμία αλλαγή'} onClick=${save}>Αποθήκευση<//>`}>
    <p className="note" style=${{ marginTop: 0 }}>Πόσες μέρες άδειας δικαιούται τη χρονιά κάθε στέλεχος. Φαίνονται στην καρτέλα του («Άδειες και απαλλαγές») και στη λίστα. Όταν περάσεις περισσότερες, η εφαρμογή προειδοποιεί (⚠) αλλά δεν σταματά.</p>
    <div className="lvset">${f.quotas.map(q => html`<div className="lvset__q" key=${q.id}>
      <div className="field-row"><div className="field" style=${{ flex: 2 }}><label className="field__label" htmlFor=${'lq-n-' + q.id}>Είδος άδειας</label><input id=${'lq-n-' + q.id} className="ui-input" value=${q.name} onChange=${(e: any) => setQ(q.id, { name: e.target.value })}/></div>
        <div className="field"><label className="field__label" htmlFor=${'lq-d-' + q.id}>Μέρες τη χρονιά</label><input id=${'lq-d-' + q.id} className="ui-input" type="number" min="0" style=${{ maxWidth: '110px' }} value=${q.perYear} onChange=${(e: any) => setQ(q.id, { perYear: Math.max(0, Number(e.target.value) || 0) })}/></div></div>
      <div className="field"><span className="field__label">Την καταναλώνουν οι καταστάσεις</span>
        <div className="lvset__kinds">${q.kinds.length ? q.kinds.map(k => html`<button key=${k} type="button" className="ui-chip" aria-pressed="true" data-tip="Αφαίρεση" onClick=${() => setQ(q.id, { kinds: q.kinds.filter(x => x !== k) })}>${kname(k)} ×</button>`) : html`<span className="muted">Καμία: δεν μετρά ποτέ ως πήρε.</span>`}
          <${Select} className="ui-select" aria-label="Πρόσθεσε κατάσταση" value="" onChange=${(e: any) => e.target.value && setQ(q.id, { kinds: [...q.kinds, e.target.value] })}><option value="">+ κατάσταση…</option>${kinds.filter(k => !q.kinds.includes(k[0])).map(k => html`<option key=${k[0]} value=${k[0]}>${k[1]}</option>`)}<//></div></div>
      <div className="lvset__row"><${Segmented} small=${true} value=${q.all ? 'all' : 'some'} onChange=${(v: string) => setQ(q.id, { all: v === 'all' })} items=${[{ value: 'all', label: 'Για όλους' }, { value: 'some', label: 'Μόνο σε όποιον τη δώσεις' }]}/>
        <${Button} size="sm" variant="ghost" data-tip=${used(q.id) ? 'Έχει δοθεί σε στελέχη· οι εγγραφές μένουν αλλά δεν φαίνονται' : undefined} onClick=${() => setF({ ...f, quotas: f.quotas.filter(x => x.id !== q.id) })}>Διαγραφή<//></div></div>`)}
      <div><${Button} size="sm" variant="outline" onClick=${() => setF({ ...f, quotas: [...f.quotas, { id: newQuotaId(f.quotas), name: '', perYear: 0, kinds: [], all: false }] })}>+ Νέο είδος άδειας<//>
        ${JSON.stringify(f.quotas) !== JSON.stringify(DEFAULT_LEAVE.quotas) && html` <${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, quotas: DEFAULT_LEAVE.quotas.map(q => ({ ...q, kinds: [...q.kinds] })) })}>Πίσω στις 30 και 10<//>`}</div></div>
    <div className="pref"><div><b>Πώς μετρούν οι μέρες</b><small>Ημερολογιακές: μετρά κάθε μέρα της κατάστασης. Εργάσιμες: δεν μετρούν ΣΚ και αργίες.</small></div>
      <${Segmented} small=${true} value=${f.count} onChange=${(v: any) => setF({ ...f, count: v })} items=${[{ value: 'calendar', label: 'Ημερολογιακές' }, { value: 'working', label: 'Εργάσιμες' }]}/></div>
    <div className="pref"><div><b>Απαλλαγές ανά υπηρεσία</b><small>Πόσες απαλλαγές κερδίζει το στέλεχος για κάθε υπηρεσία που κάνει (μόνο όσες βάζεις με το χέρι στις Υπηρεσίες).</small></div>
      <input className="ui-input" aria-label="Απαλλαγές ανά υπηρεσία" type="text" inputMode="decimal" style=${{ maxWidth: '80px' }} value=${f.apalPerDuty} onChange=${(e: any) => setF({ ...f, apalPerDuty: e.target.value })}/></div>
    <div className="pref"><div><b>Έξτρα σε ΣΚ και αργία</b><small>Επιπλέον απαλλαγές όταν η υπηρεσία πέφτει Σάββατο, Κυριακή ή αργία. 0 = καμία.</small></div>
      <input className="ui-input" aria-label="Έξτρα απαλλαγές σε ΣΚ και αργία" type="text" inputMode="decimal" style=${{ maxWidth: '80px' }} value=${f.apalHolExtra} onChange=${(e: any) => setF({ ...f, apalHolExtra: e.target.value })}/></div>
    <div className="pref"><div><b>Λήξη απαλλαγών</b><small>Μένουν για πάντα, ή όσες δεν πήρε ως το τέλος της χρονιάς σβήνουν την 1/1.</small></div>
      <${Segmented} small=${true} value=${f.apalExpire} onChange=${(v: any) => setF({ ...f, apalExpire: v })} items=${[{ value: 'never', label: 'Μένουν για πάντα' }, { value: 'year', label: 'Λήγουν στο τέλος της χρονιάς' }]}/></div>
    ${bad && html`<${Alert} tone="warn"><span>Κάθε είδος θέλει όνομα και αριθμό ημερών, και οι απαλλαγές αριθμό (0 ή περισσότερο).</span><//>`}
  <//>`;
}
