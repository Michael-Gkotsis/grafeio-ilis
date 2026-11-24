// features/vehicles: οθόνη «Οχήματα» (Michael, 17/11, πρόταση λοχία, φάση 5). Ίδιο μητρώο με τον οπλισμό (shared/assets.ts), κατηγορίες
// kind 'vehicle'. Πάνω 4 μετρήσεις (και φίλτρα), πίνακας αριστερά, καρτέλα με Στοιχεία, Συντηρήσεις, Καύσιμα και Κινήσεις δεξιά.
// Κάθε αλλαγή είναι μία εντολή (μία αναίρεση) και γράφει γεγονός στο ιστορικό. Τίποτα δεν μπλοκάρεται.
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Icon, PageHeader, Tabs, VirtualList, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { ChoiceField, DateField, PersonPicker } from '../common';
import { useNav, useStore } from '../store';
import { AssignDialog, same, useDo } from './assets';
import { assetCfgOf, assetHistory, catOf, defaultCats, holderOut, holderText, registry, EVENT_TXT, STATE_TXT, type AssetRow } from '../../shared/assets';
import { addMonths } from '../../shared/assets';
import { dmy } from '../../shared/dates';
import { pickPeople } from '../../shared/rules';
import { HK } from '../../shared/unit';
import { driverText, kmTxt, numTxt, unitTxt, vehMaint, vehName, vehStats, vehStatus, vehicleRows, vehicleView, movedOn } from '../../shared/vehicles';
import type { Asset, AssetCat } from '../../shared/domain';
type P = any;

const ROW_H = 40; const HEAD_H = 36;
const GRID = 'minmax(150px,1.5fr) 100px minmax(120px,1.2fr) 100px minmax(130px,1.3fr)'; const MIN_W = 600;
type VFilter = '' | 'moving' | 'down' | 'due';

export function VehiclesScreen() {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const cfg = useMemo(() => assetCfgOf(state.settings), [state.settings]);
  const [cat, setCat] = useState(''); const [filter, setFilter] = useState<VFilter>(''); const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const [sel, setSel] = useState<string | null>(nav.params.vsel || null);
  const [dlg, setDlg] = useState<{ t: string; row?: AssetRow } | null>(null); const [xl, setXl] = useState(false);
  const height = useViewportHeight(420);
  useEffect(() => { if (nav.params.vsel != null) nav.set({ vsel: null }); }, []);   // μία φορά, από τον σύνδεσμο της καρτέλας ατόμου
  const all = useMemo(() => registry(state), [state.people, state.cadreList, state.assets, state.settings]);
  const vrows = useMemo(() => vehicleRows(state, all), [all]);
  const stats = useMemo(() => vehStats(vrows, state.assetLog, today, cfg.warnDays), [vrows, state.assetLog, today, cfg.warnDays]);
  const rows = useMemo(() => vehicleView(state, { cat: cat || undefined, q: dq }, all).filter(r => !filter
    || (filter === 'moving' ? movedOn(r.a, state.assetLog, today) : filter === 'down' ? r.a.state === 'repair' || r.a.state === 'immobile' : ['soon', 'overdue'].includes(vehMaint(r.a, r.cat, today, cfg.warnDays).st))),
    [all, cat, dq, filter, state.assetLog, today, cfg.warnDays]);
  const vcats = useMemo(() => cfg.cats.filter(c => c.kind === 'vehicle'), [cfg]);
  const cur = sel ? vrows.find(r => r.key === sel) || null : null;
  const exportXl = async (print: boolean) => {
    setXl(true);
    try {
      const r = await window.api.exportVehicles(print);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': ένα φύλλο ανά κατηγορία, ΚΑΥΣΙΜΑ και ΣΥΝΤΗΡΗΣΕΙΣ.' });
    } finally { setXl(false); }
  };
  // παλιές ρυθμίσεις (φάση 4) δεν έχουν κατηγορίες οχημάτων: προσθέτονται οι προεπιλεγμένες
  const addCats = async () => { const have = new Set(cfg.cats.map(c => c.id)); const add = defaultCats(state.settings.lists).filter(c => c.kind === 'vehicle' && !have.has(c.id)); if (await run({ t: 'setSettings', settings: { assets: { ...cfg, cats: [...cfg.cats, ...add] } }, text: 'κατηγορίες οχημάτων' }, false)) toast({ text: 'Προστέθηκαν οι κατηγορίες οχημάτων' }); };
  const renderRow = useCallback((r: AssetRow, i: number, style: P) => {
    const a = r.a; const st = vehStatus(a, r.cat, state.assetLog, today, cfg.warnDays);
    return html`<div key=${r.key} className=${cx('ptable__row mit__row', i % 2 === 1 && 'is-odd', sel === r.key && 'is-sel')} style=${{ ...style, gridTemplateColumns: GRID }} role="row" tabIndex="0" aria-selected=${sel === r.key}
        onClick=${() => setSel(r.key)} onKeyDown=${(e: any) => { if (e.key === 'Enter') setSel(r.key); }}>
      <span className="veh__type" data-tip=${(r.cat?.name || '') + ' · ' + a.type}>${r.cat?.name ? r.cat.name + ' · ' : ''}<b>${a.type || '—'}</b></span><span className="num"><b>${a.plate || a.no}</b></span>
      <span className=${cx(!a.driver && 'muted')}>${a.driver ? driverText(state, a.driver) : '—'}</span><span className="num">${kmTxt(a.km, r.cat)}</span>
      <span className="mit__st"><${Badge} tone=${st.tone} data-tip=${st.tip || undefined}>${st.text}<//></span></div>`;
  }, [sel, state, cfg, today]);
  const kpi = (f: VFilter, label: string, n: number, tone?: string, tip?: string) => html`<button type="button" key=${label} className=${cx('kpi kpi--sv', tone && n > 0 && 'kpi--' + tone)} aria-pressed=${filter === f && f !== ''} data-tip=${tip} onClick=${() => setFilter(filter === f ? '' : f)}><span className="kpi__l">${label}</span><span className="kpi__n">${n}</span></button>`;
  return html`<div className="veh" data-vehicles="">
    <${PageHeader} title="Οχήματα" sub="Κάθε όχημα με την καρτέλα του: συντηρήσεις, χιλιόμετρα, καύσιμα, παρελκόμενα, οδηγός, ακινησία.">
      <div className="page-head__acts">
        <${Button} onClick=${() => setDlg({ t: 'edit' })}>+ Νέο όχημα…<//>
        <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(false)} data-tip="Νέο αρχείο «ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ»: ένα φύλλο ανά κατηγορία, ΚΑΥΣΙΜΑ και ΣΥΝΤΗΡΗΣΕΙΣ">Excel<//>
        <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Προεπισκόπηση εκτύπωσης του ίδιου αρχείου">${Icon.print}Εκτύπωση<//></div><//>
    <div className="kpis kpis--sv veh__kpis">
      ${kpi('', 'Σύνολο', stats.total, undefined, 'Όλα τα οχήματα του μητρώου')}${kpi('moving', 'Σε κίνηση σήμερα', stats.moving, 'ok', 'Με χιλιόμετρα ή γέμισμα σήμερα')}
      ${kpi('down', 'Προς επισκευή / ακινησία', stats.down, 'bad')}${kpi('due', 'Συντήρηση σε ' + cfg.warnDays + ' μέρες', stats.due, 'warn', 'Επόμενη συντήρηση σε ' + cfg.warnDays + ' μέρες ή στα χιλιόμετρα, και όσα έχουν περάσει το όριο')}</div>
    ${vcats.length === 0 ? html`<div className="ui-card empty">Δεν υπάρχει κατηγορία οχημάτων στο μητρώο. <${Button} onClick=${addCats}>Πρόσθεσε Τροχοφόρα, Ερπυστριοφόρα, Πολιτικού τύπου<//></div>` : html`<div>
      <div className="toolbar">
        <div className="filters mit__chips" role="group" aria-label="Κατηγορίες οχημάτων"><button type="button" className="ui-chip ui-chip--sm" aria-pressed=${!cat} onClick=${() => setCat('')}>Όλα</button>${vcats.map(c => html`<button key=${c.id} type="button" className="ui-chip ui-chip--sm" aria-pressed=${cat === c.id} onClick=${() => setCat(c.id)}>${c.name}<span className="cnt">${vrows.filter(r => r.a.cat === c.id).length}</span></button>`)}</div>
        <input type="search" className="ui-input" aria-label="Αναζήτηση οχημάτων" placeholder="Πινακίδα, τύπος, οδηγός (χωρίς τόνους)" value=${q} onChange=${(e: any) => setQ(e.target.value)} style=${{ maxWidth: '300px' }}/>
        <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'όχημα' : 'οχήματα'}</span></div>
      <div className="veh__grid">
        <div className="mit__main">
          ${rows.length === 0 ? html`<div className="ui-card empty">${vrows.length === 0 ? 'Δεν υπάρχει ακόμα όχημα. Πάτα «+ Νέο όχημα…».' : 'Κανένα όχημα δεν ταιριάζει.'}${vrows.length > 0 && html` <${Button} variant="link" onClick=${() => { setQ(''); setCat(''); setFilter(''); }}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
            html`<div className="ptable mit__table" role="table" aria-rowcount=${rows.length}>
              <${VirtualList} className="mit__body" items=${rows} rowHeight=${ROW_H} height=${height} headHeight=${HEAD_H} minWidth=${MIN_W} resetKey=${cat + '|' + filter + '|' + dq}
                head=${html`<div className="ptable__head mit__head" role="row" style=${{ gridTemplateColumns: GRID }}><span>Είδος</span><span>Πινακίδα</span><span>Οδηγός</span><span data-tip="Στα ερπυστριοφόρα μετρά ώρες κινητήρα («ώρ.»): αλλάζει από Ρυθμίσεις › Μητρώο οπλισμού και υλικού">Χλμ</span><span>Κατάσταση</span></div>`}
                renderRow=${renderRow}/>
            </div>`}
          <p className="note mit__hint">Η ενότητα «Κατάσταση οχημάτων» της ${HK()} μπορεί να γεμίζει από εδώ (Ρυθμίσεις ΗΚΑΙ › Ενότητες › «Από το μητρώο οχημάτων»): το έντυπο μένει ίδιο.</p>
        </div>
        ${cur ? html`<${VehicleCard} key=${cur.key} row=${cur} cfg=${cfg} today=${today} onDlg=${(t: string) => setDlg({ t, row: cur })} onGone=${() => setSel(null)}/>` : html`<aside className="ui-card mit__card mit__card--empty"><p className="muted">Διάλεξε ένα όχημα για να δεις την καρτέλα του, τα καύσιμα και τις ενέργειες.</p></aside>`}
      </div></div>`}
    ${dlg?.t === 'edit' && html`<${VehicleEditDialog} row=${dlg.row} cfg=${cfg} defCat=${cat} onClose=${() => setDlg(null)} onSaved=${(k: string) => setSel(k)}/>`}
    ${dlg?.t === 'fuel' && dlg.row && html`<${FuelDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
    ${dlg?.t === 'km' && dlg.row && html`<${KmDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
    ${dlg?.t === 'maint' && dlg.row && html`<${VMaintDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
    ${(dlg?.t === 'immobile' || dlg?.t === 'repair') && dlg.row && html`<${VStateDialog} row=${dlg.row} mode=${dlg.t} onClose=${() => setDlg(null)}/>`}
    ${dlg?.t === 'driver' && dlg.row && html`<${DriverDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
    ${dlg?.t === 'assign' && dlg.row && html`<${AssignDialog} row=${dlg.row} onClose=${() => setDlg(null)}/>`}
  </div>`;
}

// ---------- Καρτέλα οχήματος ----------
function VehicleCard({ row, cfg, today, onDlg, onGone }: P) {
  const { state } = useStore(); const doIt = useDo(); const a: Asset = row.a; const c: AssetCat | undefined = row.cat;
  const [tab, setTab] = useState('info');
  const hist = useMemo(() => assetHistory(state.assetLog, row.key), [state.assetLog, row.key]);
  const fuels = hist.filter(e => e.what === 'fuel'); const maints = hist.filter(e => e.what === 'maint');
  const m = vehMaint(a, c, today, cfg.warnDays); const u = unitTxt(c);
  const kv = (k: string, v: any) => (v ? html`<dt>${k}</dt><dd>${v}</dd>` : null);
  const lastFuel = fuels[0]; const down = a.state === 'repair' || a.state === 'immobile';
  const nextTxt = [a.maint?.next ? dmy(a.maint.next) : '', a.maint?.nextKm != null ? 'στα ' + numTxt(a.maint.nextKm) + (c?.hours ? ' ώρ.' : '') : ''].filter(Boolean).join(' ή ');
  const litres = fuels.reduce((n: number, e: any) => n + (e.litres || 0), 0);
  return html`<aside className="ui-card mit__card veh__card" aria-label="Καρτέλα οχήματος" data-asset-card="">
    <div className="mit__card-head"><div><h3>${vehName(a)}</h3><div className="muted">${c?.name || 'Χωρίς κατηγορία'} · Καρτέλα οχήματος</div></div>
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('edit')}>Αλλαγή…<//></div>
    <${Tabs} value=${tab} onChange=${setTab} items=${[{ value: 'info', label: 'Στοιχεία' }, { value: 'maint', label: 'Συντηρήσεις' }, { value: 'fuel', label: 'Καύσιμα' }, { value: 'moves', label: 'Κινήσεις' }]}/>
    <div className="veh__body">
    ${tab === 'info' && html`<dl className="kv mit__kv">
      <dt>Χρεωμένο σε</dt><dd><b>${holderText(state, a.holder)}</b>${holderOut(state, a.holder) ? html` <${Badge} tone="warn">εκτός δύναμης<//>` : ''}</dd>
      <dt>Οδηγός</dt><dd>${a.driver ? html`<b>${driverText(state, a.driver)}</b>${holderOut(state, a.driver) ? html` <${Badge} tone="warn">εκτός δύναμης<//>` : ''}` : '—'}</dd>
      <dt>${c?.hours ? 'Ώρες κινητήρα' : 'Χιλιόμετρα'}</dt><dd>${a.km != null ? html`<b>${numTxt(a.km)}</b>${a.kmOn ? html` <small className="muted">στις ${dmy(a.kmOn).slice(0, 5)}</small>` : ''}` : '—'}</dd>
      ${(a.maint?.last || a.maint?.lastKm != null) && html`<dt>Τελευταία συντήρηση</dt><dd>${[a.maint?.last ? dmy(a.maint.last) : '', a.maint?.lastKm != null ? numTxt(a.maint.lastKm) : ''].filter(Boolean).join(' στα ')}</dd>`}
      ${nextTxt && html`<dt>Επόμενη συντήρηση</dt><dd><b>${nextTxt}</b>${m.st === 'soon' || m.st === 'overdue' ? html` <${Badge} tone=${m.st === 'overdue' ? 'bad' : 'warn'}>${m.st === 'overdue' ? 'καθυστέρηση' : m.by === 'km' ? 'σε ' + numTxt(m.kmLeft!) + ' ' + u : m.days === 0 ? 'σήμερα' : 'σε ' + m.days + ' μέρες'}<//>` : ''} <small className="muted">όποιο έρθει πρώτο</small></dd>`}
      ${kv('Ρεζερβουάρ', lastFuel ? 'τελευταίο γέμισμα ' + dmy(lastFuel.date).slice(0, 5) + ' · ' + numTxt(lastFuel.litres || 0) + ' λίτρα' + (lastFuel.km != null ? ' στα ' + numTxt(lastFuel.km) : '') : '')}
      ${(c?.fields || []).map((f: any) => kv(f.name, a.extra?.[f.id]))}
      ${kv('Παρελκόμενα', a.acc)}${kv('Παρατηρήσεις', a.note)}
      <dt>Κατάσταση</dt><dd><b>${STATE_TXT[a.state]}</b>${a.why ? ' · ' + a.why : ''}</dd></dl>`}
    ${tab === 'maint' && (maints.length ? html`<ul className="mit__hist">${maints.map((e: any) => html`<li key=${e.id}><b>${dmy(e.date)}</b>${e.km != null ? ' στα ' + numTxt(e.km) + ' ' + u : ''}${e.text ? ': ' + e.text : ''}</li>`)}</ul>` : html`<p className="muted">Καμία συντήρηση ακόμα.</p>`)}
    ${tab === 'fuel' && (fuels.length ? html`<div><p className="note" style=${{ margin: '0 0 6px' }}>${fuels.length} γεμίσματα · ${numTxt(litres)} λίτρα συνολικά</p><ul className="mit__hist">${fuels.map((e: any) => html`<li key=${e.id}><b>${dmy(e.date)}</b> ${numTxt(e.litres || 0)} λίτρα${e.km != null ? ' · στα ' + numTxt(e.km) + ' ' + u : ''}</li>`)}</ul></div>` : html`<p className="muted">Κανένα γέμισμα ακόμα.</p>`)}
    ${tab === 'moves' && (hist.length ? html`<ul className="mit__hist">${hist.map((e: any) => html`<li key=${e.id}><b>${dmy(e.date)}</b> ${EVENT_TXT[e.what as keyof typeof EVENT_TXT]}${e.text ? ': ' + e.text : ''}</li>`)}</ul>` : html`<p className="muted">Καμία κίνηση ακόμα.</p>`)}
    </div>
    <div className="mit__acts">
      <${Button} size="sm" onClick=${() => onDlg('fuel')}>+ Γέμισμα…<//><${Button} size="sm" variant="outline" onClick=${() => onDlg('km')}>+ Χιλιόμετρα…<//>
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('maint')}>Έγινε συντήρηση…<//>
      ${down ? html`<${Button} size="sm" variant="outline" onClick=${() => doIt({ t: 'assetState', ...same(row), state: 'ok', date: today }, vehName(a) + ': επανήλθε')}>Επανήλθε<//>` : html`<${Button} size="sm" variant="outline" onClick=${() => onDlg('immobile')}>Ακινησία…<//><${Button} size="sm" variant="outline" onClick=${() => onDlg('repair')}>Προς επισκευή…<//>`}
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('assign')}>Χρέωσε σε…<//><${Button} size="sm" variant="outline" onClick=${() => onDlg('driver')}>Οδηγός…<//>
      <${Button} size="sm" variant="ghost" onClick=${async () => { if (await doIt({ t: 'deleteAsset', id: row.key }, 'Σβήστηκε το όχημα ' + vehName(a))) onGone(); }} data-tip="Σβήνει το όχημα και το ιστορικό του (αναιρείται με Ctrl+Z)">Σβήσε<//>
    </div>
  </aside>`;
}

// ---------- Παράθυρα ----------
const nmOf = (r: AssetRow) => vehName(r.a);
const numOr = (v: string): number | undefined => { const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return String(v).trim() !== '' && isFinite(n) && n >= 0 ? n : undefined; };
function FuelDialog({ row, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const a: Asset = row.a; const u = unitTxt(row.cat);
  const [date, setDate] = useState(today); const [litres, setLitres] = useState(''); const [km, setKm] = useState(a.km != null ? String(a.km) : '');
  const l = numOr(litres); const k = numOr(km); const back = k != null && a.km != null && k < a.km && (!a.kmOn || date >= a.kmOn);
  return html`<${Dialog} title=${'Γέμισμα · ' + nmOf(row)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!l || !date} onClick=${() => doIt({ t: 'assetFuel', ...same(row), date, litres: l, km: k }, 'Γέμισμα ' + nmOf(row) + ': ' + numTxt(l!) + ' λίτρα', back ? 'τα ' + u + ' είναι λιγότερα από τα προηγούμενα (' + numTxt(a.km!) + ').' : undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field-row">
      <div className="field"><label className="field__label" htmlFor="vf-d">Ημερομηνία</label><${DateField} id="vf-d" value=${date} onChange=${(e: any) => e.target.value && setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="vf-l">Λίτρα</label><input id="vf-l" className="ui-input" inputMode="decimal" value=${litres} onChange=${(e: any) => setLitres(e.target.value)} data-autofocus="" style=${{ maxWidth: '110px' }}/></div>
      <div className="field"><label className="field__label" htmlFor="vf-k">${row.cat?.hours ? 'Ώρες κινητήρα' : 'Χιλιόμετρα'}</label><input id="vf-k" className="ui-input" inputMode="decimal" value=${km} onChange=${(e: any) => setKm(e.target.value)} style=${{ maxWidth: '130px' }}/></div></div>
      ${back && html`<${Alert} tone="warn">Τα ${u} είναι λιγότερα από τα προηγούμενα (${numTxt(a.km!)}). Μπορείς να συνεχίσεις.<//>`}
      <p className="note" style=${{ margin: 0 }}>Γράφεται γέμισμα στο ιστορικό και ενημερώνονται τα ${u} του οχήματος.</p></div><//>`;
}
function KmDialog({ row, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const a: Asset = row.a; const u = unitTxt(row.cat);
  const [date, setDate] = useState(today); const [km, setKm] = useState(''); const k = numOr(km);
  const back = k != null && a.km != null && k < a.km && (!a.kmOn || date >= a.kmOn);
  return html`<${Dialog} title=${(row.cat?.hours ? 'Ώρες κινητήρα · ' : 'Χιλιόμετρα · ') + nmOf(row)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${k == null || !date} onClick=${() => doIt({ t: 'assetKm', ...same(row), date, km: k }, nmOf(row) + ': ' + numTxt(k!) + ' ' + u, back ? 'τα ' + u + ' είναι λιγότερα από τα προηγούμενα.' : undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field-row">
      <div className="field"><label className="field__label" htmlFor="vk-d">Ημερομηνία</label><${DateField} id="vk-d" value=${date} onChange=${(e: any) => e.target.value && setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="vk-k">Ένδειξη (τώρα ${a.km != null ? numTxt(a.km) : '—'})</label><input id="vk-k" className="ui-input" inputMode="decimal" value=${km} onChange=${(e: any) => setKm(e.target.value)} data-autofocus="" style=${{ maxWidth: '150px' }}/></div></div>
      ${back && html`<${Alert} tone="warn">Τα ${u} είναι λιγότερα από τα προηγούμενα. Μπορείς να συνεχίσεις.<//>`}</div><//>`;
}
function VMaintDialog({ row, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const a: Asset = row.a; const c: AssetCat | undefined = row.cat; const u = unitTxt(c);
  const [date, setDate] = useState(today); const [km, setKm] = useState(a.km != null ? String(a.km) : ''); const [note, setNote] = useState('');
  const k = numOr(km); const every = a.maint?.every ?? c?.every; const nd = every && date ? addMonths(date, every) : ''; const nk = k != null && c?.everyKm ? k + c.everyKm : undefined;
  return html`<${Dialog} title=${'Έγινε συντήρηση · ' + nmOf(row)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!date} onClick=${() => doIt({ t: 'assetMaint', ...same(row), date, km: k, note }, 'Συντήρηση ' + nmOf(row) + ' ' + dmy(date), undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field-row">
      <div className="field"><label className="field__label" htmlFor="vm-d">Ημερομηνία συντήρησης</label><${DateField} id="vm-d" value=${date} onChange=${(e: any) => e.target.value && setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="vm-k">${c?.hours ? 'Ώρες κινητήρα' : 'Χιλιόμετρα'} (προαιρετικά)</label><input id="vm-k" className="ui-input" inputMode="decimal" value=${km} onChange=${(e: any) => setKm(e.target.value)} style=${{ maxWidth: '150px' }}/></div></div>
      <div className="field"><label className="field__label" htmlFor="vm-n">Σημείωση (προαιρετικά)</label><input id="vm-n" className="ui-input" value=${note} onChange=${(e: any) => setNote(e.target.value)} placeholder="π.χ. λάδια και φίλτρα, ΕΜΑ"/></div>
      <p className="note" style=${{ margin: 0 }}>${nd || nk != null ? 'Επόμενη συντήρηση: ' + [nd && dmy(nd) + ' (κάθε ' + every + ' μήνες)', nk != null && 'στα ' + numTxt(nk) + ' ' + u].filter(Boolean).join(' ή ') + ' · όποιο έρθει πρώτο.' : 'Δεν έχει οριστεί «κάθε Ν μήνες» ή «κάθε Ν ' + u + '» (στην «Αλλαγή…» ή στην κατηγορία): θα γραφτεί μόνο η τελευταία συντήρηση.'}</p></div><//>`;
}
function VStateDialog({ row, mode, onClose }: P) {
  const { today } = useStore(); const doIt = useDo(); const [why, setWhy] = useState(''); const [date, setDate] = useState(today);
  const imm = mode === 'immobile';
  return html`<${Dialog} title=${(imm ? 'Ακινησία · ' : 'Προς επισκευή · ') + nmOf(row)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${() => doIt({ t: 'assetState', ...same(row), state: imm ? 'immobile' : 'repair', why, date }, nmOf(row) + ': ' + (imm ? 'ακινησία' : 'προς επισκευή'), undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field"><label className="field__label" htmlFor="vs-d">Ημερομηνία</label><${DateField} id="vs-d" value=${date} onChange=${(e: any) => e.target.value && setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="vs-w">Λόγος (προαιρετικά)</label><input id="vs-w" className="ui-input" value=${why} onChange=${(e: any) => setWhy(e.target.value)} placeholder=${imm ? 'π.χ. μπαταρίες, έλλειψη ανταλλακτικού' : 'π.χ. κιβώτιο ταχυτήτων'} data-autofocus=""/></div></div><//>`;
}
function DriverDialog({ row, onClose }: P) {
  const { state, today } = useStore(); const doIt = useDo(); const a: Asset = row.a;
  const [kind, setKind] = useState('soldier'); const [who, setWho] = useState<{ d: NonNullable<Asset['driver']>; label: string } | null>(null); const [date, setDate] = useState(today);
  const people = useMemo(() => (kind === 'cadre' ? pickPeople(state).filter(p => p.cid) : state.people.filter(p => p.active)), [kind, state.people, state.cadreList]);
  const ready = kind === 'none' || !!who;
  return html`<${Dialog} title=${'Οδηγός · ' + nmOf(row)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ready} onClick=${() => doIt({ t: 'assetDriver', ...same(row), date, driver: kind === 'none' ? null : who!.d }, nmOf(row) + ': ' + (kind === 'none' ? 'χωρίς οδηγό' : 'οδηγός ' + who!.label), undefined, onClose)}>Αποθήκευση<//>`}>
    <div className="stack">
      <p className="note" style=${{ margin: 0 }}>Τώρα: <b>${a.driver ? driverText(state, a.driver) : 'χωρίς οδηγό'}</b></p>
      <div className="field"><label className="field__label" htmlFor="vd-k">Ποιος οδηγεί</label><${Select} id="vd-k" className="ui-input" value=${kind} onChange=${(e: any) => { setKind(e.target.value); setWho(null); }}><option value="soldier">Οπλίτης</option><option value="cadre">Στέλεχος</option><option value="none">Κανείς</option><//></div>
      ${kind !== 'none' && html`<div className="field"><label className="field__label" htmlFor="vd-p">${kind === 'soldier' ? 'Οπλίτης' : 'Στέλεχος'}</label>
        <${PersonPicker} key=${kind} id="vd-p" people=${people} placeholder=${kind === 'soldier' ? 'Επώνυμο, όνομα ή ΑΣΜ…' : 'Επώνυμο του στελέχους…'} onChange=${(id: number) => { const p = people.find((x: any) => x.id === id); if (p) setWho({ d: p.cid ? { k: 'cadre', cid: p.cid } : { k: 'person', pid: p.id }, label: (p.rank || '') + ' ' + p.last + ' ' + p.first }); }}/>
        ${who && html`<div style=${{ marginTop: '6px' }}>Διάλεξες: <b>${who.label}</b></div>`}</div>`}
      <div className="field"><label className="field__label" htmlFor="vd-d">Ημερομηνία</label><${DateField} id="vd-d" value=${date} onChange=${(e: any) => e.target.value && setDate(e.target.value)}/></div></div><//>`;
}
function VehicleEditDialog({ row, cfg, defCat, onClose, onSaved }: P) {
  const { today } = useStore(); const doIt = useDo(); const isNew = !row; const a0: Asset | undefined = row?.a;
  const vcats: AssetCat[] = cfg.cats.filter((c: AssetCat) => c.kind === 'vehicle');
  const [f, setF] = useState(() => ({ cat: a0?.cat || (vcats.find(c => c.id === defCat) || vcats[0])?.id || '', type: a0?.type || '', plate: a0?.plate || a0?.no || '', km: a0?.km != null ? String(a0.km) : '', every: String(a0?.maint?.every || ''),
    last: a0?.maint?.last || '', next: a0?.maint?.next || '', lastKm: a0?.maint?.lastKm != null ? String(a0.maint.lastKm) : '', nextKm: a0?.maint?.nextKm != null ? String(a0.maint.nextKm) : '', acc: a0?.acc || '', note: a0?.note || '', extra: { ...(a0?.extra || {}) } as Record<string, string> }));
  const cat: AssetCat | undefined = catOf(cfg, f.cat); const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const save = () => {
    const km = numOr(f.km); const every = Math.floor(Number(f.every));
    const maint = { ...(a0?.maint || {}), last: f.last || undefined, next: f.next || undefined, every: every > 0 ? every : undefined, lastKm: numOr(f.lastKm), nextKm: numOr(f.nextKm) };
    const asset: any = { ...(a0 || {}), id: row?.key, cat: f.cat, type: f.type, no: f.plate, plate: f.plate.trim(), km, maint, acc: f.acc, note: f.note, extra: f.extra, state: a0?.state || 'ok', holder: a0?.holder, driver: a0?.driver };
    if (km !== a0?.km) { if (km != null) asset.kmOn = today; else delete asset.kmOn; }
    if (!asset.id) delete asset.id;
    return doIt({ t: 'saveAsset', asset, date: today }, (isNew ? 'Νέο όχημα: ' : 'Αλλαγή: ') + [f.type, f.plate].filter(Boolean).join(' '), undefined, onClose).then((ok: boolean) => { if (ok && !isNew && row) onSaved(row.key); });
  };
  const fld = (id: string, label: string, k: string, o: P = {}) => html`<div className="field" style=${o.style}><label className="field__label" htmlFor=${'ve-' + id}>${label}</label><input id=${'ve-' + id} className="ui-input" value=${f[k as keyof typeof f] as string} placeholder=${o.ph || ''} inputMode=${o.num ? 'decimal' : undefined} data-autofocus=${o.focus ? '' : undefined} onChange=${(e: any) => set(k, e.target.value)}/></div>`;
  const u = unitTxt(cat);
  return html`<${Dialog} title=${isNew ? 'Νέο όχημα' : 'Αλλαγή · ' + nmOf(row)} onClose=${onClose} size="lg"
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!f.plate.trim() || !f.cat} onClick=${save}>Αποθήκευση<//>`}>
    <div className="stack">
      <div className="field-row">
        <div className="field"><label className="field__label" htmlFor="ve-cat">Κατηγορία</label><${Select} id="ve-cat" className="ui-input" value=${f.cat} onChange=${(e: any) => set('cat', e.target.value)}>${vcats.map(c => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}<//></div>
        <${ChoiceField} id="ve-type" label="Τύπος" value=${f.type} options=${cat?.types || []} onChange=${(v: string) => set('type', v)} otherLabel="Άλλος τύπος (γράψε τον)…" placeholder="π.χ. ΜΑΝ 6t"/>
        ${fld('plate', 'Πινακίδα', 'plate', { ph: 'ΕΣ 12345', focus: true })}${fld('km', cat?.hours ? 'Ώρες κινητήρα' : 'Χιλιόμετρα', 'km', { num: true, style: { maxWidth: '130px' } })}</div>
      <div className="field-row">${fld('every', 'Συντήρηση κάθε (μήνες)', 'every', { ph: String(cat?.every || ''), style: { maxWidth: '150px' } })}
        <div className="field"><label className="field__label" htmlFor="ve-last">Τελευταία συντήρηση</label><${DateField} id="ve-last" value=${f.last} onChange=${(e: any) => set('last', e.target.value || '')}/></div>
        <div className="field"><label className="field__label" htmlFor="ve-next">Επόμενη (ημερομηνία)</label><${DateField} id="ve-next" value=${f.next} onChange=${(e: any) => set('next', e.target.value || '')}/></div>
        ${fld('lastKm', 'Τελευταία στα ' + u, 'lastKm', { num: true, style: { maxWidth: '130px' } })}${fld('nextKm', 'Επόμενη στα ' + u, 'nextKm', { num: true, style: { maxWidth: '130px' }, ph: cat?.everyKm ? 'κάθε ' + numTxt(cat.everyKm) : '' })}</div>
      ${(cat?.fields || []).length > 0 && html`<div className="field-row">${cat!.fields.map((x: any) => html`<div className="field" key=${x.id}><label className="field__label" htmlFor=${'ve-x-' + x.id}>${x.name}</label><input id=${'ve-x-' + x.id} className="ui-input" value=${f.extra[x.id] || ''} onChange=${(e: any) => setF(y => ({ ...y, extra: { ...y.extra, [x.id]: e.target.value } }))}/></div>`)}</div>`}
      ${fld('acc', 'Παρελκόμενα', 'acc', { ph: 'π.χ. τρίγωνο, πυροσβεστήρας, φαρμακείο, γρύλος, ρεζέρβα' })}${fld('note', 'Παρατηρήσεις', 'note')}
      <p className="note" style=${{ margin: 0 }}>Κάτοχος, οδηγός, ακινησία και επισκευή αλλάζουν από τα κουμπιά της καρτέλας.</p>
    </div><//>`;
}
