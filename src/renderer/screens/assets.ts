// features/assets: καρτέλες «Μητρώο όπλων» και «Υλικό» του Οπλισμού (Michael, 24/11: επανασχεδιασμός, τα υλικά δεν ανακατεύονται πια με τα όπλα).
// Κοινός πίνακας για τις δύο: φίλτρα (αναζήτηση, chips, πλήθος), γραμμές 34px με τσεκ για μαζικές ενέργειες, και πλαϊνή καρτέλα 420px με
// καρτέλες Στοιχεία / Παρελκόμενα / Ιστορικό και ↑/↓ για το επόμενο. Ένα κύριο κουμπί, τα υπόλοιπα στο «Ενέργειες ▾», η εξήγηση πίσω από το «?».
// Τα κύρια όπλα των ατόμων φαίνονται από το Δυναμολόγιο ως «εικονικές» γραμμές (v:p:<pid>) και γίνονται εγγραφές με την πρώτη αλλαγή.
// Κάθε αλλαγή είναι εντολή (αναίρεση) και γράφει γεγονός στο ιστορικό. Τίποτα δεν μπλοκάρεται.
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { WeaponMapDialog } from './weaponMap';
import { Pop } from './weaponMoves';
import { html, cx, Alert, Badge, Button, Dialog, Icon, VirtualList, typingText, useDirty, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { DateField, PersonPicker } from '../common';
import { useNav, useStore } from '../store';
import { ASSET_FILTERS, STATE_TXT, EVENT_TXT, accsToText, assetCfgOf, assetHistory, assetView, catOf, heldGroups, holderOut, holderText, maintState, maintTxt, parseAccText, rowPlace, registry, sameNo, type AssetFilter, type AssetRow } from '../../shared/assets';
import { addMonths, heldBy } from '../../shared/assets';
import { drivenBy } from '../../shared/vehicles';
import { dmy, nowHM } from '../../shared/dates';
import { weaponKey } from '../../shared/weapons';
import { pickPeople } from '../../shared/rules';
import { normGreek } from '../../shared/text';
import type { Asset, AssetCat, AssetHolder } from '../../shared/domain';
type P = any;
type Mode = 'weapon' | 'material';

const ROW_H = 34; const HEAD_H = 34;
const stTone = (a: Asset) => (a.state === 'ok' ? 'ok' : a.state === 'writeoff' ? 'outline' : 'bad');
const hasPrimaryWeapon = (state: P, h: AssetHolder) => (h.k === 'person' ? !!weaponKey(state.people.find((p: P) => p.id === h.pid)?.weapon) : h.k === 'cadre' ? !!weaponKey(state.cadreList.find((c: P) => c.id === h.cid)?.weapon) : false);
const nameOf = (a: Asset) => [a.type, a.no].filter(Boolean).join(' ');
const holderShort = (state: P, h?: AssetHolder) => holderText(state, h).replace(/ \((στέλεχος|άλλη μονάδα|φυσικό πρόσωπο)\)$/, '');

// ---------- Ετικέτα κατάστασης και συντήρησης ----------
function StateBadges({ a, today, warn }: { a: Asset; today: string; warn: number }) {
  // μία ετικέτα στη γραμμή (χωράει): πρώτα η κατάσταση αν δεν είναι λειτουργικό, μετά η συντήρηση που πλησιάζει, μετά «εμπόλεμη»
  const m = maintState(a, today, warn);
  if (a.state !== 'ok') return html`<${Badge} tone=${stTone(a)} data-tip=${a.why || undefined}>${STATE_TXT[a.state]}<//>`;
  if (m === 'overdue') return html`<${Badge} tone="bad" data-tip=${'Η συντήρηση ήταν για ' + dmy(a.maint!.next!)}>καθυστέρηση<//>`;
  if (m === 'soon') return html`<${Badge} tone="warn" data-tip=${'Επόμενη συντήρηση ' + dmy(a.maint!.next!)}>${maintTxt(a, today)}<//>`;
  return html`<${Badge} tone=${a.warOnly ? 'outline' : 'ok'} data-tip=${a.warOnly ? 'Λειτουργικό, μόνο σε εμπόλεμη περίοδο' : undefined}>${a.warOnly ? 'εμπόλεμη' : STATE_TXT.ok}<//>`;
}

// ---------- Μενού κάτω από κουμπί (Ενέργειες ▾, Εκτύπωση ▾, φίλτρα) ----------
export interface MenuItem { label?: any; fn?: () => void; disabled?: boolean; tip?: string; sep?: boolean; on?: boolean }
export function MenuBtn({ label, items, variant = 'outline', size, tip, caretOnly, pressed, children }: { label?: string; items?: MenuItem[]; variant?: string; size?: string; tip?: string; caretOnly?: boolean; pressed?: boolean; children?: any }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement>(null); const close = useCallback(() => setOpen(false), []);
  return html`<${Fragment}><span ref=${ref} className="op__menu"><${Button} variant=${variant} size=${size} aria-haspopup="true" aria-expanded=${open} aria-pressed=${pressed} data-tip=${tip} aria-label=${caretOnly ? label : undefined} onClick=${() => setOpen(o => !o)}>${caretOnly ? '' : label + ' '}▾<//></span>
    ${open && html`<${Pop} anchor=${ref} onClose=${close} label=${label || 'Μενού'}>${children || html`<ul className="wmenu">${(items || []).map((it, i) => (it.sep ? html`<li key=${i} className="op__sep" role="separator"></li>` : html`<li key=${i}><button type="button" className=${cx('wmenu__item', it.on && 'is-on')} disabled=${it.disabled} data-tip=${it.tip} onClick=${() => { close(); it.fn && it.fn(); }}>${it.label}</button></li>`))}</ul>`}<//>`}<//>`;
}

// Το «?»: η εξήγηση της καρτέλας, μακριά από την οθόνη
export function HelpPop({ title, children }: { title: string; children?: any }) {
  const [open, setOpen] = useState(false);
  return html`<${Fragment}><button type="button" className="op__help" aria-label="Βοήθεια" data-tip="Τι δείχνει αυτή η καρτέλα" onClick=${() => setOpen(true)}>${Icon.help}</button>
    ${open && html`<${Dialog} title=${title} onClose=${() => setOpen(false)} footer=${html`<${Button} onClick=${() => setOpen(false)}>Εντάξει<//>`}><div className="stack">${children}</div><//>`}<//>`;
}
function HelpBtn({ mode }: { mode: Mode }) {
  return html`<${HelpPop} title=${mode === 'weapon' ? 'Μητρώο όπλων' : 'Υλικό'}>
        ${mode === 'weapon' ? html`<${Fragment}>
          <p>Όλα τα όπλα της μονάδας, ένα ανά γραμμή. Ο αριθμός όπλου ενός στρατιώτη ή στελέχους (καρτέλα «Όπλα ανά άτομο») είναι το ίδιο όπλο: φαίνεται εδώ από το Δυναμολόγιο και γίνεται εγγραφή του μητρώου όταν το αλλάξεις (συντήρηση, κατάσταση, παρατηρήσεις…). Ο κάτοχος, ο τύπος και η θέση οπλοβαστού του κύριου όπλου αλλάζουν και από τις δύο πλευρές και μένουν πάντα ίδια.</p>
          <p>Τσέκαρε πολλές γραμμές για μαζική ενέργεια (συντήρηση, χρέωση, επισκευή, εκτύπωση). Με ↑/↓ πας στην προηγούμενη ή την επόμενη γραμμή.</p>
          <p>Το υλικό (διόπτρες, ασύρματοι, ιματισμός…) έχει δική του καρτέλα, «Υλικό». Τα οχήματα είναι στην οθόνη Οχήματα.</p><//>`
        : html`<${Fragment}>
          <p>Το υλικό της μονάδας (διόπτρες, ασύρματοι, ιματισμός, λοιπό υλικό) με ποσότητα, σειριακό, κάτοχο και θέση, χωρίς οπλοβαστό. Τα πεδία κάθε κατηγορίας (π.χ. κανάλι ασυρμάτου) φαίνονται στην καρτέλα δεξιά.</p>
          <p>Κατηγορίες, τύποι, παρελκόμενα και πεδία αλλάζουν από Ρυθμίσεις › Μητρώο οπλισμού και υλικού.</p><//>`}
  <//>`;
}

// ---------- ↑/↓: προηγούμενη/επόμενη γραμμή (κοινό για Οπλισμό και Οχήματα) ----------
export function useArrowNav<T extends { key: string }>(rows: T[], curKey: string | undefined, setSel: (k: string) => void, rowH = ROW_H, headH = HEAD_H) {
  const body = useRef<HTMLDivElement>(null);
  const curIn = curKey ? rows.findIndex(r => r.key === curKey) : -1;
  const go = useCallback((i: number) => {
    const r = rows[i]; if (!r) return; setSel(r.key);
    const el = body.current; if (el) { const top = i * rowH, vis = el.clientHeight - headH; if (top < el.scrollTop) el.scrollTop = top; else if (top + rowH > el.scrollTop + vis) el.scrollTop = top + rowH - vis; }
  }, [rows, rowH, headH]);
  // ↑/↓: όταν δεν γράφεις κάπου και δεν είναι ανοιχτό παράθυρο
  const goRef = useRef(go); goRef.current = go; const at = useRef(curIn); at.current = curIn;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || at.current < 0) return;
      if (typingText(document.activeElement) || document.querySelector('.ui-overlay, .wpop, .ui-dd__pop')) return;
      e.preventDefault(); goRef.current(at.current + (e.key === 'ArrowDown' ? 1 : -1));
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, []);
  return { body, go, curIn };
}

// ---------- Η οθόνη ----------
export function RegistryView({ mode, tabs }: { mode: Mode; tabs: any }) {
  const { state, today } = useStore(); const nav = useNav(); const toast = useToast();
  const weapon = mode === 'weapon';
  const cfg = useMemo(() => assetCfgOf(state.settings, state), [state.settings, state.people, state.cadreList]);
  const [cat, setCat] = useState<string>(nav.params.acat || ''); const [filter, setFilter] = useState<AssetFilter>('all');
  const [types, setTypes] = useState<string[]>([]);   // φίλτρο τύπων όπλων (πολλαπλή επιλογή)
  const [q, setQ] = useState<string>(nav.params.aq || ''); const dq = useDeferredValue(q);
  const [sel, setSel] = useState<string | null>(null); const [ptab, setPtab] = useState<'info' | 'acc' | 'hist'>('info');
  const [chk, setChk] = useState<Set<string>>(() => new Set());
  const [dlg, setDlg] = useState<{ t: 'edit' | 'maint' | 'repair' | 'writeoff' | 'assign' | 'gone'; row?: AssetRow; rows?: AssetRow[] } | null>(null);
  const [xl, setXl] = useState(false);
  const height = useViewportHeight(300);
  useEffect(() => { if (nav.params.aq != null || nav.params.acat != null) nav.set({ aq: null, acat: null }); }, []);   // μία φορά, από τον σύνδεσμο της καρτέλας ατόμου
  useEffect(() => { setCat(''); setTypes([]); setFilter('all'); setSel(null); setChk(new Set()); }, [mode]);
  const all = useMemo(() => registry(state, { day: today, hm: nowHM() }), [state.people, state.cadreList, state.assets, state.settings, state.guards, state.dutyLog, state.rules, state.dutyFix, today]);   // ΑΠΩΝ στη θέση: υπηρεσία εκτός στρατοπέδου
  const mine = useMemo(() => all.filter(r => (r.cat ? r.cat.kind === mode : weapon)), [all, mode]);
  const kinds = useMemo(() => cfg.cats.filter(c => c.kind === mode), [cfg, mode]);
  const tset = useMemo(() => new Set(types.map(normGreek)), [types]);
  const view = useCallback((o: { cat?: string; filter: AssetFilter }) => assetView(state, { ...o, q: dq, kinds: [mode] }, today, all), [state.people, state.cadreList, state.assets, state.settings, dq, today, all, mode]);
  const base = useMemo(() => view({ cat: cat || undefined, filter }), [view, cat, filter]);
  const rows = useMemo(() => (tset.size ? base.filter(r => tset.has(normGreek(r.a.type))) : base), [base, tset]);
  const typeList = useMemo(() => { const m = new Map<string, { n: string; c: number }>(); for (const r of view({ cat: cat || undefined, filter })) { const k = normGreek(r.a.type); if (!r.a.type) continue; const o = m.get(k); if (o) o.c++; else m.set(k, { n: r.a.type, c: 1 }); } return [...m.values()].sort((a, b) => a.n.localeCompare(b.n, 'el', { numeric: true })); }, [view, cat, filter]);
  const fcounts = useMemo(() => Object.fromEntries(ASSET_FILTERS(cfg.warnDays).map(([k]) => [k, view({ cat: cat || undefined, filter: k }).filter(r => !tset.size || tset.has(normGreek(r.a.type))).length])), [view, cat, cfg, tset]);
  const ccounts = useMemo(() => { const m = new Map<string, number>(); for (const r of view({ filter })) m.set(r.a.cat, (m.get(r.a.cat) || 0) + 1); return m; }, [view, filter]);
  const total = mine.length; const held = mine.filter(r => r.a.holder && (r.a.holder.k === 'person' || r.a.holder.k === 'cadre')).length; const free = mine.filter(r => !r.a.holder).length;
  const repair = mine.filter(r => r.a.state === 'repair' || r.a.state === 'immobile').length;
  const cur = sel ? all.find(r => r.key === sel) || null : null;
  const { body, go, curIn } = useArrowNav(rows, cur?.key, setSel);
  const checked = useMemo(() => all.filter(r => chk.has(r.key)), [all, chk]);
  const GRID = weapon ? '34px 70px 92px minmax(110px,1.5fr) minmax(100px,1fr) 130px 84px' : '34px 100px minmax(110px,1.4fr) 96px 52px minmax(100px,1.2fr) minmax(90px,1fr) 130px'; const MIN = weapon ? 640 : 708;
  const exportXl = async (print: boolean, only?: string[]) => {
    setXl(true);
    try {
      const r = await window.api.exportAssets(print, { cat: cat || undefined, filter, q: dq, kind: mode, ...(only ? { keys: only } : tset.size ? { keys: rows.map(x => x.key) } : {}) });
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού και ΣΥΝΟΛΑ (όπως φαίνεται το φίλτρο).' });
    } finally { setXl(false); }
  };
  const [book, setBook] = useState<P | null>(null);
  const pickFile = async () => { const r = await window.api.wpnPick(); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; } setBook(r); };
  const clear = () => { setQ(''); setFilter('all'); setCat(''); setTypes([]); };
  const toggle = useCallback((k: string) => setChk(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const allOn = rows.length > 0 && rows.every(r => chk.has(r.key));
  const renderRow = useCallback((r: AssetRow, i: number, style: P) => {
    const a = r.a; const out = holderOut(state, a.holder); const on = chk.has(r.key);
    const who = a.holder ? html`<${Fragment}>${holderShort(state, a.holder)}${a.holder.k !== 'person' ? html` <small className="muted">(${a.holder.k === 'cadre' ? 'στέλεχος' : a.holder.k === 'unit' ? 'άλλη μονάδα' : 'φυσ. πρόσωπο'})</small>` : ''}${out ? html` <${Badge} tone="warn">εκτός δύναμης<//>` : ''}<//>` : 'αχρέωτο';
    const place = rowPlace(cfg, r) || '—';
    return html`<div key=${r.key} className=${cx('ptable__row op__row', i % 2 === 1 && 'is-odd', sel === r.key && 'is-sel')} style=${{ ...style, gridTemplateColumns: GRID }} role="row" tabIndex="0" aria-selected=${sel === r.key} data-asset-row=${r.key}
        onClick=${() => setSel(r.key)} onKeyDown=${(e: any) => { if (e.key === 'Enter') setSel(r.key); }}>
      <span className="op__chk" onClick=${(e: any) => e.stopPropagation()}><input type="checkbox" checked=${on} aria-label=${'Επιλογή ' + nameOf(a)} onChange=${() => toggle(r.key)}/></span>
      ${weapon ? html`<${Fragment}><span>${a.type || '—'}</span><span className="num"><b>${a.no}</b></span>
        <span className=${cx(!a.holder && 'muted')} data-tip=${holderText(state, a.holder) + (out ? ' · χρεωμένο σε άτομο εκτός δύναμης' : '')}>${a.holder ? html`<b>${who}</b>` : who}</span>
        <span>${place}</span><span className="op__st"><${StateBadges} a=${a} today=${today} warn=${cfg.warnDays}/></span>
        <span className=${cx('num', maintState(a, today, cfg.warnDays) === 'overdue' && 'mit__late')}>${a.maint?.next ? dmy(a.maint.next).slice(3) : '—'}</span><//>`
      : html`<${Fragment}><span>${r.cat?.name || '—'}</span><span><b>${a.type || '—'}</b></span><span className="num">${a.no || '—'}</span><span className="num">${a.qty || 1}</span>
        <span className=${cx(!a.holder && 'muted')} data-tip=${holderText(state, a.holder) + (out ? ' · χρεωμένο σε άτομο εκτός δύναμης' : '')}>${who}</span>
        <span>${place}</span><span className="op__st"><${StateBadges} a=${a} today=${today} warn=${cfg.warnDays}/></span><//>`}</div>`;
  }, [sel, chk, state, GRID, cfg, today, weapon, toggle]);
  const chips = ASSET_FILTERS(cfg.warnDays);
  const head3 = chips.slice(0, 3); const rest = chips.slice(3); const restOn = rest.find(([k]) => k === filter);
  const catItems: MenuItem[] = [{ label: 'Όλες', on: !cat, fn: () => setCat('') }, ...kinds.map(c => ({ label: c.name + ' (' + (ccounts.get(c.id) || 0) + ')', on: cat === c.id, fn: () => setCat(c.id) }))];
  const printItems: MenuItem[] = [
    { label: 'Εκτύπωση (προεπισκόπηση)', fn: () => exportXl(true), disabled: xl, tip: 'Προεπισκόπηση εκτύπωσης του «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ», όπως φαίνεται το φίλτρο' },
    { label: 'Εκτύπωση επιλεγμένων (' + chk.size + ')', fn: () => exportXl(true, checked.map(r => r.key)), disabled: xl || !chk.size, tip: 'Μόνο οι τσεκαρισμένες γραμμές' },
    { sep: true },
    { label: 'Βγάλε το Excel «ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ»', fn: () => exportXl(false), disabled: xl, tip: 'Νέο αρχείο: ένα φύλλο ανά τύπο όπλου, ένα ανά κατηγορία υλικού και ΣΥΝΟΛΑ. Βγάζει ό,τι φαίνεται (κατηγορία, φίλτρο, αναζήτηση).' }];
  const moreItems: MenuItem[] = [
    ...(weapon ? [{ label: 'Αρχείο οπλισμού μονάδας…', fn: pickFile, tip: 'Έχει η μονάδα σου δικό της αρχείο οπλισμού; Δείξε τι είναι κάθε φύλλο, στήλη και λέξη και πέρασέ το στο Μητρώο. Το αρχείο σου δεν αλλάζει ποτέ' }] : []),
    { label: 'Κατηγορίες, τύποι, παρελκόμενα…', fn: () => nav.go('templates', { tab: 'assets' }), tip: 'Ρυθμίσεις › Μητρώο οπλισμού και υλικού' },
    { label: 'Καθάρισε αναζήτηση και φίλτρα', fn: clear }];
  const sum = weapon ? total + (total === 1 ? ' όπλο · ' : ' όπλα · ') + held + ' χρεωμένα · ' + repair + ' προς επισκευή' : 'Υλικό: ' + total + (total === 1 ? ' είδος' : ' είδη') + ' σε ' + new Set(mine.map(r => r.a.cat)).size + ' κατηγορίες · ' + free + ' αχρέωτα';
  return html`<div className="op" data-mitroo=${weapon ? '' : undefined} data-yliko=${weapon ? undefined : ''}>
    ${book && html`<${WeaponMapDialog} book=${book} onClose=${() => setBook(null)}/>`}
    <div className="op__top"><h1>Οπλισμός</h1><${HelpBtn} mode=${mode}/><span className="op__sum">${sum}</span>
      <span className="op__topacts"><${Button} onClick=${() => setDlg({ t: 'edit' })}>${weapon ? '+ Νέο όπλο' : '+ Νέο υλικό'}<//><${MenuBtn} label="Ενέργειες" items=${moreItems}/></span></div>
    <div className="op__tabrow">${tabs}
      <span className="op__split"><${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Προεπισκόπηση εκτύπωσης του ΜΗΤΡΩΟ ΟΠΛΙΣΜΟΥ, όπως φαίνεται το φίλτρο">${Icon.print}Εκτύπωση<//><${MenuBtn} caretOnly items=${printItems} label="Επιλογές εκτύπωσης"/></span></div>
    <div className="op__tools"><input type="search" className="ui-input op__search" aria-label=${weapon ? 'Αναζήτηση στο μητρώο όπλων' : 'Αναζήτηση στο υλικό'} placeholder=${weapon ? 'Αριθμός, τύπος, κάτοχος ή θέση…' : 'Είδος, σειριακός, κάτοχος…'} value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <div className="op__chips" role="group" aria-label="Φίλτρα">
        ${weapon ? head3.map(([k, l, tip]) => html`<button key=${k} type="button" className="ui-chip ui-chip--sm" aria-pressed=${filter === k} data-tip=${tip} onClick=${() => setFilter(k)}>${l}<span className="cnt">${fcounts[k] || 0}</span></button>`)
          : html`<${Fragment}><button type="button" className="ui-chip ui-chip--sm" aria-pressed=${!cat} onClick=${() => setCat('')}>Όλα<span className="cnt">${[...ccounts.values()].reduce((x, y) => x + y, 0)}</span></button>
            ${kinds.map(c => html`<button key=${c.id} type="button" className="ui-chip ui-chip--sm" aria-pressed=${cat === c.id} onClick=${() => setCat(cat === c.id ? '' : c.id)}>${c.name}<span className="cnt">${ccounts.get(c.id) || 0}</span></button>`)}<//>`}
        ${weapon && html`<${MenuBtn} variant="outline" size="sm" label=${'Κατηγορία: ' + (cat ? catOf(cfg, cat)?.name || '' : 'Όλες')} items=${catItems}/>`}
        ${weapon && html`<${MenuBtn} variant="outline" size="sm" pressed=${types.length > 0} label=${'Τύπος: ' + (types.length ? types.join(', ') : 'Όλοι')}>
          <div className="stack op__types"><b>Τύποι όπλων</b>${typeList.length ? typeList.map(t => html`<label key=${t.n} className="check"><input type="checkbox" checked=${tset.has(normGreek(t.n))} onChange=${(e: any) => setTypes(l => (e.target.checked ? [...l, t.n] : l.filter(x => normGreek(x) !== normGreek(t.n))))}/><span>${t.n} <small className="muted">${t.c}</small></span></label>`) : html`<span className="muted">Κανένας τύπος.</span>`}
            ${types.length > 0 && html`<${Button} size="sm" variant="ghost" onClick=${() => setTypes([])}>Καθάρισε τους τύπους<//>`}</div><//>`}
        <${MenuBtn} variant="outline" size="sm" pressed=${!!restOn || (!weapon && filter !== 'all')} label=${weapon ? (restOn ? 'Φίλτρα: ' + restOn[1] : 'Φίλτρα') : 'Κατάσταση' + (filter !== 'all' ? ': ' + (chips.find(([k]) => k === filter)?.[1] || '') : '')} items=${(weapon ? rest : chips).map(([k, l, tip]) => ({ label: html`<span>${l}</span><span className="muted">${fcounts[k] || 0}</span>`, on: filter === k, tip, fn: () => setFilter(filter === k && k !== 'all' ? 'all' : k) }))}/>
      </div><span className="op__count">${rows.length === base.length && !tset.size ? rows.length + (weapon ? (rows.length === 1 ? ' όπλο' : ' όπλα') : (rows.length === 1 ? ' είδος' : ' είδη')) : rows.length + ' από ' + mine.length}</span></div>
    ${chk.size > 0 && html`<div className="op__bulk" role="region" aria-label="Μαζικές ενέργειες"><b>${chk.size} ${chk.size === 1 ? 'επιλεγμένο' : 'επιλεγμένα'}</b>
      <${Button} size="sm" variant="outline" onClick=${() => setDlg({ t: 'maint', rows: checked })}>Έγινε συντήρηση…<//>
      <${Button} size="sm" variant="outline" onClick=${() => setDlg({ t: 'assign', rows: checked })}>Χρέωσε σε…<//>
      <${Button} size="sm" variant="outline" onClick=${() => setDlg({ t: 'repair', rows: checked })}>Προς επισκευή…<//>
      <${Button} size="sm" variant="outline" disabled=${xl} onClick=${() => exportXl(true, checked.map(r => r.key))}>${Icon.print}Εκτύπωση επιλεγμένων<//>
      <button type="button" className="op__bulk-x" aria-label="Ξεκαθάρισε την επιλογή" data-tip="Ξεκαθάρισε την επιλογή" onClick=${() => setChk(new Set())}>${Icon.x}</button></div>`}
    <div className=${cx('op__grid', !cur && 'op__grid--solo')}>
      <div className="op__main">
        ${rows.length === 0 ? html`<div className="ui-card empty">${mine.length === 0 ? (weapon ? 'Το μητρώο είναι άδειο. Τα όπλα που γράφεις στην καρτέλα «Όπλα ανά άτομο» εμφανίζονται εδώ μόνα τους· για άλλα όπλα πάτα «+ Νέο όπλο».' : 'Δεν υπάρχει υλικό ακόμα. Πάτα «+ Νέο υλικό».') : html`Κανένα είδος δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
          html`<div className="ptable op__table" role="table" aria-rowcount=${rows.length}>
            <${VirtualList} className="op__body" scrollRef=${body} items=${rows} rowHeight=${ROW_H} height=${height} headHeight=${HEAD_H} minWidth=${MIN} resetKey=${mode + '|' + cat + '|' + filter + '|' + dq + '|' + types.join(',')}
              head=${html`<div className="ptable__head op__head" role="row" style=${{ gridTemplateColumns: GRID }}><span className="op__chk"><input type="checkbox" checked=${allOn} aria-label="Επιλογή όλων" onChange=${() => setChk(allOn ? new Set() : new Set(rows.map(r => r.key)))}/></span>
                ${weapon ? html`<${Fragment}><span>Τύπος</span><span>Αριθμός</span><span>Χρεωμένο σε</span><span>Θέση</span><span>Κατάσταση</span><span>Επόμ. συντ.</span><//>` : html`<${Fragment}><span>Κατηγορία</span><span>Είδος</span><span>Σειριακός</span><span>Ποσ.</span><span>Χρεωμένο σε</span><span>Θέση</span><span>Κατάσταση</span><//>`}</div>`}
              renderRow=${renderRow}/>
          </div>`}
      </div>
      ${cur && html`<${AssetCard} key=${cur.key} row=${cur} all=${all} cfg=${cfg} today=${today} tab=${ptab} setTab=${setPtab} at=${curIn} n=${rows.length} onDlg=${(t: any) => setDlg({ t, row: cur })} onClose=${() => setSel(null)} onMove=${(d: number) => go(curIn + d)}/>`}
    </div>
    ${dlg?.t === 'edit' && html`<${AssetEditDialog} row=${dlg.row} all=${all} cfg=${cfg} defCat=${cat} mode=${mode} onClose=${() => setDlg(null)} onSaved=${(k: string) => setSel(k || null)}/>`}
    ${dlg?.t === 'maint' && (dlg.rows || dlg.row) && html`<${MaintDialog} row=${dlg.row} rows=${dlg.rows} cfg=${cfg} onClose=${() => setDlg(null)} onDone=${() => dlg.rows && setChk(new Set())}/>`}
    ${(dlg?.t === 'repair' || dlg?.t === 'writeoff' || dlg?.t === 'gone') && (dlg.rows || dlg.row) && html`<${StateDialog} row=${dlg.row} rows=${dlg.rows} mode=${dlg.t} onClose=${() => setDlg(null)} onDone=${() => dlg.rows && setChk(new Set())}/>`}
    ${dlg?.t === 'assign' && (dlg.rows || dlg.row) && html`<${AssignDialog} row=${dlg.row} rows=${dlg.rows} onClose=${() => setDlg(null)} onDone=${() => dlg.rows && setChk(new Set())}/>`}
  </div>`;
}

// ---------- Πλαϊνή καρτέλα του επιλεγμένου (420px) ----------
export const accsOf = (a: Asset): { name: string; qty: number }[] => (a.accs?.length ? a.accs.map(x => ({ name: x.name, qty: x.qty || 1 })) : parseAccText(a.acc));
function AssetCard({ row, all, cfg, today, tab, setTab, at, n, onDlg, onClose, onMove }: P) {
  const { state } = useStore(); const a: Asset = row.a; const c: AssetCat | undefined = row.cat; const weapon = c ? c.kind === 'weapon' : true;
  const hist = useMemo(() => assetHistory(state.assetLog, row.key), [state.assetLog, row.key]);
  const dup = sameNo(all, row); const accs = accsOf(a);
  const kv = (k: string, v: any) => (v ? html`<${Fragment} key=${k}><dt>${k}</dt><dd>${v}</dd><//>` : null);
  const m = maintState(a, today, cfg.warnDays);
  const back = a.state === 'repair' || a.state === 'immobile';
  const more: MenuItem[] = [
    { label: back ? 'Επέστρεψε από επισκευή' : 'Προς επισκευή…', fn: () => onDlg('repair') },
    { label: a.state === 'writeoff' ? 'Όχι πια προς διαγραφή' : 'Προς διαγραφή…', fn: () => onDlg('writeoff') },
    ...(a.state === 'writeoff' ? [{ label: 'Διαγράφηκε οριστικά…', fn: () => onDlg('gone'), tip: 'Φεύγει από το μητρώο (μένει το ιστορικό)' }] : [])];
  const sub = [c?.name || 'Χωρίς κατηγορία', row.link ? 'κύριο όπλο του ' + holderShort(state, row.link) : ''].filter(Boolean).join(' · ');
  return html`<aside className="ui-card op__card" aria-label="Καρτέλα" data-asset-card="">
    <div className="op__card-head"><div><h3>${nameOf(a) || '—'}</h3><div className="muted">${sub} · <span data-tip="Με τα βέλη ↑/↓ πας στο προηγούμενο ή στο επόμενο">↑/↓ ${at + 1}/${n}</span></div></div>
      <button type="button" className="op__x" aria-label="Κλείσιμο καρτέλας" data-tip="Κλείσιμο" onClick=${onClose}>${Icon.x}</button></div>
    <div className="ui-tabs op__ptabs" role="tablist">${[['info', 'Στοιχεία'], ['acc', 'Παρελκόμενα (' + accs.length + ')'], ['hist', 'Ιστορικό (' + hist.length + ')']].map(([k, l]) => html`<button key=${k} type="button" role="tab" aria-selected=${tab === k} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    <div className="op__pbody">
      ${tab === 'info' && html`<${Fragment}>
        ${dup.length > 0 && html`<${Alert} tone="warn">Ο ίδιος αριθμός υπάρχει και σε: ${dup.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ')}<//>`}
        <dl className="kv mit__kv">
          <dt>Χρεωμένο σε</dt><dd><b>${holderText(state, a.holder)}</b>${holderOut(state, a.holder) ? html` <${Badge} tone="warn" data-tip="Χρεωμένο σε άτομο εκτός δύναμης: ξεχρέωσέ το ή άλλαξε κάτοχο">εκτός δύναμης<//>` : ''}</dd>
          ${kv('Θέση', rowPlace(cfg, row))}
          <dt>Κατάσταση</dt><dd><b>${STATE_TXT[a.state]}</b>${a.why ? ' · ' + a.why : ''}</dd>
          ${a.warOnly && html`<dt>Χρήση</dt><dd><b>Μόνο εμπόλεμη</b></dd>`}
          ${kv('Ποσότητα', (a.qty || 0) > 1 || !weapon ? a.qty || 1 : '')}
          ${kv('Τελευταία συντήρηση', a.maint?.last ? dmy(a.maint.last) : '')}
          ${(a.maint?.next || a.maint?.every || c?.every) && html`<dt>Επόμενη συντήρηση</dt><dd>${a.maint?.next ? html`<b>${dmy(a.maint.next)}</b>` : '—'}${m !== 'none' && m !== 'ok' ? html` <${Badge} tone=${m === 'overdue' ? 'bad' : 'warn'}>${maintTxt(a, today)}<//>` : ''} <small className="muted">κάθε ${a.maint?.every ?? c?.every ?? '—'} μήνες</small></dd>`}
          ${(c?.fields || []).map((f: any) => kv(f.name, a.extra?.[f.id]))}
          ${kv('Παρελκόμενα', accs.length ? accs.map(x => (x.qty > 1 ? x.name + ' ×' + x.qty : x.name)).join(' · ') : '')}${kv('Θέση στο αρχείο μονάδας', a.fileWord)}${kv('Παρατηρήσεις', a.note)}
        </dl><//>`}
      ${tab === 'acc' && (accs.length ? html`<ul className="op__accs">${accs.map(x => html`<li key=${x.name}><span>${x.name}</span><b>×${x.qty}</b></li>`)}</ul>` : html`<p className="muted">Κανένα παρελκόμενο. Πρόσθεσέ τα από το «Αλλαγή…».</p>`)}
      ${tab === 'hist' && (hist.length ? html`<ul className="mit__hist">${hist.map((e: any) => html`<li key=${e.id}><b>${dmy(e.date)}</b> ${EVENT_TXT[e.what as keyof typeof EVENT_TXT]}${e.text ? ': ' + e.text : ''}</li>`)}</ul>` : html`<p className="muted">Κανένα γεγονός ακόμα.</p>`)}
    </div>
    <div className="op__acts">
      ${weapon ? html`<${Fragment}><${Button} size="sm" onClick=${() => onDlg('maint')}>Έγινε συντήρηση…<//><${Button} size="sm" variant="outline" onClick=${() => onDlg('assign')}>Χρέωσε σε…<//><//>`
        : html`<${Fragment}><${Button} size="sm" onClick=${() => onDlg('assign')}>Χρέωσε σε…<//><${Button} size="sm" variant="outline" onClick=${() => onDlg('maint')}>Έγινε συντήρηση…<//><//>`}
      <${Button} size="sm" variant="outline" onClick=${() => onDlg('edit')}>Αλλαγή…<//>
      <${MenuBtn} size="sm" label="Ενέργειες" items=${more}/>
    </div>
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
// Ένα είδος ή πολλά (μαζική ενέργεια): πολλά = μία εντολή assetBulk, μία αναίρεση
const listOf = (row?: AssetRow, rows?: AssetRow[]): AssetRow[] => (rows && rows.length ? rows : row ? [row] : []);
const plural = (l: AssetRow[]) => (l.length === 1 ? nameOf(l[0].a) : l.length + ' είδη');
function MaintDialog({ row, rows, cfg, onClose, onDone }: P) {
  const { today } = useStore(); const doIt = useDo(); const list = listOf(row, rows); const a: Asset = list[0].a;
  const [date, setDate] = useState(today); const [note, setNote] = useState('');
  const every = a.maint?.every ?? list[0].cat?.every; const next = every && date ? addMonths(date, every) : '';
  const go = () => doIt(list.length > 1 ? { t: 'assetBulk', items: list.map(same), op: { k: 'maint', note }, date } : { t: 'assetMaint', ...same(list[0]), date, note }, 'Συντήρηση ' + plural(list) + ' ' + dmy(date), undefined, onClose).then((ok: boolean) => { if (ok && onDone) onDone(); });
  return html`<${Dialog} title=${'Έγινε συντήρηση · ' + plural(list)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!date} onClick=${go}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field"><label className="field__label" htmlFor="am-d">Ημερομηνία συντήρησης</label><${DateField} id="am-d" value=${date} onChange=${(e: any) => setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="am-n">Σημείωση (προαιρετικά)</label><input id="am-n" className="ui-input" value=${note} onChange=${(e: any) => setNote(e.target.value)} placeholder="π.χ. ΕΜΑ Ταξιαρχίας"/></div>
      <p className="note" style=${{ margin: 0 }}>${list.length > 1 ? 'Η συντήρηση γράφεται σε όλα τα επιλεγμένα· η επόμενη ορίζεται από το «κάθε Ν μήνες» του καθενός.' : next ? 'Επόμενη συντήρηση: ' + dmy(next) + ' (κάθε ' + every + ' μήνες).' : 'Δεν έχει οριστεί «κάθε Ν μήνες» (στην «Αλλαγή…» ή στην κατηγορία): θα γραφτεί μόνο η τελευταία συντήρηση.'}</p></div><//>`;
}
function StateDialog({ row, rows, mode, onClose, onDone }: P) {
  const { today } = useStore(); const doIt = useDo(); const list = listOf(row, rows); const a: Asset = list[0].a; const nm = plural(list); const bulk = list.length > 1;
  const back = !bulk && ((mode === 'repair' && (a.state === 'repair' || a.state === 'immobile')) || (mode === 'writeoff' && a.state === 'writeoff'));
  const [why, setWhy] = useState(''); const [date, setDate] = useState(today);
  const title = mode === 'gone' ? 'Διαγράφηκε οριστικά · ' + nm : back ? (mode === 'repair' ? 'Επέστρεψε από επισκευή · ' : 'Όχι πια προς διαγραφή · ') + nm : (mode === 'repair' ? 'Προς επισκευή · ' : 'Προς διαγραφή · ') + nm;
  const st = back ? 'ok' : mode === 'repair' ? 'repair' : 'writeoff';
  const fin = (p: Promise<boolean>) => p.then((ok: boolean) => { if (ok && onDone) onDone(); });
  const go = () => mode === 'gone' ? fin(doIt({ t: 'assetGone', ...same(list[0]), why, date }, 'Διαγράφηκε από το μητρώο: ' + nm, undefined, onClose))
    : bulk ? fin(doIt({ t: 'assetBulk', items: list.map(same), op: { k: 'state', state: st, why }, date }, nm + ': ' + (mode === 'repair' ? 'προς επισκευή' : 'προς διαγραφή'), undefined, onClose))
    : fin(doIt({ t: 'assetState', ...same(list[0]), state: st, why, date }, nm + ': ' + (back ? 'λειτουργικό' : mode === 'repair' ? 'προς επισκευή' : 'προς διαγραφή'), undefined, onClose));
  return html`<${Dialog} title=${title} onClose=${onClose} footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${go}>Αποθήκευση<//>`}>
    <div className="stack"><div className="field"><label className="field__label" htmlFor="as-d">Ημερομηνία</label><${DateField} id="as-d" value=${date} onChange=${(e: any) => setDate(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="as-w">${back ? 'Σημείωση (προαιρετικά)' : 'Λόγος (προαιρετικά)'}</label><input id="as-w" className="ui-input" value=${why} onChange=${(e: any) => setWhy(e.target.value)} placeholder=${mode === 'repair' ? 'π.χ. σκανδάλη' : 'π.χ. φθορά, καταστροφή'} data-autofocus=""/></div>
      ${mode === 'gone' && html`<p className="note" style=${{ margin: 0 }}>Το είδος φεύγει από τον πίνακα και από το Excel. Το ιστορικό του μένει και αναιρείται με Ctrl+Z.</p>`}</div><//>`;
}
export const KINDS: [string, string][] = [['soldier', 'Οπλίτης'], ['cadre', 'Στέλεχος'], ['unit', 'Άλλη μονάδα'], ['ext', 'Φυσικό πρόσωπο'], ['none', 'Κανείς (αχρέωτο)']];
export function AssignDialog({ row, rows, onClose, onDone }: P) {
  const { state, today } = useStore(); const doIt = useDo(); const list = listOf(row, rows); const bulk = list.length > 1; const r0: AssetRow = list[0]; const nm = plural(list);
  const weapon = list.every(r => r.cat?.kind === 'weapon');
  const [kind, setKind] = useState('soldier'); const [who, setWho] = useState<{ h: AssetHolder; label: string } | null>(null); const [name, setName] = useState(''); const [date, setDate] = useState(today);
  const people = useMemo(() => (kind === 'cadre' ? pickPeople(state).filter(p => p.cid) : state.people.filter(p => p.active)), [kind, state.people, state.cadreList]);
  const holder: AssetHolder | null | undefined = kind === 'none' ? null : kind === 'unit' || kind === 'ext' ? (name.trim() ? { k: kind, name: name.trim() } : undefined) : who?.h;
  const primary = who && weapon && !bulk && !(r0.link && holder && holder.k === r0.link.k && JSON.stringify(holder) === JSON.stringify(r0.link)) ? hasPrimaryWeapon(state, who.h) : false;
  const note = holder === undefined ? '' : bulk ? (holder && weapon ? 'Όσα όπλα δεν είναι ήδη κύρια όπλα άλλου θα γραφτούν ως δεύτερα όπλα του· αν δεν έχει όπλο, το πρώτο γίνεται και κύριο όπλο στο Δυναμολόγιο. Μία αναίρεση τα γυρίζει όλα.' : 'Μία αναίρεση τα γυρίζει όλα.')
    : r0.link && holder !== null && holder && JSON.stringify(holder) === JSON.stringify(r0.link) ? 'Ήδη χρεωμένο σε αυτόν από το Δυναμολόγιο.'
    : r0.link ? 'Το όπλο είναι το κύριο όπλο του ' + holderText(state, r0.link) + ': θα σβηστεί από εκεί (καρτέλα › Όπλα) και θα πάει στον νέο κάτοχο.'
    : who && weapon ? (primary ? 'Έχει ήδη κύριο όπλο: αυτό θα μπει ως δεύτερο όπλο, στο μητρώο.' : 'Δεν έχει όπλο: θα γραφτεί και ως κύριο όπλο του στο Δυναμολόγιο (Οπλισμός › Όπλα).') : '';
  const warn = !bulk && holder && r0.link ? (holder.k === 'person' || holder.k === 'cadre') && hasPrimaryWeapon(state, holder) ? 'έχει ήδη άλλο κύριο όπλο' : undefined : undefined;
  const msg = holder ? 'χρεώθηκε σε ' + holderText(state, holder) : 'αχρέωτο';
  const go = () => doIt(bulk ? { t: 'assetBulk', items: list.map(same), op: { k: 'holder', holder }, date } : { t: 'assetHolder', ...same(r0), holder, date }, nm + ': ' + msg, warn, onClose).then((ok: boolean) => { if (ok && onDone) onDone(); });
  return html`<${Dialog} title=${'Χρέωσε σε… · ' + nm} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${holder === undefined} onClick=${go}>Αποθήκευση<//>`}>
    <div className="stack">
      <div className="field"><label className="field__label" htmlFor="ag-k">Σε ποιον</label><${Select} id="ag-k" className="ui-input" value=${kind} onChange=${(e: any) => { setKind(e.target.value); setWho(null); }}>${KINDS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}<//></div>
      ${(kind === 'soldier' || kind === 'cadre') && html`<div className="field"><label className="field__label" htmlFor="ag-p">${kind === 'soldier' ? 'Οπλίτης' : 'Στέλεχος'}</label>
        <${PersonPicker} key=${kind} id="ag-p" people=${people} placeholder=${kind === 'soldier' ? 'Επώνυμο, όνομα ή ΑΣΜ…' : 'Επώνυμο του στελέχους…'} onChange=${(id: number) => { const p = people.find((x: any) => x.id === id); if (p) setWho({ h: p.cid ? { k: 'cadre', cid: p.cid } : { k: 'person', pid: p.id }, label: (p.rank || '') + ' ' + p.last + ' ' + p.first }); }}/>
        ${who && html`<div style=${{ marginTop: '6px' }}>Διάλεξες: <b>${who.label}</b></div>`}</div>`}
      ${(kind === 'unit' || kind === 'ext') && html`<div className="field"><label className="field__label" htmlFor="ag-n">${kind === 'unit' ? 'Όνομα μονάδας' : 'Όνομα'}</label><input id="ag-n" className="ui-input" value=${name} onChange=${(e: any) => setName(e.target.value)} placeholder=${kind === 'unit' ? 'π.χ. 50 ΕΜΑ' : ''} data-autofocus=""/></div>`}
      <div className="field"><label className="field__label" htmlFor="ag-d">Ημερομηνία</label><${DateField} id="ag-d" value=${date} onChange=${(e: any) => setDate(e.target.value)}/></div>
      ${note && html`<p className="note" style=${{ margin: 0 }}>${note}</p>`}</div><//>`;
}

// ---------- Νέο / Αλλαγή: φόρμα σε ενότητες ----------
export const NEWT = '\u0001new';
export function Sec({ t, children }: P) { return html`<section className="op__sec"><h4 className="op__sech">${t}</h4>${children}</section>`; }
export function Stepper({ v, on, label }: { v: number; on: (n: number) => void; label: string }) {
  return html`<span className="op__step" role="group" aria-label=${'Ποσότητα: ' + label}><button type="button" aria-label="Λιγότερα" disabled=${v <= 1} onClick=${() => on(v - 1)}>−</button><output>${v}</output><button type="button" aria-label="Περισσότερα" disabled=${v >= 999} onClick=${() => on(v + 1)}>+</button></span>`;
}
// Τύπος από τη λίστα της κατηγορίας, με «+ Νέος τύπος…» που γράφεται με το χέρι (και μπαίνει στη λίστα με addType)
export function TypeField({ id, label, types, value, onChange, newT, setNewT, ph, newLabel }: { id: string; label: string; types: string[]; value: string; onChange: (v: string) => void; newT: boolean; setNewT: (b: boolean) => void; ph: string; newLabel: string }) {
  const known = !value || types.some(t => normGreek(t) === normGreek(value));
  return html`<div className="field"><label className="field__label" htmlFor=${id}>${label}</label>
    ${newT ? html`<div className="op__newt"><input id=${id} className="ui-input" aria-label="Νέος τύπος" value=${value} placeholder=${ph} autoFocus onChange=${(e: any) => onChange(e.target.value)}/><${Button} size="sm" variant="ghost" onClick=${() => { setNewT(false); onChange(''); }}>Από τη λίστα<//></div><span className="field__help">Θα μπει και στη λίστα τύπων της κατηγορίας.</span>`
    : html`<${Select} id=${id} className="ui-input" value=${value} onChange=${(e: any) => { const v = e.target.value; if (v === NEWT) { setNewT(true); onChange(''); } else onChange(v); }}>
      <option value="">—</option>${!known && html`<option value=${value}>${value}</option>`}${types.map(t => html`<option key=${t} value=${t}>${t}</option>`)}<option value=${NEWT} data-keep>${newLabel}</option><//>`}</div>`;
}
// Παρελκόμενα ως checkboxes με ποσότητα, από τη λίστα της κατηγορίας (και ό,τι έχει ήδη το είδος), με «+ Άλλο παρελκόμενο…»
export function AccPicker({ cat, value, onChange }: { cat?: AssetCat; value: { name: string; qty: number }[]; onChange: (l: { name: string; qty: number }[]) => void }) {
  const [addAcc, setAddAcc] = useState<string | null>(null);
  const setAcc = (name: string, qty: number | null) => onChange(qty == null ? value.filter(y => normGreek(y.name) !== normGreek(name)) : value.some(y => normGreek(y.name) === normGreek(name)) ? value.map(y => (normGreek(y.name) === normGreek(name) ? { ...y, qty } : y)) : [...value, { name, qty }]);
  const accOpts = useMemo(() => { const l = (cat?.accs || []).map(x => ({ name: x.name, def: Math.max(1, x.qty || 1) })); for (const x of value) if (!l.some(y => normGreek(y.name) === normGreek(x.name))) l.push({ name: x.name, def: 1 }); return l; }, [cat, value]);
  return html`<div className="op__accg">${accOpts.map(o => { const on = value.find(y => normGreek(y.name) === normGreek(o.name));
      return html`<div key=${o.name} className="op__acc"><label className="check"><input type="checkbox" checked=${!!on} onChange=${(e: any) => setAcc(o.name, e.target.checked ? o.def : null)}/><span>${o.name}</span></label>${on && html`<${Stepper} v=${on.qty} label=${o.name} on=${(n: number) => setAcc(o.name, n)}/>`}</div>`; })}
      ${addAcc === null ? html`<${Button} size="sm" variant="outline" className="op__addacc" onClick=${() => setAddAcc('')}>+ Άλλο παρελκόμενο…<//>`
        : html`<div className="op__newt"><input className="ui-input" aria-label="Νέο παρελκόμενο" value=${addAcc} placeholder="π.χ. Σκόπευτρο" autoFocus onChange=${(e: any) => setAddAcc(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); if (addAcc.trim()) setAcc(addAcc.trim(), 1); setAddAcc(null); } }}/><${Button} size="sm" disabled=${!addAcc.trim()} onClick=${() => { setAcc(addAcc.trim(), 1); setAddAcc(null); }}>Πρόσθεσε<//><${Button} size="sm" variant="ghost" onClick=${() => setAddAcc(null)}>Άκυρο<//></div>`}</div>`;
}
function AssetEditDialog({ row, all, cfg, defCat, mode, onClose, onSaved }: P) {
  const { state, today } = useStore(); const doIt = useDo(); const isNew = !row;
  const a0: Asset | undefined = row?.a; const linked = !!row?.link;
  const kind: string = a0 ? (catOf(cfg, a0.cat)?.kind || 'weapon') : mode;   // νέο: από την καρτέλα που είσαι· αλλαγή: από την κατηγορία του
  const own = (c: AssetCat) => c.kind === kind || c.id === a0?.cat;
  const first = defCat && cfg.cats.find((c: AssetCat) => c.id === defCat && own(c)) ? defCat : cfg.cats.find((c: AssetCat) => c.kind === kind)?.id || '';
  const [f, setF] = useState(() => ({ cat: a0?.cat || first, type: a0?.type || '', no: a0?.no || '', qty: String(a0?.qty || ''), place: a0?.place || '', rack: a0?.rack || '', wpos: a0?.wpos || '', fileWord: a0?.fileWord || '', warOnly: !!a0?.warOnly,
    every: String(a0?.maint?.every || ''), last: a0?.maint?.last || '', next: a0?.maint?.next || '', accs: a0 ? accsOf(a0) : [] as { name: string; qty: number }[], note: a0?.note || '', extra: { ...(a0?.extra || {}) } as Record<string, string> }));
  const [newT, setNewT] = useState(false); const [accTouched, setAccTouched] = useState(false);
  const dirty = useDirty({ f, newT });
  const cat: AssetCat | undefined = cfg.cats.find((c: AssetCat) => c.id === f.cat); const weapon = (cat?.kind || kind) === 'weapon';
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const dups = f.no.trim() ? sameNo(all, { key: row?.key || '', a: { ...(a0 || {}), cat: f.cat } as Asset }, f.no) : [];
  const types: string[] = cat?.types || [];
  const canSave = !!f.cat && (weapon ? !!f.no.trim() : !!f.no.trim() || !!f.type.trim());
  const save = () => {
    const every = Math.floor(Number(f.every)); const maint = { ...(a0?.maint || {}), last: f.last || undefined, next: f.next || undefined, every: every > 0 ? every : undefined };
    // τα παρελκόμενα γράφονται ως λίστα και το κείμενο acc (που βγάζει το Excel) ακολουθεί· αν δεν τα άγγιξες, μένουν όπως ήταν
    const acc = accTouched ? { accs: f.accs, acc: accsToText(f.accs) } : {};
    const asset: any = { ...(a0 || {}), id: row?.stored ? row.key : undefined, cat: f.cat, type: f.type, no: f.no, qty: Math.floor(Number(f.qty)) || undefined, place: f.place, rack: f.rack, wpos: f.wpos, fileWord: f.fileWord, warOnly: f.warOnly, maint, ...acc, note: f.note, extra: f.extra, state: a0?.state || 'ok', holder: a0?.holder };
    if (!asset.id) delete asset.id;
    return doIt({ t: 'saveAsset', asset, date: today, addType: newT && !!f.type.trim(), syncPrimary: true }, (isNew ? 'Νέο: ' : 'Αλλαγή: ') + [f.type, f.no].filter(Boolean).join(' '), dups.length ? 'ο ίδιος αριθμός υπάρχει και σε ' + dups.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ') + '.' : undefined, () => { onClose(); }).then((ok: boolean) => { if (ok && !isNew && row) onSaved(row.key); });
  };
  const fld = (id: string, label: string, k: string, o: P = {}) => html`<div className="field" style=${o.style}><label className="field__label" htmlFor=${'ae-' + id}>${label}</label><input id=${'ae-' + id} className="ui-input" value=${f[k as keyof typeof f] as string} disabled=${!!o.disabled} placeholder=${o.ph || ''} data-autofocus=${o.focus ? '' : undefined} onChange=${(e: any) => set(k, e.target.value)}/></div>`;
  return html`<${Dialog} title=${isNew ? (weapon ? 'Νέο όπλο' : 'Νέο υλικό') : 'Αλλαγή · ' + nameOf(a0!)} onClose=${onClose} size="lg" dirty=${dirty}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//>${!isNew && row.stored && html`<${Button} variant="ghost" onClick=${async () => { if (await doIt({ t: 'deleteAsset', id: row.key }, 'Σβήστηκε η εγγραφή ' + a0!.no, undefined, onClose)) onSaved(''); }} data-tip="Σβήνει την εγγραφή και το ιστορικό της (αναιρείται με Ctrl+Z). Για κύριο όπλο ατόμου ξαναφαίνεται από το Δυναμολόγιο.">Σβήσε την εγγραφή<//>`}<${Button} disabled=${!canSave} onClick=${save}>Αποθήκευση<//>`}>
    <div className="op__form" data-asset-form="">
      ${linked && html`<p className="note" style=${{ margin: 0 }}>Κύριο όπλο από το Δυναμολόγιο: ο αριθμός αλλάζει από την καρτέλα «Όπλα ανά άτομο»· ο τύπος και η θέση οπλοβαστού αλλάζουν και από εδώ και ακολουθούν στο Δυναμολόγιο.</p>`}
      <${Sec} t="Βασικά">
        <div className="field-row">
          <div className="field"><label className="field__label" htmlFor="ae-cat">Κατηγορία</label><${Select} id="ae-cat" className="ui-input" value=${f.cat} onChange=${(e: any) => { set('cat', e.target.value); setNewT(false); }}>${cfg.cats.filter(own).map((c: AssetCat) => html`<option key=${c.id} value=${c.id}>${c.name}</option>`)}<//></div>
          <${TypeField} id="ae-type" label=${weapon ? 'Τύπος' : 'Είδος'} types=${types} value=${f.type} onChange=${(v: string) => set('type', v)} newT=${newT} setNewT=${setNewT} ph=${weapon ? 'π.χ. G3A3' : 'π.χ. Διόπτρα νυκτός'} newLabel=${'+ Νέος ' + (weapon ? 'τύπος' : 'είδος') + '…'}/>
          ${fld('no', weapon ? 'Αριθμός όπλου *' : 'Σειριακός', 'no', { disabled: linked, ph: weapon ? 'αριθμός όπλου' : 'αν έχει', focus: true })}
          ${!weapon && fld('qty', 'Ποσότητα', 'qty', { ph: '1', style: { maxWidth: '100px' } })}</div>
        ${dups.length > 0 && html`<${Alert} tone="warn">Ο αριθμός υπάρχει ήδη στο μητρώο (${dups.map((x: AssetRow) => holderText(state, x.a.holder)).join(', ')}). Μπορείς να συνεχίσεις.<//>`}
        ${(cat?.fields || []).length > 0 && html`<div className="field-row">${cat!.fields.map(x => html`<div className="field" key=${x.id}><label className="field__label" htmlFor=${'ae-x-' + x.id}>${x.name}</label><input id=${'ae-x-' + x.id} className="ui-input" value=${f.extra[x.id] || ''} onChange=${(e: any) => setF(y => ({ ...y, extra: { ...y.extra, [x.id]: e.target.value } }))}/></div>`)}</div>`}
      <//>
      <${Sec} t="Θέση">
        <div className="field-row">${weapon && fld('rack', 'Οπλοβαστός', 'rack', { ph: 'Ε', style: { maxWidth: '120px' } })}${weapon && fld('wpos', 'Θέση οπλοβαστού', 'wpos', { ph: '23', style: { maxWidth: '140px' } })}
          ${fld('place', 'Θέση (κιβώτιο, αποθήκη…)', 'place', { ph: 'π.χ. ΚΙΒΩΤΙΟ 53' })}${fld('fileWord', 'Λέξη θέσης στο αρχείο μονάδας', 'fileWord', { ph: 'π.χ. Α.Ο' })}</div>
      <//>
      <${Sec} t="Συντήρηση">
        <div className="field-row">${fld('every', 'Κάθε (μήνες)', 'every', { ph: cat?.every ? cat.every + ' (της κατηγορίας)' : '', style: { maxWidth: '170px' } })}
          <div className="field"><label className="field__label" htmlFor="ae-last">Τελευταία</label><${DateField} id="ae-last" clearable value=${f.last} onChange=${(e: any) => set('last', e.target.value)}/></div>
          <div className="field"><label className="field__label" htmlFor="ae-next">Επόμενη</label><${DateField} id="ae-next" clearable value=${f.next} onChange=${(e: any) => set('next', e.target.value)}/></div>
          <label className="check op__war"><input type="checkbox" checked=${f.warOnly} onChange=${(e: any) => set('warOnly', e.target.checked)}/><span>Μόνο εμπόλεμη περίοδο</span></label></div>
      <//>
      <${Sec} t="Παρελκόμενα">
        <${AccPicker} cat=${cat} value=${f.accs} onChange=${(l: { name: string; qty: number }[]) => { setAccTouched(true); set('accs', l); }}/>
      <//>
      <${Sec} t="Παρατηρήσεις">${fld('note', 'Παρατηρήσεις', 'note')}<//>
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
  const nw = groups.reduce((a, g) => a + g[1].filter(r => r.cat?.kind !== 'material').length, 0);   // τα όπλα στο Μητρώο όπλων, μόνο υλικό στο Υλικό
  return html`<dt>Χρεωμένα</dt><dd data-held="">${groups.map(([name, l]) => html`<div key=${name}><span className="muted">${name}:</span> ${l.map((r, i) => html`${i ? ', ' : ''}<b>${[r.a.type, r.a.no].filter(Boolean).join(' ')}</b>${(r.a.qty || 0) > 1 ? ' ×' + r.a.qty : ''}`)}</div>`)}
    ${vehs.length > 0 && html`<div data-held-veh=""><span className="muted">Οχήματα:</span> ${vehs.map((v: any, i: number) => html`${i ? ', ' : ''}<b>${[v.r.a.type, v.r.a.plate || v.r.a.no].filter(Boolean).join(' ')}</b>${v.drv ? html` <small className="muted">(οδηγός)</small>` : ''}`)}</div>`}
    ${n > 0 && html`<button type="button" className="linkish" onClick=${() => nav.go('weapons', { wtab: nw > 0 ? 'mitroo' : 'yliko', aq: who ? who.last : '' })} data-tip=${nw > 0 ? 'Δες τα στο Μητρώο όπλων' : 'Δες τα στο Υλικό'}>${nw > 0 ? 'Στο Μητρώο' : 'Στο Υλικό'} (${nw > 0 ? nw : n})</button>`}
    ${nw > 0 && n > nw && html` <button type="button" className="linkish" onClick=${() => nav.go('weapons', { wtab: 'yliko', aq: who ? who.last : '' })} data-tip="Δες το υλικό στην καρτέλα Υλικό">Στο Υλικό (${n - nw})</button>`}
    ${vehs.length > 0 && html`${n > 0 ? ' ' : ''}<button type="button" className="linkish" onClick=${() => nav.go('vehicles', { vsel: vehs[0].r.key })} data-tip="Δες τα στην οθόνη Οχήματα">Στα Οχήματα (${vehs.length})</button>`}</dd>`;
}
