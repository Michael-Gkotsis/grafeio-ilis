// features/cadre · «Πρόγραμμα αδειών» (Michael, 17/11, πρόταση λοχία): στελέχη × μέρες του μήνα με την κατάσταση κάθε μέρας· σύρε σε μια γραμμή για
// να βάλεις Κανονική, ΑΜΔ, Απαλλαγή, άλλη κατάσταση, «Δεν θέλει υπηρεσία» ή να σβήσεις. Οι καταστάσεις γράφονται ως συνηθισμένες καταστάσεις
// στελεχών (ΗΚΑΙ, ΣΤΕΛΕΧΗ.xlsx όπως όταν μπαίνουν από την καρτέλα). Το πλέγμα είναι το κοινό MonthGrid· η λογική στο shared/cadrePlan.ts.
import { useMemo, useRef, useState } from 'react';
import { html, Alert, Button, Dialog, Strip, useToast } from '../ui';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { MonthGrid, type GridRow, type GridSel } from '../monthGrid';
import { cadreAbsKinds, rankTxt } from '../../shared/ranks';
import { cadreClash, cadreStatusOf } from '../../shared/cadre';
import { apalLeft, leaveCfgOf, leaveOverdraft, usesQuota } from '../../shared/cadreBalance';
import { leaveLeftText, monthIndex, monthLabel, planCode, planFilters, planRows, rangeTxt, shiftMonth, type PlanFam } from '../../shared/cadrePlan';
import { dm, daysBetween, type ISODate } from '../../shared/dates';
import { HK } from '../../shared/unit';
import type { AppState, Cadre } from '../../shared/domain';

const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const FAM_NAME: Record<PlanFam, string> = { ka: 'Κανονική άδεια', amd: 'Άδεια μικρής διάρκειας', leave: 'Άλλη άδεια με υπόλοιπο', apal: 'Απαλλαγή', other: 'Άλλη κατάσταση' };

// απαλλαγή που πάει το υπόλοιπο κάτω από 0 (όπως στο παράθυρο «Κατάσταση»): το υπόλοιπο που θα μείνει, αλλιώς null
function apalAfter(s: AppState, c: Cadre, from: ISODate, to: ISODate, today: ISODate): number | null {
  const rest = s.cadreAbs.filter(a => !(a.cid === c.id && a.from <= to && from <= a.to));
  const left = apalLeft({ ...s, cadreAbs: [...rest, { id: '', cid: c.id, kind: 'apal', from, to }] }, c, +to.slice(0, 4), today);
  return left < 0 ? left : null;
}

type Pick = { c: Cadre; from: ISODate; to: ISODate };
type Op = { t: 'state'; kind: string } | { t: 'noduty' } | { t: 'clear' };

// Το μενού της επιλογής: τα είδη άδειας (όσες καταστάσεις καταναλώνουν υπόλοιπο), Απαλλαγή, Άλλη κατάσταση…, Δεν θέλει υπηρεσία, Σβήσε
function PlanMenu({ pick, empty, go }: { pick: Pick; empty: boolean; go: (op: Op) => void }) {
  const { state, today } = useStore(); const lists = state.settings.lists; const { c, from, to } = pick;
  const [other, setOther] = useState(false); const [kind, setKind] = useState('');
  const cfg = leaveCfgOf(state.settings);
  const kinds = cadreAbsKinds(lists);
  const leave = kinds.filter(k => k[0] !== 'apal' && cfg.quotas.some(q => usesQuota(q, k[0], lists)));
  const rest = kinds.filter(k => k[0] !== 'apal' && !leave.includes(k));
  const warn = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of leave) { const o = leaveOverdraft(state, c.id, { kind: k[0], from, to }); if (o.length) m.set(k[0], o.map(x => x.name + ' ' + x.year + ': θα μείνει ' + num(x.left) + ' μέρες').join(' · ')); }
    const a = apalAfter(state, c, from, to, today); if (a != null) m.set('apal', 'Δεν έχει αρκετές απαλλαγές: θα μείνουν ' + num(a));
    return m;
  }, [state.cadreAbs, state.cadreGrants, state.guards, state.dutyLog, state.settings, c.id, from, to]);
  const n = daysBetween(from, to);
  const item = (k: string, label: string, fam: PlanFam) => html`<button type="button" role="menuitem" key=${k} className="mg-menu__it" data-tip=${warn.get(k) ? '⚠ ' + warn.get(k) + ' (αποθηκεύεται κανονικά)' : undefined} data-tip-side="right" onClick=${() => { go({ t: 'state', kind: k }); }}>
    <i className=${'mg-sw mg-' + fam}></i><span>${label}</span>${warn.has(k) && html`<b className="mg-menu__warn" aria-label="Προειδοποίηση">⚠</b>`}</button>`;
  return html`<div className="mg-menu__head"><b>${rankTxt(c)} ${c.last}</b><span>${rangeTxt({ from, to })} · ${n} ${n === 1 ? 'μέρα' : 'μέρες'}</span></div>
    ${!other ? html`<div className="mg-menu__list">
      ${leave.map(k => item(k[0], k[1], planCode(k[0], state.settings).fam))}
      ${item('apal', 'Απαλλαγή', 'apal')}
      <button type="button" role="menuitem" className="mg-menu__it" onClick=${() => setOther(true)}><i className="mg-sw mg-other"></i><span>Άλλη κατάσταση…</span></button>
      <div className="mg-menu__sep"></div>
      <button type="button" role="menuitem" className="mg-menu__it" onClick=${() => go({ t: 'noduty' })}><i className="mg-sw mg-no">✕</i><span>Δεν θέλει υπηρεσία</span></button>
      <button type="button" role="menuitem" className="mg-menu__it" disabled=${empty} data-tip=${empty ? 'Δεν υπάρχει κάτι να σβηστεί σε αυτές τις μέρες' : undefined} onClick=${() => go({ t: 'clear' })}><i className="mg-sw mg-clr">⌫</i><span>Σβήσε</span></button></div>`
    : html`<div className="mg-menu__other"><label className="field__label" htmlFor="mg-k">Κατάσταση (στήλη της ${HK()})</label>
      <${Select} id="mg-k" className="ui-input" value=${kind} onChange=${(e: any) => setKind(e.target.value)}><option value="">Διάλεξε…</option>${rest.map(k => html`<option key=${k[0]} value=${k[0]}>${k[1]}</option>`)}<//>
      <div className="mg-menu__acts"><${Button} size="sm" variant="ghost" onClick=${() => setOther(false)}>Πίσω<//><${Button} size="sm" disabled=${!kind} why="Διάλεξε κατάσταση" onClick=${() => go({ t: 'state', kind })}>Βάλε<//></div></div>`}`;
}

export function CadrePlanView({ onOpen }: { onOpen: (id: string, ids: string[]) => void }) {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const lists = state.settings.lists;
  const ym: string = /^\d{4}-\d{2}$/.test(nav.params.cmonth || '') ? nav.params.cmonth : today.slice(0, 7);
  const filter: string = nav.params.cpf || 'all';
  const year = +ym.slice(0, 4);
  const index = useMemo(() => monthIndex(state, ym), [state.cadreAbs, state.cadreNoDuty, state.settings, ym]);
  const filters = useMemo(() => planFilters(), []);
  const all = useMemo(() => planRows(state, index, 'all', filters), [state.cadreList, state.settings, index, filters]);
  const counts = useMemo(() => Object.fromEntries(filters.map(f => [f.id, planRows(state, index, f.id, filters).length])), [state.cadreList, state.settings, index, filters]);
  const people = useMemo(() => planRows(state, index, filter, filters), [state.cadreList, state.settings, index, filter, filters]);
  const [xl, setXl] = useState<'' | 'xl' | 'print'>('');
  const [ask, setAsk] = useState<{ pick: Pick; kind: string } | null>(null);
  // γραμμές του πλέγματος: το ίδιο αντικείμενο όσο δεν αλλάζει τίποτα στη γραμμή, ώστε το memo να μη ξαναζωγραφίζει τις υπόλοιπες
  const cache = useRef(new Map<string, { sig: string; row: GridRow }>());
  const ids = useMemo(() => people.map(c => c.id), [people]);
  const rows: GridRow[] = useMemo(() => {
    const old = cache.current; const next = new Map<string, { sig: string; row: GridRow }>();
    const out = people.map(c => {
      const cs = index.cells.get(c.id), nd = index.noDuty.get(c.id); const lv = leaveLeftText(state, c.id, year);
      const sig = [rankTxt(c), c.spec, c.last, c.first, lv.text, lv.neg, lv.tip, year, index.days.map((_, i) => (cs?.[i] ? cs[i]!.id + cs[i]!.kind + cs[i]!.code : '') + (nd?.[i] ? '!' + nd[i]!.id : '')).join('|')].join('~');
      const hit = old.get(c.id); if (hit && hit.sig === sig) { next.set(c.id, hit); return hit.row; }
      const row: GridRow = {
        id: c.id,
        head: html`<button type="button" className="mg-who" onClick=${() => onOpen(c.id, ids)} data-tip=${rankTxt(c) + ' ' + c.last + ' ' + c.first + (c.role ? ' · ' + c.role : '')} data-tip-side="right"><b>${rankTxt(c)}</b>${c.spec ? ' (' + c.spec + ')' : ''} ${c.last} ${c.first}</button>`,
        cells: index.days.map((_, i) => {
          const v = cs?.[i], no = nd?.[i];
          if (!v && !no) return {};
          const tip = [v && (v.name + ' · ' + rangeTxt(v) + (v.note ? ' · ' + v.note : '')), no && 'Δεν θέλει υπηρεσία · ' + rangeTxt(no) + (no.note ? ' · ' + no.note : '')].filter(Boolean).join('\n');
          return { text: v?.code, cls: v ? 'mg-' + v.fam : undefined, tip, mark: !!no };
        }),
        tail: html`<span className=${lv.neg ? 'mg-neg' : undefined} data-tip=${lv.tip || undefined} data-tip-side="left">${lv.text}</span>`
      };
      next.set(c.id, { sig, row }); return row;
    });
    cache.current = next; return out;
  }, [people, index, state.cadreGrants, state.cadreAbs, state.settings, year, ids]);
  const go = (d: number) => nav.set({ cmonth: shiftMonth(ym, d) === today.slice(0, 7) ? undefined : shiftMonth(ym, d) });
  const setFilter = (f: string) => nav.set({ cpf: f === 'all' ? undefined : f });

  // εγγραφή του διαστήματος: κατάσταση (ως CadreAbs, με replace αν πέφτει πάνω σε άλλη), «Δεν θέλει υπηρεσία», ή σβήσιμο
  const write = async (p: Pick, op: Op, replace = false) => {
    const who = rankTxt(p.c) + ' ' + p.c.last, when = rangeTxt(p);
    if (op.t === 'state') {
      const over = leaveOverdraft(state, p.c.id, { kind: op.kind, from: p.from, to: p.to });
      const a = planCode(op.kind, state.settings).fam === 'apal' ? apalAfter(state, p.c, p.from, p.to, today) : null;
      if (!(await run({ t: 'addCadreAbs', abs: { cid: p.c.id, kind: op.kind, from: p.from, to: p.to }, replace }, false))) return;
      const st = cadreStatusOf({ id: '', cid: p.c.id, kind: op.kind, from: p.from, to: p.to }, lists);
      toast({ text: html`<span>${who}: ${st.label.toLowerCase()} ${when}${over.map(o => html` · ⚠ ${o.name} ${o.year}: θα μείνει ${num(o.left)} μέρες`)}${a != null && html` · ⚠ Δεν έχει αρκετές απαλλαγές: θα μείνουν ${num(a)}`}</span>`, actions: [undoMark()] });
    } else if (op.t === 'noduty') {
      if (await run({ t: 'setCadreNoDuty', cid: p.c.id, from: p.from, to: p.to }, false)) toast({ text: who + ': δεν θέλει υπηρεσία ' + when, actions: [undoMark()] });
    } else if (await run({ t: 'clearCadrePlan', cid: p.c.id, from: p.from, to: p.to }, false)) toast({ text: who + ': σβήστηκαν οι καταστάσεις ' + when, actions: [undoMark()] });
  };
  const choose = (p: Pick, op: Op, close: () => void) => {
    if (op.t === 'state' && cadreClash(state, { cid: p.c.id, from: p.from, to: p.to }).length) { close(); setAsk({ pick: p, kind: op.kind }); return; }
    close(); write(p, op);
  };
  const exportXl = async (print: boolean) => {
    setXl(print ? 'print' : 'xl');
    try {
      const r = await window.api.exportCadrePlan(ym, print, filter);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': πρόγραμμα αδειών ' + monthLabel(ym).toLowerCase() + '.' });
    } finally { setXl(''); }
  };
  const menu = (sel: GridSel, close: () => void) => {
    const c = people.find(x => x.id === sel.row); if (!c) return null;
    const from = index.days[sel.from].d, to = index.days[sel.to].d;
    const cs = index.cells.get(c.id), nd = index.noDuty.get(c.id);
    let empty = true; for (let i = sel.from; i <= sel.to; i++) if (cs?.[i] || nd?.[i]) { empty = false; break; }
    return html`<${PlanMenu} key=${c.id + from + to} pick=${{ c, from, to }} empty=${empty} go=${(op: Op) => choose({ c, from, to }, op, close)}/>`;
  };
  const clash = ask ? cadreClash(state, { cid: ask.pick.c.id, from: ask.pick.from, to: ask.pick.to }) : [];
  const askOver = ask ? leaveOverdraft(state, ask.pick.c.id, { kind: ask.kind, from: ask.pick.from, to: ask.pick.to }) : [];
  const legend: { cls: string; label: string }[] = [{ cls: 'mg-ka', label: FAM_NAME.ka }, { cls: 'mg-amd', label: FAM_NAME.amd }, { cls: 'mg-leave', label: FAM_NAME.leave }, { cls: 'mg-apal', label: FAM_NAME.apal }, { cls: 'mg-other', label: FAM_NAME.other }];
  return html`<div className="plan" data-cadre-plan="">
    <div className="plan__bar">
      <div className="plan__month"><${Button} variant="outline" size="icon" aria-label="Προηγούμενος μήνας" onClick=${() => go(-1)}>‹<//><b>${monthLabel(ym)}</b><${Button} variant="outline" size="icon" aria-label="Επόμενος μήνας" onClick=${() => go(1)}>›<//>
        ${ym !== today.slice(0, 7) && html`<${Button} variant="ghost" size="sm" onClick=${() => nav.set({ cmonth: undefined })}>Σήμερα<//>`}</div>
      <${Strip} role="group" aria-label="Φίλτρα γραμμών">${filters.map(f => html`<button key=${f.id} type="button" className="ui-chip" aria-pressed=${filter === f.id || (f.id === 'all' && !filters.some(x => x.id === filter))} onClick=${() => setFilter(f.id)}>${f.label}<span className="cnt">${counts[f.id] || 0}</span></button>`)}<//>
      <span style=${{ flex: 1 }}></span>
      <${Button} variant="outline" disabled=${!!xl || !people.length} why=${!people.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${() => exportXl(false)} data-tip="Νέο Excel: το πρόγραμμα αυτού του μήνα (όπως το βλέπεις)">${xl === 'xl' ? 'Δημιουργία…' : 'Βγάλε Excel'}<//>
      <${Button} variant="outline" disabled=${!!xl || !people.length} why=${!people.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${() => exportXl(true)} data-tip="Άνοιγμα της εκτύπωσης (A4 οριζόντια, μία σελίδα φάρδος)">${xl === 'print' ? 'Άνοιγμα…' : 'Εκτύπωση'}<//>
    </div>
    ${!all.length ? html`<div className="ui-card empty">Δεν υπάρχουν ενεργά στελέχη. Πέρασέ τα από τη «Λίστα».</div>`
      : !people.length ? html`<div className="ui-card empty">Κανείς δεν ταιριάζει στο φίλτρο. <${Button} variant="link" onClick=${() => setFilter('all')}>Δες όλους<//></div>`
      : html`<${MonthGrid} days=${index.days} rows=${rows} headLabel="Στελέχη" tailLabel=${'Μένουν ' + year} label=${'Πρόγραμμα αδειών ' + monthLabel(ym)} menu=${menu}/>`}
    <div className="mg-legend" aria-label="Υπόμνημα">${legend.map(l => html`<span key=${l.cls}><i className=${'mg-sw ' + l.cls}></i>${l.label}</span>`)}
      <span><i className="mg-sw mg-no">✕</i>Δεν θέλει υπηρεσία (μόνο για το πρόγραμμα, όχι στην ${HK()})</span>
      <span><i className="mg-sw mg-we"></i>ΣΚ</span><span><i className="mg-sw mg-hol"></i>Αργία</span></div>
    <p className="mg-hint">Σύρε πάνω στις μέρες ενός στελέχους (ή κλικ και Shift+κλικ) και διάλεξε τι είναι. Οι άδειες γράφονται ως κανονικές καταστάσεις στελεχών (${HK()}, ΣΤΕΛΕΧΗ.xlsx όπως όταν τις βάζεις από την καρτέλα) και κόβουν τις μέρες από το υπόλοιπο.</p>
    ${ask && html`<${Dialog} title=${'Έχει ήδη κατάσταση: ' + rankTxt(ask.pick.c) + ' ' + ask.pick.c.last} onClose=${() => setAsk(null)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setAsk(null)}>Άκυρο<//><${Button} onClick=${() => { const a = ask; setAsk(null); return write(a.pick, { t: 'state', kind: a.kind }, true); }}>Αποθήκευση στη θέση της<//>`}>
      <${Alert} tone="warn"><span>Έχει ήδη ${clash.map(a => cadreStatusOf(a, lists).label.toLowerCase() + ' ' + dm(a.from) + (a.to !== a.from ? '–' + dm(a.to) : '')).join(', ')}. Στην ${HK()} μετρά μία κατάσταση τη μέρα: η παλιά κόβεται στις ${rangeTxt(ask.pick)} και κρατά τις υπόλοιπες μέρες της.</span><//>
      ${askOver.map(o => html`<${Alert} key=${o.name + o.year} tone="warn"><span>⚠ ${o.name} ${o.year}: θα μείνει ${num(o.left)} μέρες (δεν φτάνουν). Αποθηκεύεται κανονικά.</span><//>`)}<//>`}
  </div>`;
}
