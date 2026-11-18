// features/assets: καρτέλα «Μητρώο» του Οπλισμού (Michael, 17/11, πρόταση λοχία, φάση 4). Όπλα και υλικό σε ένα μητρώο: κατηγορίες αριστερά,
// φίλτρα πάνω, πίνακας στη μέση και καρτέλα του επιλεγμένου δεξιά. Τα κύρια όπλα των ατόμων φαίνονται από το Δυναμολόγιο ως «εικονικές»
// γραμμές και γίνονται εγγραφές με την πρώτη αλλαγή. Κάθε αλλαγή είναι εντολή (αναίρεση) και γράφει γεγονός στο ιστορικό. Τίποτα δεν μπλοκάρεται.
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, VirtualList, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { ChoiceField, DateField, PersonPicker } from '../common';
import { useNav, useStore } from '../store';
import { ASSET_FILTERS, STATE_TXT, EVENT_TXT, assetCfgOf, assetHistory, assetView, catCounts, catOf, heldGroups, holderOut, holderText, maintState, maintTxt, rowPlace, registry, sameNo, type AssetFilter, type AssetRow } from '../../shared/assets';
import { addMonths, heldBy } from '../../shared/assets';
import { drivenBy } from '../../shared/vehicles';
import { dmy, nowHM } from '../../shared/dates';
import { weaponKey } from '../../shared/weapons';
import { pickPeople } from '../../shared/rules';
import type { Asset, AssetCat, AssetHolder } from '../../shared/domain';
type P = any;

const ROW_H = 40; const HEAD_H = 36;
const BASE_COLS = '60px 76px minmax(110px,1.4fr) minmax(116px,1fr) 112px 96px'; const BASE_MIN = 580; const FIELD_W = 100;
const stTone = (a: Asset) => (a.state === 'ok' ? 'ok' : a.state === 'writeoff' ? 'outline' : 'bad');
const hasPrimaryWeapon = (state: P, h: AssetHolder) => (h.k === 'person' ? !!weaponKey(state.people.find((p: P) => p.id === h.pid)?.weapon) : h.k === 'cadre' ? !!weaponKey(state.cadreList.find((c: P) => c.id === h.cid)?.weapon) : false);

// ---------- Ετικέτα κατάστασης και συντήρησης ----------
function StateBadges({ a, today, warn }: { a: Asset; today: string; warn: number }) {
  // μία ετικέτα στη γραμμή (χωράει): πρώτα η κατάσταση αν δεν είναι λειτουργικό, μετά η συντήρηση που πλησιάζει, μετά «εμπόλεμη»
  const m = maintState(a, today, warn);
  if (a.state !== 'ok') return html`<${Badge} tone=${stTone(a)} data-tip=${a.why || undefined}>${STATE_TXT[a.state]}<//>`;
  if (m === 'overdue') return html`<${Badge} tone="bad" data-tip=${'Η συντήρηση ήταν για ' + dmy(a.maint!.next!)}>καθυστέρηση<//>`;
  if (m === 'soon') return html`<${Badge} tone="warn" data-tip=${'Επόμενη συντήρηση ' + dmy(a.maint!.next!)}>${maintTxt(a, today)}<//>`;
  return html`<${Badge} tone=${a.warOnly ? 'outline' : 'ok'} data-tip=${a.warOnly ? 'Λειτουργικό, μόνο σε εμπόλεμη περίοδο' : undefined}>${a.warOnly ? 'εμπόλεμη' : STATE_TXT.ok}<//>`;
}

// ---------- Η οθόνη ----------
export function MitrooView() {
  const { state, today } = useStore(); const nav = useNav(); const toast = useToast();
  const cfg = useMemo(() => assetCfgOf(state.settings, state), [state.settings, state.people, state.cadreList]);
  const [cat, setCat] = useState<string>(nav.params.acat || ''); const [filter, setFilter] = useState<AssetFilter>('all');
  const [q, setQ] = useState<string>(nav.params.aq || ''); const dq = useDeferredValue(q);
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ t: 'edit' | 'maint' | 'repair' | 'writeoff' | 'assign' | 'gone'; row?: AssetRow } | null>(null);
  const [xl, setXl] = useState(false);
  const height = useViewportHeight(410);
  useEffect(() => { if (nav.params.aq != null || nav.params.acat != null) nav.set({ aq: null, acat: null }); }, []);   // μία φορά, από τον σύνδεσμο της καρτέλας ατόμου
  const all = useMemo(() => registry(state, { day: today, hm: nowHM() }), [state.people, state.cadreList, state.assets, state.settings, state.guards, state.dutyLog, state.rules, state.dutyFix, today]);   // ΑΠΩΝ στη θέση: υπηρεσία εκτός στρατοπέδου
  const kinds = useMemo(() => cfg.cats.filter(c => c.kind !== 'vehicle'), [cfg]);
  const rows = useMemo(() => assetView(state, { cat: cat || undefined, filter, q: dq }, today, all), [state.people, state.cadreList, state.assets, state.settings, cat, filter, dq, today, all]);
  const counts = useMemo(() => catCounts(state, { filter, q: dq }, today, all), [all, filter, dq, today, state.settings]);
  const fcounts = useMemo(() => Object.fromEntries(ASSET_FILTERS(cfg.warnDays).map(([k]) => [k, assetView(state, { cat: cat || undefined, filter: k, q: dq }, today, all).length])), [all, cat, dq, today, cfg]);
  const total = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);
  const cur = sel ? all.find(r => r.key === sel) || null : null;
  const catSel = cat ? catOf(cfg, cat) : undefined; const fields = catSel?.fields || [];
  const GRID = BASE_COLS + fields.map(() => ' minmax(90px,.9fr)').join('');
  const exportXl = async (print: boolean) => {
    setXl(true);
    try {
      const r = await window.api.exportAssets(print, { cat: cat || undefined, filter, q: dq });
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού και ΣΥΝΟΛΑ (όπως φαίνεται το φίλτρο).' });
    } finally { setXl(false); }
  };
  const clear = () => { setQ(''); setFilter('all'); setCat(''); };
  const renderRow = useCallback((r: AssetRow, i: number, style: P) => {
    const a = r.a; const out = holderOut(state, a.holder);
    return html`<div key=${r.key} className=${cx('ptable__row mit__row', i % 2 === 1 && 'is-odd', sel === r.key && 'is-sel')} style=${{ ...style, gridTemplateColumns: GRID }} role="row" tabIndex="0" aria-selected=${sel === r.key}
        onClick=${() => setSel(r.key)} onKeyDown=${(e: any) => { if (e.key === 'Enter') setSel(r.key); }}>
      <span>${a.type || '—'}</span><span className="num"><b>${a.no}</b>${(a.qty || 0) > 1 ? html` <small className="muted">×${a.qty}</small>` : ''}</span>
      <span className=${cx(!a.holder && 'muted')} data-tip=${holderText(state, a.holder) + (out ? ' · χρεωμένο σε άτομο εκτός δύναμης' : '')}>${a.holder ? html`${holderText(state, a.holder).replace(/ \((στέλεχος|άλλη μονάδα|φυσικό πρόσωπο)\)$/, '')}${a.holder.k !== 'person' ? html` <small className="muted">(${a.holder.k === 'cadre' ? 'στέλεχος' : a.holder.k === 'unit' ? 'άλλη μονάδα' : 'φυσ. πρόσωπο'})</small>` : ''}${out ? html` <${Badge} tone="warn">εκτός δύναμης<//>` : ''}` : 'αχρέωτο'}</span>
      <span>${rowPlace(cfg, r) || '—'}</span><span className="mit__st"><${StateBadges} a=${a} today=${today} warn=${cfg.warnDays}/></span>
      <span className=${cx('num', maintState(a, today, cfg.warnDays) === 'overdue' && 'mit__late')}>${a.maint?.next ? dmy(a.maint.next) : '—'}</span>
      ${fields.map(f => html`<span key=${f.id}>${a.extra?.[f.id] || '—'}</span>`)}</div>`;
  }, [sel, state, GRID, cfg, today, fields]);
  const chips = ASSET_FILTERS(cfg.warnDays);
  return html`<div className="mit" data-mitroo="">
    <div className="filters mit__chips" role="group" aria-label="Φίλτρα μητρώου">${chips.map(([k, l, tip]) => html`<button key=${k} type="button" className=${cx('ui-chip ui-chip--sm', (k === 'due' || k === 'writeoff' || k === 'repair') && (fcounts[k] || 0) > 0 && 'ui-chip--warn')} aria-pressed=${filter === k} data-tip=${tip} onClick=${() => setFilter(k)}>${l}<span className="cnt">${fcounts[k] || 0}</span></button>`)}</div>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στο μητρώο" placeholder="Αριθμός, τύπος, κάτοχος ή θέση (χωρίς τόνους)" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Button} onClick=${() => setDlg({ t: 'edit' })}>+ Νέο…<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(false)} data-tip="Νέο αρχείο «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ»: ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού και ΣΥΝΟΛΑ. Βγάζει ό,τι φαίνεται (κατηγορία, φίλτρο, αναζήτηση).">Excel<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Προεπισκόπηση εκτύπωσης του ίδιου αρχείου">Εκτύπωση<//>
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'είδος' : 'είδη'}</span></div>
    <div className="mit__grid">
      <nav className="mit__cats ui-card" aria-label="Κατηγορίες">
        <button type="button" className=${cx('mit__cat', !cat && 'is-on')} aria-pressed=${!cat} onClick=${() => setCat('')}><span>Όλες</span><b>${total}</b></button>
        ${kinds.map((c, i) => html`<button key=${c.id} type="button" className=${cx('mit__cat', cat === c.id && 'is-on', i > 0 && kinds[i - 1].kind !== c.kind && 'mit__cat--gap')} aria-pressed=${cat === c.id} onClick=${() => setCat(c.id)}><span>${c.name}</span><b>${counts.get(c.id) || 0}</b></button>`)}
        <button type="button" className="mit__cat mit__cat--link" onClick=${() => nav.go('templates', { tab: 'assets' })} data-tip="Κατηγορίες, τύποι, πεδία και λέξεις θέσης: Ρυθμίσεις › Μητρώο οπλισμού και υλικού">Κατηγορία…</button>
      </nav>
      <div className="mit__main">
        ${rows.length === 0 ? html`<div className="ui-card empty">${all.length === 0 ? 'Το μητρώο είναι άδειο. Τα όπλα που γράφεις στην καρτέλα «Όπλα» εμφανίζονται εδώ μόνα τους· για υλικό πάτα «+ Νέο…».' : html`Κανένα είδος δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
          html`<div className="ptable mit__table" role="table" aria-rowcount=${rows.length}>
            <${VirtualList} className="mit__body" items=${rows} rowHeight=${ROW_H} height=${height} headHeight=${HEAD_H} minWidth=${BASE_MIN + fields.length * FIELD_W} resetKey=${cat + '|' + filter + '|' + dq}
              head=${html`<div className="ptable__head mit__head" role="row" style=${{ gridTemplateColumns: GRID }}><span>Τύπος</span><span>Αριθμός</span><span>Χρεωμένο σε</span><span>Θέση</span><span>Κατάσταση</span><span>Επόμ. συντ.</span>${fields.map(f => html`<span key=${f.id}>${f.name}</span>`)}</div>`}
              renderRow=${renderRow}/>
          </div>`}
        <p className="note mit__hint">Ο αριθμός όπλου ενός στρατιώτη ή στελέχους (καρτέλα «Όπλα») είναι το ίδιο όπλο: φαίνεται εδώ από το Δυναμολόγιο και γίνεται εγγραφή του μητρώου όταν το αλλάξεις (συντήρηση, κατάσταση, παρατηρήσεις…).</p>
      </div>
      ${cur ? html`<${AssetCard} key=${cur.key} row=${cur} all=${all} cfg=${cfg} today=${today} onDlg=${(t: any) => setDlg({ t, row: cur })} onClose=${() => setSel(null)}/>` : html`<aside className="ui-card mit__card mit__card--empty"><p className="muted">Διάλεξε ένα είδος για να δεις την καρτέλα του, το ιστορικό και τις ενέργειες.</p></aside>`}
    </div>
    ${dlg?.t === 'edit' && html`<${AssetEditDialog} row=${dlg.row} all=${all} cfg=${cfg} defCat=${cat} onClose=${() => setDlg(null)} onSaved=${(k: string) => setSel(k)}/>`}
    ${dlg?.t === 'maint' && dlg.row && html`<${MaintDialog} row=${dlg.row} cfg=${cfg} onClose=${() => setDlg(null)}/>`}
    ${(dlg?.t === 'repair' || dlg?.t === 'writeoff' || dlg?.t === 'gone') && dlg.row && html`<${StateDialog} row=${dlg.row} mode=${dlg.t} onClose=${() => setDlg(null)}/>`}
    ${dlg?.t === 'assign' && dlg.row && html`<${AssignDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
  </div>`;
}

// ---------- Καρτέλα του επιλεγμένου ----------
function AssetCard({ row, all, cfg, today, onDlg, onClose }: P) {
  const { state } = useStore(); const a: Asset = row.a; const c: AssetCat | undefined = row.cat;
  const hist = useMemo(() => assetHistory(state.assetLog, row.key), [state.assetLog, row.key]);
  const dup = sameNo(all, row);
  const kv = (k: string, v: any) => (v ? html`<dt>${k}</dt><dd>${v}</dd>` : null);
  const m = maintState(a, today, cfg.warnDays);
  return html`<aside className="ui-card mit__card" aria-label="Καρτέλα" data-asset-card="">
    <div className="mit__card-head"><div><h3>${[a.type, a.no].filter(Boolean).join(' · ')}</h3><div className="muted">${c?.name || 'Χωρίς κατηγορία'} · Καρτέλα ${c?.kind === 'material' ? 'υλικού' : 'όπλου'}</div></div>
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('edit')}>Αλλαγή…<//></div>
    ${row.link && html`<p className="note mit__link">Από το Δυναμολόγιο: ο κάτοχος, ο τύπος και η θέση του οπλοβαστού αλλάζουν από την καρτέλα «Όπλα»${row.stored ? '' : '· δεν έχει ακόμα εγγραφή στο μητρώο'}.</p>`}
    ${dup.length > 0 && html`<${Alert} tone="warn">Ο ίδιος αριθμός υπάρχει και σε: ${dup.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ')}<//>`}
    <dl className="kv mit__kv">
      <dt>Χρεωμένο σε</dt><dd><b>${holderText(state, a.holder)}</b>${holderOut(state, a.holder) ? html` <${Badge} tone="warn" data-tip="Χρεωμένο σε άτομο εκτός δύναμης: ξεχρέωσέ το ή άλλαξε κάτοχο">εκτός δύναμης<//>` : ''}</dd>
      ${kv('Θέση', rowPlace(cfg, row))}
      <dt>Κατάσταση</dt><dd><b>${STATE_TXT[a.state]}</b>${a.why ? ' · ' + a.why : ''}</dd>
      ${a.warOnly && html`<dt>Χρήση</dt><dd><b>Μόνο εμπόλεμη</b></dd>`}
      ${kv('Ποσότητα', (a.qty || 0) > 1 ? a.qty : '')}
      ${kv('Τελευταία συντήρηση', a.maint?.last ? dmy(a.maint.last) : '')}
      ${(a.maint?.next || a.maint?.every || c?.every) && html`<dt>Επόμενη συντήρηση</dt><dd>${a.maint?.next ? html`<b>${dmy(a.maint.next)}</b>` : '—'}${m !== 'none' && m !== 'ok' ? html` <${Badge} tone=${m === 'overdue' ? 'bad' : 'warn'}>${maintTxt(a, today)}<//>` : ''} <small className="muted">κάθε ${a.maint?.every ?? c?.every ?? '—'} μήνες</small></dd>`}
      ${(c?.fields || []).map((f: any) => kv(f.name, a.extra?.[f.id]))}
      ${kv('Παρελκόμενα', a.acc)}${kv('Θέση στο αρχείο μονάδας', a.fileWord)}${kv('Παρατηρήσεις', a.note)}
    </dl>
    <div className="mit__acts">
      <${Button} size="sm" onClick=${() => onDlg('maint')}>Έγινε συντήρηση…<//>
      ${a.state === 'repair' || a.state === 'immobile' ? html`<${Button} size="sm" variant="outline" onClick=${() => onDlg('repair')}>Επέστρεψε από επισκευή<//>` : html`<${Button} size="sm" variant="outline" onClick=${() => onDlg('repair')}>Προς επισκευή…<//>`}
      ${a.state === 'writeoff' ? html`<${Button} size="sm" variant="outline" onClick=${() => onDlg('writeoff')}>Όχι πια προς διαγραφή<//>` : html`<${Button} size="sm" variant="outline" onClick=${() => onDlg('writeoff')}>Προς διαγραφή…<//>`}
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('assign')}>Χρέωσε σε…<//>
      ${a.state === 'writeoff' && html`<${Button} size="sm" variant="ghost" onClick=${() => onDlg('gone')} data-tip="Φεύγει από το μητρώο (μένει το ιστορικό)">Διαγράφηκε οριστικά…<//>`}
    </div>
    <h4>Ιστορικό</h4>
    ${hist.length ? html`<ul className="mit__hist">${hist.map((e: any) => html`<li key=${e.id}><b>${dmy(e.date)}</b> ${EVENT_TXT[e.what as keyof typeof EVENT_TXT]}${e.text ? ': ' + e.text : ''}</li>`)}</ul>` : html`<p className="muted">Κανένα γεγονός ακόμα.</p>`}
  </aside>`;
}

// ---------- Παράθυρα ----------
const rowAsset = (r: AssetRow) => r.a;
export const same = (r: AssetRow) => (r.stored ? { id: r.key } : { id: r.key, base: rowAsset(r) });
export function useDo() {
  const { run, undoMark } = useStore(); const toast = useToast();
  return async (cmd: any, msg: string, warn?: string, close?: () => void) => {
    if (await run(cmd, false) === null) return false;
    toast({ text: html`<span>${msg}${warn && html`<br/><b>Προσοχή:</b> ${warn}`}</span>`, actions: [undoMark()] }); close && close(); return true;
  };
}
function MaintDialog({ row, cfg, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const a: Asset = row.a;
  const [date, setDate] = useState(today); const [note, setNote] = useState('');
  const every = a.maint?.every ?? row.cat?.every; const next = every && date ? addMonths(date, every) : '';
  return html`<${Dialog} title=${'Έγινε συντήρηση · ' + [a.type, a.no].filter(Boolean).join(' ')} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!date} onClick=${() => doIt({ t: 'assetMaint', ...same(row), date, note }, 'Συντήρηση ' + [a.type, a.no].filter(Boolean).join(' ') + ' ' + dmy(date), undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field"><label className="field__label" htmlFor="am-d">Ημερομηνία συντήρησης</label><${DateField} id="am-d" value=${date} onChange=${setDate}/></div>
      <div className="field"><label className="field__label" htmlFor="am-n">Σημείωση (προαιρετικά)</label><input id="am-n" className="ui-input" value=${note} onChange=${(e: any) => setNote(e.target.value)} placeholder="π.χ. ΕΜΑ Ταξιαρχίας"/></div>
      <p className="note" style=${{ margin: 0 }}>${next ? 'Επόμενη συντήρηση: ' + dmy(next) + ' (κάθε ' + every + ' μήνες).' : 'Δεν έχει οριστεί «κάθε Ν μήνες» (στην «Αλλαγή…» ή στην κατηγορία): θα γραφτεί μόνο η τελευταία συντήρηση.'}</p></div><//>`;
}
function StateDialog({ row, mode, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const a: Asset = row.a; const nm = [a.type, a.no].filter(Boolean).join(' ');
  const back = (mode === 'repair' && (a.state === 'repair' || a.state === 'immobile')) || (mode === 'writeoff' && a.state === 'writeoff');
  const [why, setWhy] = useState(''); const [date, setDate] = useState(today);
  const title = mode === 'gone' ? 'Διαγράφηκε οριστικά · ' + nm : back ? (mode === 'repair' ? 'Επέστρεψε από επισκευή · ' : 'Όχι πια προς διαγραφή · ') + nm : (mode === 'repair' ? 'Προς επισκευή · ' : 'Προς διαγραφή · ') + nm;
  const go = () => mode === 'gone' ? doIt({ t: 'assetGone', ...same(row), why, date }, 'Διαγράφηκε από το μητρώο: ' + nm, undefined, onClose)
    : doIt({ t: 'assetState', ...same(row), state: back ? 'ok' : mode === 'repair' ? 'repair' : 'writeoff', why, date }, nm + ': ' + (back ? 'λειτουργικό' : mode === 'repair' ? 'προς επισκευή' : 'προς διαγραφή'), undefined, onClose);
  return html`<${Dialog} title=${title} onClose=${onClose} footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${go}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field"><label className="field__label" htmlFor="as-d">Ημερομηνία</label><${DateField} id="as-d" value=${date} onChange=${setDate}/></div>
      <div className="field"><label className="field__label" htmlFor="as-w">${back ? 'Σημείωση (προαιρετικά)' : 'Λόγος (προαιρετικά)'}</label><input id="as-w" className="ui-input" value=${why} onChange=${(e: any) => setWhy(e.target.value)} placeholder=${mode === 'repair' ? 'π.χ. σκανδάλη' : 'π.χ. φθορά, καταστροφή'} data-autofocus=""/></div>
      ${mode === 'gone' && html`<p className="note" style=${{ margin: 0 }}>Το είδος φεύγει από τον πίνακα και από το Excel. Το ιστορικό του μένει και αναιρείται με Ctrl+Z.</p>`}</div><//>`;
}
export const KINDS: [string, string][] = [['soldier', 'Οπλίτης'], ['cadre', 'Στέλεχος'], ['unit', 'Άλλη μονάδα'], ['ext', 'Φυσικό πρόσωπο'], ['none', 'Κανείς (αχρέωτο)']];
export function AssignDialog({ row, onClose }: P) {
  const { state, today } = useStore(); const doIt = useDo(); const a: Asset = row.a; const nm = [a.type, a.no].filter(Boolean).join(' ');
  const weapon = row.cat?.kind === 'weapon';
  const [kind, setKind] = useState('soldier'); const [who, setWho] = useState<{ h: AssetHolder; label: string } | null>(null); const [name, setName] = useState(''); const [date, setDate] = useState(today);
  const people = useMemo(() => (kind === 'cadre' ? pickPeople(state).filter(p => p.cid) : state.people.filter(p => p.active)), [kind, state.people, state.cadreList]);
  const holder: AssetHolder | null | undefined = kind === 'none' ? null : kind === 'unit' || kind === 'ext' ? (name.trim() ? { k: kind, name: name.trim() } : undefined) : who?.h;
  const primary = who && weapon && !(row.link && holder && holder.k === row.link.k && JSON.stringify(holder) === JSON.stringify(row.link)) ? hasPrimaryWeapon(state, who.h) : false;
  const note = holder === undefined ? '' : row.link && holder !== null && holder && JSON.stringify(holder) === JSON.stringify(row.link) ? 'Ήδη χρεωμένο σε αυτόν από το Δυναμολόγιο.'
    : row.link ? 'Το όπλο είναι το κύριο όπλο του ' + holderText(state, row.link) + ': θα σβηστεί από εκεί (Δυναμολόγιο › Όπλα) και θα πάει στον νέο κάτοχο.'
    : who && weapon ? (primary ? 'Έχει ήδη κύριο όπλο: αυτό θα μπει ως δεύτερο όπλο, στο μητρώο.' : 'Δεν έχει όπλο: θα γραφτεί και ως κύριο όπλο του στο Δυναμολόγιο (Οπλισμός › Όπλα).') : '';
  const warn = holder && row.link ? (holder.k === 'person' || holder.k === 'cadre') && hasPrimaryWeapon(state, holder) ? 'έχει ήδη άλλο κύριο όπλο' : undefined : undefined;
  return html`<${Dialog} title=${'Χρέωσε σε… · ' + nm} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${holder === undefined} onClick=${() => doIt({ t: 'assetHolder', ...same(row), holder, date }, nm + ': ' + (holder ? 'χρεώθηκε σε ' + holderText(state, holder) : 'αχρέωτο'), warn, onClose)}>Αποθήκευση<//>`}>
    <div className="stack">
      <div className="field"><label className="field__label" htmlFor="ag-k">Σε ποιον</label><${Select} id="ag-k" className="ui-input" value=${kind} onChange=${(e: any) => { setKind(e.target.value); setWho(null); }}>${KINDS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}<//></div>
      ${(kind === 'soldier' || kind === 'cadre') && html`<div className="field"><label className="field__label" htmlFor="ag-p">${kind === 'soldier' ? 'Οπλίτης' : 'Στέλεχος'}</label>
        <${PersonPicker} key=${kind} id="ag-p" people=${people} placeholder=${kind === 'soldier' ? 'Επώνυμο, όνομα ή ΑΣΜ…' : 'Επώνυμο του στελέχους…'} onChange=${(id: number) => { const p = people.find((x: any) => x.id === id); if (p) setWho({ h: p.cid ? { k: 'cadre', cid: p.cid } : { k: 'person', pid: p.id }, label: (p.rank || '') + ' ' + p.last + ' ' + p.first }); }}/>
        ${who && html`<div style=${{ marginTop: '6px' }}>Διάλεξες: <b>${who.label}</b></div>`}</div>`}
      ${(kind === 'unit' || kind === 'ext') && html`<div className="field"><label className="field__label" htmlFor="ag-n">${kind === 'unit' ? 'Όνομα μονάδας' : 'Όνομα'}</label><input id="ag-n" className="ui-input" value=${name} onChange=${(e: any) => setName(e.target.value)} placeholder=${kind === 'unit' ? 'π.χ. 50 ΕΜΑ' : ''} data-autofocus=""/></div>`}
      <div className="field"><label className="field__label" htmlFor="ag-d">Ημερομηνία</label><${DateField} id="ag-d" value=${date} onChange=${setDate}/></div>
      ${note && html`<p className="note" style=${{ margin: 0 }}>${note}</p>`}</div><//>`;
}
function AssetEditDialog({ row, all, cfg, defCat, onClose, onSaved }: P) {
  const { state, today } = useStore(); const doIt = useDo(); const isNew = !row;
  const a0: Asset | undefined = row?.a; const linked = !!row?.link;
  const first = defCat && cfg.cats.find((c: AssetCat) => c.id === defCat && c.kind !== 'vehicle') ? defCat : cfg.cats.find((c: AssetCat) => c.kind !== 'vehicle')?.id || '';
  const [f, setF] = useState(() => ({ cat: a0?.cat || first, type: a0?.type || '', no: a0?.no || '', qty: String(a0?.qty || ''), place: a0?.place || '', rack: a0?.rack || '', wpos: a0?.wpos || '', fileWord: a0?.fileWord || '', warOnly: !!a0?.warOnly,
    every: String(a0?.maint?.every || ''), last: a0?.maint?.last || '', next: a0?.maint?.next || '', acc: a0?.acc || '', note: a0?.note || '', extra: { ...(a0?.extra || {}) } as Record<string, string> }));
  const cat: AssetCat | undefined = cfg.cats.find((c: AssetCat) => c.id === f.cat); const weapon = cat?.kind === 'weapon';
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const dups = f.no.trim() ? sameNo(all, { key: row?.key || '', a: { ...(a0 || {}), cat: f.cat } as Asset }, f.no) : [];
  const dirty = JSON.stringify(f) !== JSON.stringify({ ...f, ...(a0 ? { cat: a0.cat } : {}) }) || isNew && !!f.no;
  const save = () => {
    const every = Math.floor(Number(f.every)); const maint = { ...(a0?.maint || {}), last: f.last || undefined, next: f.next || undefined, every: every > 0 ? every : undefined };
    const asset: any = { ...(a0 || {}), id: row?.stored ? row.key : undefined, cat: f.cat, type: f.type, no: f.no, qty: Math.floor(Number(f.qty)) || undefined, place: f.place, rack: f.rack, wpos: f.wpos, fileWord: f.fileWord, warOnly: f.warOnly, maint, acc: f.acc, note: f.note, extra: f.extra, state: a0?.state || 'ok', holder: a0?.holder };
    if (!asset.id) delete asset.id;
    return doIt({ t: 'saveAsset', asset, date: today }, (isNew ? 'Νέο: ' : 'Αλλαγή: ') + [f.type, f.no].filter(Boolean).join(' '), dups.length ? 'ο ίδιος αριθμός υπάρχει και σε ' + dups.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ') + '.' : undefined, () => { onClose(); }).then((ok: boolean) => { if (ok && !isNew && row) onSaved(row.key); });
  };
  const fld = (id: string, label: string, k: string, o: P = {}) => html`<div className="field" style=${o.style}><label className="field__label" htmlFor=${'ae-' + id}>${label}</label><input id=${'ae-' + id} className="ui-input" value=${f[k as keyof typeof f] as string} disabled=${!!o.disabled} placeholder=${o.ph || ''} onChange=${(e: any) => set(k, e.target.value)}/></div>`;
  return html`<${Dialog} title=${isNew ? 'Νέο είδος στο μητρώο' : 'Αλλαγή · ' + [a0!.type, a0!.no].filter(Boolean).join(' ')} onClose=${onClose} size="lg" dirty=${dirty}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//>${!isNew && row.stored && html`<${Button} variant="ghost" onClick=${async () => { if (await doIt({ t: 'deleteAsset', id: row.key }, 'Σβήστηκε η εγγραφή ' + a0!.no, undefined, onClose)) onSaved(''); }} data-tip="Σβήνει την εγγραφή και το ιστορικό της (αναιρείται με Ctrl+Z). Για κύριο όπλο ατόμου ξαναφαίνεται από το Δυναμολόγιο.">Σβήσε την εγγραφή<//>`}<${Button} disabled=${!f.no.trim() || !f.cat} onClick=${save}>Αποθήκευση<//>`}>
    <div className="stack">
      ${linked && html`<p className="note" style=${{ margin: 0 }}>Κύριο όπλο από το Δυναμολόγιο: ο αριθμός, ο τύπος και η θέση οπλοβαστού αλλάζουν από την καρτέλα «Όπλα».</p>`}
      <div className="field-row">
        <div className="field"><label className="field__label" htmlFor="ae-cat">Κατηγορία</label><${Select} id="ae-cat" className="ui-input" value=${f.cat} onChange=${(e: any) => set('cat', e.target.value)}>${cfg.cats.filter((c: AssetCat) => c.kind !== 'vehicle' || c.id === f.cat).map((c: AssetCat) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}<//></div>
        ${linked && a0?.type ? fld('type', 'Τύπος', 'type', { disabled: true }) : html`<${ChoiceField} id="ae-type" label="Τύπος" value=${f.type} options=${cat?.types || []} onChange=${(v: string) => set('type', v)} otherLabel="Άλλος τύπος (γράψε τον)…" placeholder="π.χ. G3A3"/>`}${fld('no', 'Αριθμός', 'no', { disabled: linked, ph: 'αριθμός όπλου / σειριακός' })}
        ${!weapon && fld('qty', 'Ποσότητα', 'qty', { ph: '1', style: { maxWidth: '90px' } })}</div>
      ${dups.length > 0 && html`<${Alert} tone="warn">Ο αριθμός υπάρχει ήδη στο μητρώο (${dups.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ')}). Μπορείς να συνεχίσεις.<//>`}
      <div className="field-row">${weapon && fld('rack', 'Οπλοβαστός', 'rack', { disabled: linked, ph: 'Ε', style: { maxWidth: '110px' } })}${weapon && fld('wpos', 'Θέση οπλοβαστού', 'wpos', { disabled: linked, ph: '23', style: { maxWidth: '130px' } })}
        ${fld('place', 'Θέση (κιβώτιο, αποθήκη…)', 'place', { ph: 'π.χ. ΚΙΒΩΤΙΟ 53' })}${fld('fileWord', 'Λέξη θέσης στο αρχείο μονάδας', 'fileWord', { ph: 'π.χ. Α.Ο' })}</div>
      <div className="field-row">${fld('every', 'Συντήρηση κάθε (μήνες)', 'every', { ph: String(cat?.every || ''), style: { maxWidth: '150px' } })}
        <div className="field"><label className="field__label" htmlFor="ae-last">Τελευταία συντήρηση</label><${DateField} id="ae-last" value=${f.last} onChange=${(v: string) => set('last', v)}/></div>
        <div className="field"><label className="field__label" htmlFor="ae-next">Επόμενη συντήρηση</label><${DateField} id="ae-next" value=${f.next} onChange=${(v: string) => set('next', v)}/></div>
        <label className="check" style=${{ alignSelf: 'end', paddingBottom: '8px' }}><input type="checkbox" checked=${f.warOnly} onChange=${(e: any) => set('warOnly', e.target.checked)}/><span>Μόνο εμπόλεμη περίοδο</span></label></div>
      ${(cat?.fields || []).length > 0 && html`<div className="field-row">${cat!.fields.map(x => html`<div className="field" key=${x.id}><label className="field__label" htmlFor=${'ae-x-' + x.id}>${x.name}</label><input id=${'ae-x-' + x.id} className="ui-input" value=${f.extra[x.id] || ''} onChange=${(e: any) => setF(y => ({ ...y, extra: { ...y.extra, [x.id]: e.target.value } }))}/></div>`)}</div>`}
      ${fld('acc', 'Παρελκόμενα', 'acc', { ph: 'π.χ. 2 γεμιστήρες, λόγχη, ιμάντας' })}${fld('note', 'Παρατηρήσεις', 'note')}
    </div><//>`;
}

// ---------- «Χρεωμένα» στην καρτέλα ατόμου/στελέχους ----------
// Και τα οχήματα που κρατά ή οδηγεί («οδηγός»): πάνε στην οθόνη Οχήματα
export function HeldBlock({ pid, cid }: { pid?: number; cid?: string }) {
  const { state } = useStore(); const nav = useNav();
  const h: AssetHolder = cid ? { k: 'cadre', cid } : { k: 'person', pid: pid! };
  const all = useMemo(() => registry(state), [state.people, state.cadreList, state.assets, state.settings]);
  const groups = useMemo(() => heldGroups(all.filter(r => r.cat?.kind !== 'vehicle'), h), [all, pid, cid]);
  const vehs = useMemo(() => { const held = heldBy(all, h).filter(r => r.cat?.kind === 'vehicle'); const drv = drivenBy(all, h); return [...held.map(r => ({ r, drv: drv.includes(r) })), ...drv.filter(r => !held.includes(r)).map(r => ({ r, drv: true, only: true }))]; }, [all, pid, cid]);
  if (!groups.length && !vehs.length) return null;
  const who = cid ? state.cadreList.find(c => c.id === cid) : state.people.find(p => p.id === pid);
  const n = groups.reduce((a, g) => a + g[1].length, 0);
  return html`<dt>Χρεωμένα</dt><dd data-held="">${groups.map(([name, l]) => html`<div key=${name}><span className="muted">${name}:</span> ${l.map((r, i) => html`${i ? ', ' : ''}<b>${[r.a.type, r.a.no].filter(Boolean).join(' ')}</b>${(r.a.qty || 0) > 1 ? ' ×' + r.a.qty : ''}`)}</div>`)}
    ${vehs.length > 0 && html`<div data-held-veh=""><span className="muted">Οχήματα:</span> ${vehs.map((v: any, i: number) => html`${i ? ', ' : ''}<b>${[v.r.a.type, v.r.a.plate || v.r.a.no].filter(Boolean).join(' ')}</b>${v.drv ? html` <small className="muted">(οδηγός)</small>` : ''}`)}</div>`}
    ${n > 0 && html`<button type="button" className="linkish" onClick=${() => nav.go('weapons', { wtab: 'mitroo', aq: who ? who.last : '' })} data-tip="Δες τα στο Μητρώο οπλισμού και υλικού">Στο Μητρώο (${n})</button>`}
    ${vehs.length > 0 && html`${n > 0 ? ' ' : ''}<button type="button" className="linkish" onClick=${() => nav.go('vehicles', { vsel: vehs[0].r.key })} data-tip="Δες τα στην οθόνη Οχήματα">Στα Οχήματα (${vehs.length})</button>`}</dd>`;
}
