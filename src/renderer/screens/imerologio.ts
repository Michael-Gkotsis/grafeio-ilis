// Δυναμολόγιο › Ημερολόγιο κωλυομένων (Michael, 3/11): πλέγμα στρατιώτες × μέρες εκπαίδευσης με τον κωδικό της κατάστασης κάθε μέρας.
// Γεμίζει μόνο του (άδειες, ιατρικά, υπηρεσίες, πόστα)· πατάς ένα κελί για να το αλλάξεις με το χέρι (πορτοκαλί τελεία), μόνο στο ημερολόγιο.
import { useMemo, useState } from 'react';
import { html, cx, Button, Dialog, Icon, PageHeader, Segmented } from '../ui';
import { useNav, useStore } from '../store';
import { useToast } from '../ui';
import { SigsMenu } from '../common';
import type { Sig } from '../../shared/sigs';
import { addDays, dm, dow, type ISODate } from '../../shared/dates';
import { platoonsOf, platoonShort, type Person } from '../../shared/domain';
import { rankTxt } from '../../shared/ranks';
import { upper } from '../../shared/text';
import { IMER_ROWS, autoCell, IMER_TITLES, handChoices, handOf, imerCode, imerCount, imerGrid, imerRange, imerSheets, sumTotals, type Count, type ImerCell, type ImerPart, type ImerSettings, type ImerSheets, type ImerTitle } from '../../shared/imer';
type P = any;

// τόνος του κελιού: απών (κόκκινο), υπηρεσία/πόστο (πράσινο), ελεύθερος (κίτρινο)
const tone = (c: ImerCell) => (!c.code ? '' : c.count === 'A' ? 'abs' : c.key === 'DUTY' || c.key === 'POST' ? 'duty' : /^Ε\.[ΥΑ]$/.test(c.key) ? 'free' : '');
const dayHead = (d: ISODate) => html`<th key=${d} className="imer__d" scope="col"><span>${dow(d)}</span>${d.slice(8, 10)}</th>`;

export function ImerTab() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const [xl, setXl] = useState(false); const [codes, setCodes] = useState(false); const [pick, setPick] = useState<{ p: Person; d: ISODate } | null>(null);
  const all: boolean = !!nav.params.imAll;
  const { from, to } = imerRange(today, nav.params.imFrom);
  const units = platoonsOf(state.settings).map(u => platoonShort(u.name));
  const unit: string = units.includes(nav.params.imUnit) ? nav.params.imUnit : 'all';
  const st = state;
  const grid = useMemo(() => imerGrid(st, from, to, all, today, unit), [st.people, st.statuses, st.guards, st.dutyLog, st.imer, st.settings, st.rules, st.dayPlan, from, to, all, today, unit]);   // eslint-disable-line react-hooks/exhaustive-deps
  const n = grid.groups.reduce((a, g) => a + g.g.rows.length, 0);
  const move = (k: number) => nav.set({ imFrom: addDays(from, 7 * k) });
  const isDefault = !nav.params.imFrom;
  const req = { from, to, all };
  const go = async (print: boolean, sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportImer(req, print, sigs);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (print && r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + (r.warnings.length ? ' · ' + r.warnings.join(' · ') : '') });
    } finally { setXl(false); }
  };
  const sections = grid.groups;
  const total = sections.length > 1 ? sumTotals(sections.map(g => g.tot)) : null;
  const cols = 5 + grid.days.length;
  const totRows = (tot: ImerPart['tot'], label: string) => ['Π', 'Α'].map((k, i) => html`<tr key=${label + k} className="imer__tot"><th colSpan="4" scope="row">${i === 0 ? label : ''}</th><th>${i === 0 ? 'Παρόντες (Π)' : 'Απόντες (Α)'}</th>${tot.map((t, j) => html`<td key=${j}>${t.show ? (i === 0 ? t.p : t.a) : ''}</td>`)}</tr>`);
  return html`<div>
    <${PageHeader} title="Ημερολόγιο κωλυομένων και απόντων" sub="Γεμίζει μόνο του από άδειες, ιατρικά, υπηρεσίες και πόστα. Πάτα ένα κελί για να το αλλάξεις με το χέρι.">
      <${Button} disabled=${xl} onClick=${() => go(false)} data-tip="Ένα Excel με φύλλο ανά ουλαμό, όπως το έχεις στο χαρτί">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => go(true)} aria-label="Εκτύπωση" data-tip="Εκτύπωση χωρίς να ανοίξεις Excel">${Icon.print}Εκτύπωση<//>
      <${Button} variant="outline" onClick=${() => setCodes(true)} data-tip="Τίτλος, φύλλα, κωδικοί και τι μετρά ως Π ή Α">Κωδικοί…<//>
      <${SigsMenu} form="imer" date=${today} label="το Ημερολόγιο" disabled=${xl} variant="outline" go=${go}/><//>
    <div className="toolbar">
      <${Button} variant="outline" size="icon" aria-label="Πίσω μία εβδομάδα" data-tip="Μία εβδομάδα πίσω" onClick=${() => move(-1)}>‹<//>
      <b className="imer__range">${dm(from)} – ${dm(to)}/${to.slice(0, 4)}</b><span className="muted">· ${all ? 'όλες οι μέρες' : 'μέρες εκπαίδευσης'}</span>
      <${Button} variant="outline" size="icon" aria-label="Μία εβδομάδα μπροστά" data-tip="Μία εβδομάδα μπροστά" onClick=${() => move(1)}>›<//>
      ${!isDefault && html`<${Button} variant="ghost" onClick=${() => nav.set({ imFrom: undefined })}>Πίσω στο σήμερα<//>`}
      <${Button} variant="outline" aria-pressed=${all} onClick=${() => nav.set({ imAll: !all })} data-tip="Μέρες εκπαίδευσης (από τους Κανόνες, χωρίς αργίες) ή όλες οι μέρες">${all ? 'Μόνο εκπαίδευση' : 'Άλλες μέρες…'}<//>
      <${Segmented} small=${true} value=${unit} onChange=${(u: string) => nav.set({ imUnit: u })} items=${[{ value: 'all', label: 'Όλη η Ίλη' }, ...units.map(u => ({ value: u, label: u }))]}/>
      <span className="toolbar__count">${n} άτομα</span></div>
    ${n === 0 || !grid.days.length ? html`<div className="ui-card empty">${n === 0 ? 'Δεν υπάρχει προσωπικό.' : 'Καμία μέρα εκπαίδευσης σε αυτές τις ημερομηνίες. Δες «Άλλες μέρες…» ή άλλαξε τους Κανόνες.'}</div>` :
    html`<div className="imer" role="region" aria-label="Ημερολόγιο κωλυομένων"><table className="imer__t">
      <thead><tr><th scope="col" className="imer__n">Α/Α</th><th scope="col">Βαθμ.</th><th scope="col">Ο-Σ</th><th scope="col" className="imer__l">Επώνυμο</th><th scope="col" className="imer__l">Όνομα</th>${grid.days.map(dayHead)}</tr></thead>
      ${sections.map(g => html`<tbody key=${g.g.name}>
        ${sections.length > 1 && html`<tr className="imer__grp"><th colSpan=${cols} scope="colgroup">${g.g.unit}${g.g.rooms && ' · ' + g.g.rooms}</th></tr>`}
        ${g.g.rows.map((p, i) => html`<tr key=${p.id}><td className="imer__n">${i + 1}</td><td data-tip=${rankTxt(p) !== p.rank ? rankTxt(p) : undefined}>${p.rank}</td><td>${p.spec}</td><th scope="row" className="imer__l">${p.last}</th><td className="imer__l">${p.first}</td>
          ${g.cells[i].map((c, k) => { const d = grid.days[k]; return html`<td key=${d} className=${cx('imer__c', tone(c) && 'is-' + tone(c), c.hand && 'is-hand', d > today && !c.code && 'is-future', d === today && 'is-today')} tabIndex="0" role="button" aria-label=${p.last + ' ' + p.first + ' ' + dm(d) + (c.code ? ': ' + c.code : ': κενό')} data-tip=${c.hand ? 'Με το χέρι' + (c.auto ? ' (αυτόματα: ' + c.auto + ')' : '') : undefined} onClick=${() => setPick({ p, d })} onKeyDown=${(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick({ p, d }); } }}>${c.code}</td>`; })}</tr>`)}
        ${totRows(g.tot, sections.length > 1 ? g.g.unit : 'ΣΥΝΟΛΟ')}</tbody>`)}
      ${total && html`<tbody>${totRows(total, 'ΣΥΝΟΛΟ ΙΛΗΣ')}</tbody>`}
    </table></div>
    <div className="imer__key"><span><i className="is-abs"/>Απών</span><span><i className="is-duty"/>Υπηρεσία / πόστο</span><span><i className="is-free"/>Ελεύθερος υπ./ασκ.</span><span><i className="is-future"/>Δεν ήρθε ακόμα</span><span><i className="is-hand"/>Με το χέρι</span><span className="muted">Κενό = στην εκπαίδευση</span></div>`}
    ${pick && html`<${CellDialog} p=${pick.p} d=${pick.d} onClose=${() => setPick(null)} run=${run} undoMark=${undoMark} toast=${toast}/>`}
    ${codes && html`<${CodesDialog} onClose=${() => setCodes(false)} onPrint=${() => { setCodes(false); go(true); }}/>`}
  </div>`;
}

function CellDialog({ p, d, onClose, run, undoMark, toast }: P) {
  const { state } = useStore();
  const cur = handOf(state, d, p.id); const [text, setText] = useState(cur);
  const auto = (grid1(state, p, d)) || 'κενό (στην εκπαίδευση)';
  const save = async (v: string) => { if (await run({ t: 'setImer', date: d, cells: [{ pid: p.id, text: v }] }, false)) { onClose(); toast({ text: v ? 'Ημερολόγιο: ' + p.last + ' ' + dm(d) + ' → ' + upper(v) : 'Ημερολόγιο: ' + p.last + ' ' + dm(d) + ' πίσω στο αυτόματο', actions: [undoMark()] }); } };
  const ch = handChoices(state.settings);
  return html`<${Dialog} title=${p.last + ' ' + p.first + ' · ' + dow(d) + ' ' + dm(d)} description=${'Αυτόματα: ' + auto + (cur ? ' · Με το χέρι: ' + cur : '')} onClose=${onClose}
    footer=${html`<${Button} variant="outline" disabled=${!cur} onClick=${() => save('')}>Πίσω στο αυτόματο<//><${Button} variant="ghost" onClick=${onClose}>Άκυρο<//><${Button} disabled=${upper(text.trim()) === cur} onClick=${() => save(text)}>Κράτα<//>`}>
    <div className="imer__ch">${ch.map(c => html`<button key=${c} type="button" className="ui-chip" aria-pressed=${upper(text.trim()) === c} onClick=${() => setText(c)}>${c}</button>`)}</div>
    <input className="ui-input" data-autofocus aria-label="Άλλο κείμενο" placeholder="Άλλο κείμενο (π.χ. ΑΣΚΗΣΗ)" maxLength=${24} value=${text} onChange=${(e: any) => setText(upper(e.target.value))} onKeyDown=${(e: any) => { if (e.key === 'Enter') save(text); }} style=${{ marginTop: '12px' }}/>
    <p className="muted" style=${{ fontSize: '13px' }}>Αλλάζει μόνο το ημερολόγιο. Ό,τι είναι δηλωμένο (άδεια, υπηρεσία) μένει όπως είναι.</p>
  <//>`;
}
// ο αυτόματος κωδικός ενός κελιού (χωρίς το χέρι), για να φαίνεται στο παράθυρο
const grid1 = (s: P, p: Person, d: ISODate): string => autoCell(s, p, d)?.code || '';

function CodesDialog({ onClose, onPrint }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const cur: ImerSettings = state.settings.imer || {};
  const [title, setTitle] = useState<ImerTitle>(cur.title === 'ekp' ? 'ekp' : 'imer'); const [sheets, setSheets] = useState<ImerSheets>(imerSheets(state.settings));
  const [codes, setCodes] = useState<Record<string, { code: string; count: Count }>>(() => Object.fromEntries(IMER_ROWS.map(r => [r.key, { code: imerCode(state.settings, r.key), count: imerCount(state.settings, r.key) }])));
  const set = (k: string, v: Partial<{ code: string; count: Count }>) => setCodes(c => ({ ...c, [k]: { ...c[k], ...v } }));
  const save = async () => {
    const out: NonNullable<ImerSettings['codes']> = {};
    for (const r of IMER_ROWS) { const c = codes[r.key], o: { code?: string; count?: Count } = {}; const code = upper(c.code.trim()); if (r.edit && code && code !== r.def) o.code = code; if (c.count !== r.count) o.count = c.count; if (o.code || o.count) out[r.key] = o; }
    const imer: ImerSettings = { ...(title === 'ekp' ? { title } : {}), ...(sheets !== 'unit' ? { sheets } : {}), ...(Object.keys(out).length ? { codes: out } : {}) };
    if (await run({ t: 'setSettings', settings: { imer }, text: 'Ημερολόγιο κωλυομένων: τίτλος, φύλλα και κωδικοί' }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκαν οι κωδικοί του ημερολογίου.', actions: [undoMark()] }); }
  };
  return html`<${Dialog} size="lg" title="Κωδικοί ημερολογίου" description="Ισχύουν για την οθόνη, το Excel και την εκτύπωση. Όποιος έχει δύο πράγματα την ίδια μέρα παίρνει το πρώτο της λίστας (π.χ. άδεια πριν από υπηρεσία)." onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${onClose}>Άκυρο<//><${Button} variant="outline" onClick=${onPrint}>Εκτύπωση<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="imer__opt"><span>Τίτλος</span><${Segmented} small=${true} value=${title} onChange=${setTitle} items=${(Object.keys(IMER_TITLES) as ImerTitle[]).map(k => ({ value: k, label: IMER_TITLES[k] }))}/></div>
    <div className="imer__opt"><span>Φύλλα</span><${Segmented} small=${true} value=${sheets} onChange=${setSheets} items=${[{ value: 'unit', label: 'Ένα ανά ουλαμό' }, { value: 'all', label: 'Ένα για όλη την ίλη' }, { value: 'both', label: 'Και τα δύο' }]}/></div>
    <table className="imer__codes"><thead><tr><th scope="col">Κατάσταση στην εφαρμογή</th><th scope="col">Κωδικός</th><th scope="col">Μετρά ως</th><th scope="col">Από πού</th></tr></thead>
      <tbody>${IMER_ROWS.map(r => html`<tr key=${r.key}><td>${r.label}</td>
        <td>${r.edit ? html`<input className="ui-input" aria-label=${'Κωδικός: ' + r.label} maxLength=${8} value=${codes[r.key].code} onChange=${(e: any) => set(r.key, { code: upper(e.target.value) })}/>` : html`<span className="muted">${r.def}</span>`}</td>
        <td><${Segmented} small=${true} value=${codes[r.key].count} onChange=${(v: Count) => set(r.key, { count: v })} items=${[{ value: 'P', label: 'Π', tip: 'Παρών' }, { value: 'A', label: 'Α', tip: 'Απών' }]}/></td>
        <td className="muted">${r.from}</td></tr>`)}</tbody></table>
    <p className="muted" style=${{ fontSize: '13px' }}>Κενό κελί = στην εκπαίδευση = Π. Άλλες άδειες και ιατρικά (π.χ. τιμητική) βγαίνουν με τον κωδικό τους και μετράνε Α αν είναι άδεια.</p>
  <//>`;
}
