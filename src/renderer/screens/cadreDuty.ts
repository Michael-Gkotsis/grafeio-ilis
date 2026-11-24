// features/cadre · «Υπηρεσίες στελεχών» (Michael, 17/11, πρόταση λοχία): πρόγραμμα του μήνα για τα στελέχη, στελέχη × μέρες (κοινό MonthGrid)
// ή υπηρεσίες × μέρες. Κλικ σε κελί (ή σύρσιμο σε μια γραμμή): διάλεξε υπηρεσία/άτομο ή βγάλε. Ό,τι δεν ταιριάζει (άδεια, περιορισμός, όριο,
// ανάπαυση, διπλή υπηρεσία) φαίνεται ως ⚠ και ζητά αιτία, ποτέ δεν μπλοκάρει. Η λογική είναι στο shared/cadreDuty.ts· δεν αγγίζει τις υπηρεσίες των στρατιωτών.
import { useMemo, useRef, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, Segmented, Strip, Why, useDirty, useToast } from '../ui';
import { Select } from '../select';
import { DateField } from '../common';
import { useNav, useStore } from '../store';
import { MonthGrid, type GridCell, type GridRow, type GridSel } from '../monthGrid';
import { rankTxt } from '../../shared/ranks';
import { colShort } from '../../shared/cadre';
import { HK } from '../../shared/unit';
import { MONTHS, dm, dmy, type ISODate } from '../../shared/dates';
import { postBy } from '../../shared/rules';
import { monthIndex, monthLabel, planFilters, rangeTxt, shiftMonth } from '../../shared/cadrePlan';
import {
  DOW_INI, DOW_ORDER, autoFill, carryText, catOf, cellCode, dutyCfgOf, dutySections, eligibility, limitText, monthCheck, monthLimit, nameOf, personCells, personOf, runsOn, serviceOf, threeOf, duByDay,
  type AutoFillResult, type DutyCell, type Reason
} from '../../shared/cadreDuty';
import type { AppState, Cadre, CadreService } from '../../shared/domain';

const acc = (ym: string) => MONTHS[+ym.slice(5, 7) - 1].replace(/ς$/, '');   // «τον Ιανουάριο»
const rowsOf = (days: ISODate[], from: number, to: number) => days.slice(from, to + 1);
// λόγοι για όλες τις μέρες ενός διαστήματος, χωρίς διπλά
function rangeReasons(s: AppState, c: Cadre, svc: CadreService | undefined, days: ISODate[]): Reason[] {
  const seen = new Map<string, Reason>();
  for (const d of days) for (const r of eligibility(s, c, d, svc)) if (!seen.has(r.text)) seen.set(r.text, r);
  return [...seen.values()];
}
const reasonTip = (r: Reason[]) => r.map(x => '⚠ ' + x.text).join('\n');

// ---- μενού ανά άτομο: διάλεξε υπηρεσία για τις μέρες που επέλεξες ----
function PersonMenu({ c, days, onPick, onRemove, onInfo }: { c: Cadre; days: ISODate[]; onPick: (svc: CadreService, reasons: Reason[]) => void; onRemove: () => void; onInfo: () => void }) {
  const { state } = useStore(); const cfg = dutyCfgOf(state.settings); const p = personOf(state, c.id);
  const [all, setAll] = useState(false);
  const mine = cfg.groups.find(g => g.id === p.group);
  const groups = !all && mine ? [mine] : cfg.groups;
  const has = days.some(d => state.cadreDuties?.some(x => x.cid === c.id && x.date === d));
  const n = days.length;
  const list = useMemo(() => groups.map(g => ({ g, items: g.services.map(v => { const ds = n > 1 ? days.filter(d => runsOn(v, d)) : days; return { v, ds, reasons: ds.length ? rangeReasons(state, c, v, ds) : [] }; }) })),
    [groups, days, state.cadreDuties, state.cadreAbs, state.cadreNoDuty, state.cadreDutyOf, state.guards, state.dutyLog, state.settings, c]);
  return html`<div className="mg-menu__head"><b>${rankTxt(c)} ${c.last}</b><span>${days.length === 1 ? dmy(days[0]) : dm(days[0]) + '–' + dm(days[n - 1]) + ' · ' + n + ' μέρες'}</span></div>
    <div className="mg-menu__list">
      ${!cfg.groups.length && html`<p className="note" style=${{ margin: '4px 8px' }}>Δεν υπάρχουν υπηρεσίες στελεχών. Φτιάξ' τες στις Ρυθμίσεις › Υπηρεσίες στελεχών.</p>`}
      ${list.map(({ g, items }) => html`<div key=${g.id} className="mg-menu__grp">${(cfg.groups.length > 1 || all) && html`<small>${g.name}</small>`}
        ${items.map(({ v, ds, reasons }) => html`<button type="button" role="menuitem" key=${v.id} className="mg-menu__it" disabled=${!ds.length} onClick=${() => onPick(v, reasons)}
          data-tip=${reasons.length ? reasonTip(reasons) + '\n(γράφεται με αιτία)' : ds.length ? undefined : 'Δεν γίνεται αυτές τις μέρες'} data-tip-side="right"><i className="mg-sw mg-duty">${v.short.slice(0, 3)}</i><span>${v.name}</span>${reasons.length > 0 && html`<b className=${'mg-menu__warn' + (reasons.some(r => r.strong) ? ' is-strong' : '')} aria-label="Προειδοποίηση">⚠</b>`}</button>`)}</div>`)}
      ${mine && html`<button type="button" role="menuitem" className="mg-menu__it" onClick=${() => setAll(!all)}><span className="muted">${all ? 'Μόνο της ομάδας του' : 'Όλες οι υπηρεσίες…'}</span></button>`}
      <div className="mg-menu__sep"></div>
      <button type="button" role="menuitem" className="mg-menu__it" disabled=${!has} data-tip=${has ? undefined : 'Δεν έχει υπηρεσία του προγράμματος σε αυτές τις μέρες'} onClick=${onRemove}><i className="mg-sw mg-clr">⌫</i><span>Βγάλε</span></button>
      <button type="button" role="menuitem" className="mg-menu__it" onClick=${onInfo}><span>Στοιχεία υπηρεσιών…</span></button></div>`;
}
// ---- μενού ανά υπηρεσία: διάλεξε άτομο ----
function SvcMenu({ svc, days, onPick, onRemove }: { svc: CadreService; days: ISODate[]; onPick: (c: Cadre, reasons: Reason[]) => void; onRemove: (ids: string[]) => void }) {
  const { state } = useStore(); const n = days.length;
  const day = (state.cadreDuties || []).filter(x => x.svc === svc.id && days.includes(x.date));
  const rows = useMemo(() => {
    const act = state.cadreList.filter(c => c.active);
    return act.map(c => ({ c, reasons: rangeReasons(state, c, svc, days.filter(d => runsOn(svc, d) || n === 1)), lim: monthLimit(state, c, days[0].slice(0, 7)) }))
      .sort((a, b) => a.reasons.length - b.reasons.length || (a.lim.done - b.lim.done));
  }, [state.cadreList, state.cadreDuties, state.cadreAbs, state.cadreNoDuty, state.cadreDutyOf, state.guards, state.dutyLog, state.settings, svc, days]);
  const pm = new Map(state.cadreList.map(c => [c.id, c]));
  return html`<div className="mg-menu__head"><b>${svc.name}</b><span>${days.length === 1 ? dmy(days[0]) : dm(days[0]) + '–' + dm(days[n - 1]) + ' · ' + n + ' μέρες'}</span></div>
    ${day.length > 0 && html`<div className="mg-menu__list">${day.map(x => html`<button type="button" role="menuitem" key=${x.id} className="mg-menu__it" onClick=${() => onRemove([x.id])}><i className="mg-sw mg-clr">⌫</i><span>Βγάλε ${nameOf(pm.get(x.cid))}${n > 1 ? ' (' + dm(x.date) + ')' : ''}</span></button>`)}<div className="mg-menu__sep"></div></div>`}
    <div className="mg-menu__list mg-menu__scroll">${rows.map(({ c, reasons, lim }) => html`<button type="button" role="menuitem" key=${c.id} className="mg-menu__it" onClick=${() => onPick(c, reasons)}
      data-tip=${reasons.length ? reasonTip(reasons) + '\n(γράφεται με αιτία)' : undefined} data-tip-side="right"><span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>${rankTxt(c)} ${c.last}</span><small className="muted">${lim.done}/${lim.effBase}${lim.extra ? '+' + lim.extra : ''}</small>${reasons.length > 0 && html`<b className=${'mg-menu__warn' + (reasons.some(r => r.strong) ? ' is-strong' : '')} aria-label="Προειδοποίηση">⚠</b>`}</button>`)}</div>
    ${day.length > 1 && n === 1 && html`<div className="mg-menu__note">Η υπηρεσία έχει ${day.length} άτομα αυτή τη μέρα (προβλέπονται ${svc.perDay}).</div>`}`;
}

// ---- το παράθυρο «αιτία» ----
interface Ask { c: Cadre; svc: CadreService; days: ISODate[]; reasons: Reason[] }
function WhyDialog({ ask, onClose, onSave }: { ask: Ask; onClose: () => void; onSave: (why: string) => void }) {
  const [why, setWhy] = useState(''); const dirty = useDirty(why);
  return html`<${Dialog} title=${'Υπηρεσία ' + ask.svc.short + ': ' + rankTxt(ask.c) + ' ' + ask.c.last} onClose=${onClose} dirty=${dirty && 'Δεν αποθηκεύτηκε η υπηρεσία. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${!why.trim() && 'Λείπει: Αιτία'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!why.trim()} why="Λείπει: Αιτία" onClick=${() => onSave(why.trim())}>Βάλ' το παρά τα ⚠<//>`}>
    <${Alert} tone="warn"><span>${ask.days.length === 1 ? dmy(ask.days[0]) : dm(ask.days[0]) + '–' + dm(ask.days[ask.days.length - 1]) + ' (' + ask.days.length + ' μέρες)'}: ${ask.reasons.map(r => html`<span key=${r.text} style=${{ display: 'block' }}>⚠ ${r.text}</span>`)}</span><//>
    <div className="field"><label className="field__label" htmlFor="cd-why">Αιτία *</label><input id="cd-why" className="ui-input" data-autofocus="" placeholder="π.χ. αλλαγή με συνάδελφο, εντολή Ταξιαρχίας" value=${why} onChange=${(e: any) => setWhy(e.target.value)}/>
      <span className="field__help">Γράφεται στο Ιστορικό και φαίνεται στο κελί. Δεν σταματά ποτέ: αν χρειάζεται, μπαίνει.</span></div>
  <//>`;
}

// ---- προεπισκόπηση της αυτόματης συμπλήρωσης ----
function FillDialog({ fill, ym, onClose, onApply }: { fill: AutoFillResult; ym: string; onClose: () => void; onApply: () => void }) {
  const { state } = useStore(); const cfg = dutyCfgOf(state.settings); const pm = new Map(state.cadreList.map(c => [c.id, c]));
  const emptyBy = new Map<string, ISODate[]>(); for (const e of fill.empty) { const l = emptyBy.get(e.svc); if (l) l.push(e.date); else emptyBy.set(e.svc, [e.date]); }
  const cnt = new Map<string, number>(); for (const x of fill.add) cnt.set(x.cid, (cnt.get(x.cid) || 0) + 1);
  // θέσεις «Μόνο στελέχη» του εντύπου (Michael, 24/11): μπαίνουν μαζί και μετρούν μαζί
  const seats = fill.seats || []; for (const x of seats) cnt.set(x.cid, (cnt.get(x.cid) || 0) + 1);
  const total = fill.add.length + seats.length; const seatEmpty = fill.seatEmpty || [];
  const seatTxt = (k: string) => postBy(state, k)?.label || k;
  const seatBy = new Map<string, ISODate[]>(); for (const e of seatEmpty) { const l = seatBy.get(e.k); if (l) l.push(e.date); else seatBy.set(e.k, [e.date]); }
  return html`<${Dialog} title=${'Αυτόματη συμπλήρωση · ' + monthLabel(ym)} onClose=${onClose}
    footer=${html`<${Why} text=${!total && 'Δεν υπάρχει τίποτα να μπει'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!total} why="Δεν υπάρχει τίποτα να μπει" onClick=${onApply}>Εφαρμογή<//>`}>
    <p style=${{ margin: '0 0 8px' }}><b>${total}</b> ${total === 1 ? 'υπηρεσία θα μπει' : 'υπηρεσίες θα μπουν'} σε ${cnt.size} ${cnt.size === 1 ? 'στέλεχος' : 'στελέχη'}. Ό,τι υπάρχει ήδη μένει όπως είναι. Αναιρείται με ένα κλικ.</p>
    ${seats.length > 0 && html`<p className="note" style=${{ margin: '0 0 8px' }}>Από αυτές ${seats.length} στις υπηρεσίες «Μόνο στελέχη» του εντύπου (${[...new Set(seats.map(x => seatTxt(x.k)))].join(', ')}).</p>`}
    ${(fill.seatExtra || []).length > 0 && html`<${Alert} tone="warn"><span><b>«+1» στις θέσεις του εντύπου:</b> ${(fill.seatExtra || []).map(e => nameOf(pm.get(e.cid)) + ' ' + dm(e.date)).join(', ')}</span><//>`}
    ${seatEmpty.length > 0 && html`<${Alert} tone="warn"><span><b>Θα μείνουν κενές ${seatEmpty.length} θέσεις του εντύπου:</b>
      ${[...seatBy].map(([k, ds]) => html`<span key=${k} style=${{ display: 'block' }}>${seatTxt(k)}: ${ds.map(d => dm(d)).join(', ')}</span>`)}</span><//>`}
    ${fill.extra.length > 0 && html`<${Alert} tone="warn"><span><b>«+1» (πάνω από το όριο, μέσα στο έξτρα):</b> ${fill.extra.map(e => nameOf(pm.get(e.cid)) + ' ' + dm(e.date)).join(', ')}</span><//>`}
    ${fill.empty.length > 0 ? html`<${Alert} tone="warn"><span><b>Θα μείνουν κενές ${fill.empty.length}:</b> δεν υπάρχει κανείς που να μπορεί (άδεια, περιορισμός, ανάπαυση ή όριο).
      ${[...emptyBy].map(([id, ds]) => html`<span key=${id} style=${{ display: 'block' }}>${serviceOf(cfg, id)?.svc.name || id}: ${ds.map(d => dm(d)).join(', ')}</span>`)}</span><//>`
      : html`<${Alert} tone="ok"><span>Όλες οι κενές υπηρεσίες του μήνα γεμίζουν.</span><//>`}
    <p className="note" style=${{ margin: '8px 0 0' }}>Σειρά: όποιος έχει κάνει λιγότερες τον μήνα (μαζί με τις θέσεις στρατιωτών), σε ΣΚ/αργίες όποιος έκανε λιγότερες τους τελευταίους 3 μήνες, μετά όποιος έχει να κάνει περισσότερο καιρό. Αν δεν φτάνουν, μπαίνει «+1» ως το έξτρα.</p>
  <//>`;
}

// το κελί ενός στελέχους μιας μέρας: υπηρεσία προγράμματος (γεμάτο), υπηρεσία στρατιωτών (περίγραμμα «Σ»), κατάσταση (αχνό), «δεν θέλει» (✕)
function cellOf(x: DutyCell): GridCell {
  const tips: string[] = [];
  for (const r of x.roster) tips.push((r.svc?.name || r.id) + (r.duty.why ? ' · αιτία: ' + r.duty.why : '') + (r.duty.auto ? ' (αυτόματη)' : ''));
  for (const q of x.seat) tips.push('Υπηρεσία στρατιωτών: ' + q.label);
  if (x.state) tips.push(x.state.name + ' · ' + rangeTxt(x.state));
  if (x.noDuty) tips.push('Δεν θέλει υπηρεσία');
  const tip = tips.join('\n') || undefined;
  if (x.roster.length) return { text: cellCode(x), cls: 'mg-duty ' + (cellCode(x).length > 3 ? 'mg-s4' : cellCode(x).length === 3 ? 'mg-s3' : 'mg-s2') + (x.seat.length || x.roster.length > 1 ? ' mg-dbl' : '') + (x.roster.some(r => r.duty.why) ? ' mg-why' : ''), tip, mark: x.noDuty };
  if (x.seat.length) return { text: 'Σ', cls: 'mg-seat', tip, mark: x.noDuty };
  if (x.state) return { text: x.state.code, cls: 'mg-' + x.state.fam + ' mg-faint', tip, mark: x.noDuty };
  return x.noDuty ? { tip, mark: true } : {};
}

export function CadreDutyView({ onInfo }: { onInfo: (c: Cadre) => void }) {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const cfg = dutyCfgOf(state.settings);
  const ym: string = /^\d{4}-\d{2}$/.test(nav.params.cmonth || '') ? nav.params.cmonth : today.slice(0, 7);
  const mode: 'person' | 'svc' = nav.params.cdm === 'svc' ? 'svc' : 'person';
  const gf: string = nav.params.cdg || 'all';
  const index = useMemo(() => monthIndex(state, ym), [state.cadreAbs, state.cadreNoDuty, state.settings, ym]);
  const dep = [state.cadreList, state.cadreDuties, state.cadreDutyOf, state.cadreAbs, state.cadreNoDuty, state.guards, state.dutyLog, state.baseline, state.settings];
  const secs = useMemo(() => dutySections(state, ym, index), [...dep, ym, index]);   // eslint-disable-line react-hooks/exhaustive-deps
  const check = useMemo(() => monthCheck(state, ym), [...dep, ym]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [xl, setXl] = useState<'' | 'xl' | 'print'>('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [fill, setFill] = useState<AutoFillResult | null>(null);
  const [clr, setClr] = useState<string[] | null>(null);
  const days = index.days.map(d => d.d);
  const filters = useMemo(() => planFilters(state.settings).filter(f => f.id.startsWith('g:')), [state.settings]);
  const visibleSecs = secs.filter(x => gf === 'all' || x.id === gf.slice(2));
  const go = (n: number) => nav.set({ cmonth: shiftMonth(ym, n) === today.slice(0, 7) ? undefined : shiftMonth(ym, n) });
  const total = secs.reduce((a, x) => a + x.people.length, 0);

  // ---- γραμμές: ανά άτομο ----
  const cache = useRef(new Map<string, { sig: string; row: GridRow }>());
  const personRows: GridRow[] = useMemo(() => {
    const old = cache.current; const next = new Map<string, { sig: string; row: GridRow }>(); const out: GridRow[] = [];
    for (const sec of visibleSecs) {
      const g = sec.kind === 'group' ? cfg.groups.find(x => x.id === sec.id) : undefined;
      out.push({ id: 'band:' + sec.id, head: null, cells: [], band: html`<b>${sec.name}</b>${g ? html` · ${g.services.map(v => v.name + ' (' + (v.h24 ? '24ωρη' : 'ωρες') + ', ' + v.perDay + ' τη μέρα' + (v.hkCol ? ', στήλη ' + HK() + ': ' + (colShort(v.hkCol, state.settings.lists) || v.hkCol) : '') + ')').join(' · ') || 'χωρίς υπηρεσίες'}` : sec.kind === 'free' ? ' · μόνο όσα έχουν γίνει με το χέρι στις θέσεις των στρατιωτών' : ''}${g && !sec.people.length ? ' · κανείς δεν έχει μπει (Στοιχεία υπηρεσιών του στελέχους)' : ''}` });
      for (const c of sec.people) {
        const cells = personCells(state, c, index); const lim = monthLimit(state, c, ym); const lt = limitText(state, c, ym, lim);
        const code = cells.map(x => cellCode(x) + (x.noDuty ? '!' : '') + (x.roster[0]?.duty.why ? '?' : '')).join('|');
        const sig = [sec.id, rankTxt(c), c.spec, c.last, c.first, code, lim.done, lim.roster, lim.seat, lim.hol, lim.effBase, lim.extra, lim.base, lim.carry, lim.nextCarry, lt, ym].join('~');
        const hit = old.get(c.id + '|' + sec.id); if (hit && hit.sig === sig) { next.set(c.id + '|' + sec.id, hit); out.push(hit.row); continue; }
        const over = lim.done > lim.effBase + lim.extra ? 'mg-over2' : lim.done > lim.effBase ? 'mg-over' : undefined;
        const row: GridRow = {
          id: c.id,
          head: html`<button type="button" className="mg-who" onClick=${() => onInfo(c)} data-tip=${rankTxt(c) + ' ' + c.last + ' ' + c.first + ' · Στοιχεία υπηρεσιών'} data-tip-side="right"><b>${rankTxt(c)}</b>${c.spec ? ' (' + c.spec + ')' : ''} ${c.last} ${c.first}</button>`,
          cells: cells.map(cellOf),
          tails: [
            html`<span className=${over} data-tip=${lim.roster + ' πρόγραμμα + ' + lim.seat + ' θέσεις στρατιωτών' + (lim.hol ? ' · ΣΚ/αργίες: ' + lim.hol : '')} data-tip-side="left"><b>${lim.done || ''}</b></span>`,
            html`<span data-tip=${'Όριο ' + lim.base + (lim.carry ? (lim.carry > 0 ? ' + ' : ' − ') + Math.abs(lim.carry) + ' από ' + monthLabel(shiftMonth(ym, -1)) : '') + (lim.extra ? ' · έξτρα ' + lim.extra : '')} data-tip-side="left">${lt}</span>`,
            html`<span className=${lim.nextCarry < 0 ? 'mg-neg' : lim.nextCarry > 0 ? 'mg-pos' : undefined} data-tip=${lim.nextCarry ? carryText(ym, lim.nextCarry) + ' · Μεταφέρεται στον επόμενο μήνα (όριο ' + (lim.base + lim.nextCarry) + ')' : undefined} data-tip-side="left">${(lim.nextCarry ? (lim.nextCarry > 0 ? '+' : '−') + Math.abs(lim.nextCarry) : '—')}</span>`
          ]
        };
        next.set(c.id + '|' + sec.id, { sig, row }); out.push(row);
      }
    }
    cache.current = next; return out;
  }, [visibleSecs, state.cadreList, state.settings, index, ym, ...dep]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ---- γραμμές: ανά υπηρεσία ----
  const by = useMemo(() => duByDay(state, ym), [state.cadreDuties, ym]);
  const pmap = useMemo(() => new Map(state.cadreList.map(c => [c.id, c])), [state.cadreList]);
  const svcRows: GridRow[] = useMemo(() => {
    const out: GridRow[] = [];
    for (const g of cfg.groups) {
      if (gf !== 'all' && gf !== 'g:' + g.id) continue;
      out.push({ id: 'band:' + g.id, head: null, cells: [], band: html`<b>${g.name}</b> · ${g.services.length} υπηρεσίες` });
      for (const v of g.services) {
        let filled = 0, gaps = 0;
        const cells = index.days.map((d): GridCell => {
          if (!runsOn(v, d.d)) return { cls: 'mg-off', tip: 'Δεν γίνεται αυτή τη μέρα' };
          const l = by.get(d.d + '|' + v.id) || []; filled += l.length; if (l.length < v.perDay) gaps += v.perDay - l.length;
          if (!l.length) return { cls: 'mg-empty', tip: 'Κενή υπηρεσία' };
          return { text: threeOf(pmap.get(l[0].cid)) + (l.length > 1 ? '+' + (l.length - 1) : ''), cls: 'mg-duty mg-name3' + (l.length < v.perDay ? ' mg-part' : ''), tip: l.map(x => nameOf(pmap.get(x.cid)) + (x.why ? ' · αιτία: ' + x.why : '')).join('\n') };
        });
        out.push({ id: v.id, head: html`<span className="mg-svc" data-tip=${v.name + ' · ' + v.perDay + ' τη μέρα' + (v.h24 ? ' · 24ωρη' : '')}><b>${v.short}</b> ${v.name}</span>`, cells, tails: [html`<b>${filled || ''}</b>`, html`<span className=${gaps ? 'mg-neg' : undefined}>${gaps || '—'}</span>`] });
      }
    }
    return out;
  }, [cfg, index, by, pmap, gf]);

  // ---- εγγραφές ----
  const assign = async (c: Cadre, svc: CadreService, ds: ISODate[], why?: string) => {
    const w = rankTxt(c) + ' ' + c.last; const list = ds.filter(d => runsOn(svc, d) || ds.length === 1);
    if (!list.length) return;
    const ok = list.length === 1
      ? await run({ t: 'saveCadreDuty', duty: { date: list[0], svc: svc.id, cid: c.id, ...(why ? { why } : {}) } }, false)
      : await run({ t: 'setCadreDuties', add: list.map(d => ({ date: d, svc: svc.id, cid: c.id, ...(why ? { why } : {}) })), del: [], text: w + ', ' + svc.name + ' ' + rangeTxt({ from: list[0], to: list[list.length - 1] }) }, false);
    if (ok) toast({ text: w + ': ' + svc.name + ' ' + (list.length === 1 ? dm(list[0]) : list.length + ' μέρες') + (why ? ' (παρά τα ⚠)' : ''), actions: [undoMark()] });
  };
  const choose = (c: Cadre, svc: CadreService, ds: ISODate[], reasons: Reason[], close: () => void) => {
    close(); if (reasons.length) setAsk({ c, svc, days: ds, reasons }); else assign(c, svc, ds);
  };
  const removeIds = async (ids: string[], text: string) => {
    if (!ids.length) return;
    const ok = ids.length === 1 ? await run({ t: 'deleteCadreDuty', id: ids[0] }, false) : await run({ t: 'setCadreDuties', add: [], del: ids, text }, false);
    if (ok) toast({ text: ids.length === 1 ? 'Βγήκε η υπηρεσία' : 'Βγήκαν ' + ids.length + ' υπηρεσίες', actions: [undoMark()] });
  };
  const menu = (sel: GridSel, close: () => void) => {
    const ds = rowsOf(days, sel.from, sel.to);
    if (mode === 'person') {
      const c = state.cadreList.find(x => x.id === sel.row); if (!c) return null;
      return html`<${PersonMenu} key=${c.id + ds[0] + ds.length} c=${c} days=${ds} onPick=${(v: CadreService, r: Reason[]) => choose(c, v, ds, r, close)}
        onRemove=${() => { close(); removeIds((state.cadreDuties || []).filter(x => x.cid === c.id && ds.includes(x.date)).map(x => x.id), rankTxt(c) + ' ' + c.last + ': βγήκαν οι υπηρεσίες ' + rangeTxt({ from: ds[0], to: ds[ds.length - 1] })); }} onInfo=${() => { close(); onInfo(c); }}/>`;
    }
    const v = serviceOf(cfg, sel.row)?.svc; if (!v) return null;
    return html`<${SvcMenu} key=${v.id + ds[0] + ds.length} svc=${v} days=${ds} onPick=${(c: Cadre, r: Reason[]) => choose(c, v, ds, r, close)} onRemove=${(ids: string[]) => { close(); removeIds(ids, v.name + ': βγήκαν υπηρεσίες'); }}/>`;
  };
  // αυτόματη συμπλήρωση μήνα: πρώτα προεπισκόπηση, μετά μία εντολή (ένα undo)
  const autoIds = useMemo(() => (state.cadreDuties || []).filter(x => x.auto && x.date.startsWith(ym)).map(x => x.id), [state.cadreDuties, ym]);
  const applyFill = async () => {
    const f = fill; setFill(null); const sn = f?.seats?.length || 0; if (!f || !(f.add.length + sn)) return;
    if (await run({ t: 'setCadreDuties', add: f.add, del: [], ...(sn ? { seats: f.seats } : {}), text: 'αυτόματη συμπλήρωση ' + monthLabel(ym).toLowerCase() + ' (' + (f.add.length + sn) + ')' }, false)) toast({ text: 'Μπήκαν ' + (f.add.length + sn) + ' υπηρεσίες' + (f.empty.length + (f.seatEmpty?.length || 0) ? ', έμειναν ' + (f.empty.length + (f.seatEmpty?.length || 0)) + ' κενές' : ''), actions: [undoMark()] });
  };
  const clearAuto = async () => {
    const ids = clr; setClr(null); if (!ids?.length) return;
    if (await run({ t: 'setCadreDuties', add: [], del: ids, text: 'σβήστηκαν οι αυτόματες ' + monthLabel(ym).toLowerCase() + ' (' + ids.length + ')' }, false)) toast({ text: 'Σβήστηκαν ' + ids.length + ' αυτόματες υπηρεσίες', actions: [undoMark()] });
  };
  const exportXl = async (print: boolean) => {
    setXl(print ? 'print' : 'xl');
    try {
      const r = await window.api.exportCadreDuty(ym, print);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': υπηρεσίες στελεχών ' + monthLabel(ym).toLowerCase() + '.' });
    } finally { setXl(''); }
  };

  const none = !cfg.groups.length;
  const issues = check.over.length + check.double.length + check.broken.length + (check.empty.length ? 1 : 0);
  function cap<T>(a: T[], n = 5): T[] { return a.slice(0, n); }
  return html`<div className="plan duty" data-cadre-duty="">
    <div className="plan__bar">
      <div className="plan__month"><${Button} variant="outline" size="icon" aria-label="Προηγούμενος μήνας" onClick=${() => go(-1)}>‹<//><b>${monthLabel(ym)}</b><${Button} variant="outline" size="icon" aria-label="Επόμενος μήνας" onClick=${() => go(1)}>›<//>
        ${ym !== today.slice(0, 7) && html`<${Button} variant="ghost" size="sm" onClick=${() => nav.set({ cmonth: undefined })}>Σήμερα<//>`}</div>
      <${Segmented} small=${true} label="Προβολή" value=${mode} onChange=${(v: string) => nav.set({ cdm: v === 'svc' ? 'svc' : undefined })} items=${[{ value: 'person', label: 'Ανά άτομο' }, { value: 'svc', label: 'Ανά υπηρεσία' }]}/>
      <span style=${{ flex: 1 }}></span>
      <span className="duty__slot" data-slot="autofill">
        <${Button} disabled=${none} why=${none ? 'Δεν υπάρχουν υπηρεσίες στελεχών' : undefined} onClick=${() => setFill(autoFill(state, ym))} data-tip="Γεμίζει μόνο τις κενές υπηρεσίες του μήνα· δεν αλλάζει ό,τι υπάρχει. Πρώτα δείχνει τι θα γίνει.">Αυτόματη συμπλήρωση<//>
        <${Button} variant="outline" disabled=${!autoIds.length} why=${autoIds.length ? undefined : 'Δεν υπάρχουν αυτόματες υπηρεσίες αυτόν τον μήνα'} onClick=${() => setClr(autoIds)} data-tip="Σβήνει μόνο όσες μπήκαν αυτόματα· οι δικές σου μένουν">Σβήσε αυτόματα<//></span>
      <${Button} variant="outline" disabled=${!!xl || none} why=${none ? 'Δεν υπάρχουν υπηρεσίες στελεχών' : undefined} onClick=${() => exportXl(false)} data-tip="Νέο Excel: ο μήνας ανά άτομο και ανά ημέρα">${xl === 'xl' ? 'Δημιουργία…' : 'Excel'}<//>
      <${Button} variant="outline" disabled=${!!xl || none} why=${none ? 'Δεν υπάρχουν υπηρεσίες στελεχών' : undefined} onClick=${() => exportXl(true)} data-tip="Άνοιγμα της εκτύπωσης (A4 οριζόντια, μία σελίδα φάρδος)">${xl === 'print' ? 'Άνοιγμα…' : 'Εκτύπωση'}<//>
    </div>
    ${filters.length > 1 && !none && html`<div className="plan__bar" style=${{ marginTop: '-4px' }}>${filters.length > 1 && html`<${Strip} role="group" aria-label="Ομάδες"><button type="button" className="ui-chip" aria-pressed=${gf === 'all'} onClick=${() => nav.set({ cdg: undefined })}>Όλες</button>${filters.map(f => html`<button key=${f.id} type="button" className="ui-chip" aria-pressed=${gf === f.id} onClick=${() => nav.set({ cdg: f.id })}>${f.label}</button>`)}<//>`}</div>`}
    ${none ? html`<div className="ui-card empty">Δεν έχουν οριστεί υπηρεσίες στελεχών. Φτιάξε ομάδες και υπηρεσίες (π.χ. ΑΥΔΜ, Πύλη) στις Ρυθμίσεις. <${Button} variant="link" onClick=${() => nav.go('templates', { tab: 'cadreDuty' })}>Άνοιξε τις Ρυθμίσεις<//></div>`
    : html`<div className="duty__main">
      <div className="duty__grid">${(mode === 'person' ? personRows.length : svcRows.length) === 0 || (mode === 'person' && !total && !secs.some(x => x.kind === 'group'))
        ? html`<div className="ui-card empty">Δεν υπάρχουν στελέχη στις ομάδες. Βάλε στελέχη σε ομάδα από τα «Στοιχεία υπηρεσιών» (κλικ στο όνομα, ή στην καρτέλα του στελέχους).</div>`
        : html`<${MonthGrid} days=${index.days} rows=${mode === 'person' ? personRows : svcRows} headLabel=${mode === 'person' ? 'Στελέχη' : 'Υπηρεσίες'} tailLabels=${mode === 'person' ? ['Σ', 'Όριο', 'Μεταφ.'] : ['Σ', 'Κενά']} label=${'Υπηρεσίες στελεχών ' + monthLabel(ym)} menu=${menu}/>`}
        <div className="mg-legend" aria-label="Υπόμνημα"><span><i className="mg-sw mg-duty">ΑΥ</i>Υπηρεσία του προγράμματος</span><span><i className="mg-sw mg-seat">Σ</i>Υπηρεσία στρατιωτών (με το χέρι)</span><span><i className="mg-sw mg-ka mg-faint">ΚΑ</i>Άδεια ή κατάσταση</span><span><i className="mg-sw mg-no">✕</i>Δεν θέλει υπηρεσία</span><span><i className="mg-sw mg-we"></i>ΣΚ</span><span><i className="mg-sw mg-hol"></i>Αργία</span></div>
        <p className="mg-hint">Κλικ σε κελί (ή σύρε σε μια γραμμή για πολλές μέρες): διάλεξε υπηρεσία ή «Βγάλε». Το ⚠ δείχνει άδεια, περιορισμό, όριο, ανάπαυση ή διπλή υπηρεσία· αν το βάλεις, ζητά αιτία. Οι υπηρεσίες των στρατιωτών που έκανε με το χέρι (Σ) μετρούν στο ίδιο όριο.</p></div>
      <aside className="duty__side">
        <${Card} title="Όρια τον μήνα">
          <div className="duty__kv"><span>Αξιωματικοί</span><b>${cfg.limits.off.base}${cfg.limits.off.extra ? ' (+' + cfg.limits.off.extra + ' αν χρειαστεί)' : ''}</b>
            <span>Υπαξιωματικοί</span><b>${cfg.limits.nco.base}${cfg.limits.nco.extra ? ' (+' + cfg.limits.nco.extra + ' αν χρειαστεί)' : ''}</b>
            <span>Ανάπαυση</span><b>${cfg.rest ? cfg.rest + (cfg.rest === 1 ? ' μέρα' : ' μέρες') : 'καμία'}</b>
            <span>Μεταφορά στον επόμενο</span><b>${cfg.carry ? 'Ναι' : 'Όχι'}</b><span>Δίκαιες ΣΚ/αργίες</span><b>${cfg.fairHol ? 'Ναι' : 'Όχι'}</b></div>
          <p className="note" style=${{ margin: '6px 0 0' }}>Αλλάζουν στις <button type="button" className="linkish" onClick=${() => nav.go('templates', { tab: 'cadreDuty' })}>Ρυθμίσεις › Υπηρεσίες στελεχών</button>. Ανά άτομο: «Στοιχεία υπηρεσιών».</p><//>
        <${Card} title=${html`Έλεγχος μήνα ${issues > 0 ? html`<${Badge} tone="warn">${issues}<//>` : html`<${Badge} tone="ok">Εντάξει<//>`}`}>
          <div className="duty__chk" data-duty-check="">
            ${check.empty.length > 0 && html`<div className="duty__it is-warn"><b>Κενές υπηρεσίες:</b> ${cap(check.empty).map(e => e.svc.short + ' ' + e.days.length + (e.days.length === 1 ? ' μέρα' : ' μέρες')).join(', ')}${check.empty.length > 5 ? ' …' : ''}</div>`}
            ${cap(check.over).map(o => html`<div key=${o.c.id} className="duty__it is-warn"><b>${rankTxt(o.c)} ${o.c.last}:</b> ${o.lim.done} από ${o.lim.effBase}${o.lim.done > o.lim.effBase + o.lim.extra ? ' (πάνω και από το έξτρα)' : o.lim.extra ? ' (το +' + o.lim.extra + ')' : ''}${cfg.carry ? '. Τον ' + acc(shiftMonth(ym, 1)) + ' το όριο γίνεται ' + Math.max(0, o.lim.base + o.lim.nextCarry) : ''}.</div>`)}
            ${check.over.length > 5 && html`<div className="duty__more">… και ${check.over.length - 5} ακόμα πάνω από το όριο</div>`}
            ${cap(check.double).map(x => html`<div key=${x.c.id + x.d} className="duty__it is-warn"><b>${rankTxt(x.c)} ${x.c.last}:</b> διπλή υπηρεσία ${dm(x.d)} (${x.what}).</div>`)}
            ${cap(check.broken).map(x => html`<div key=${x.c.id + x.d + x.svc} className="duty__it is-warn"><b>${rankTxt(x.c)} ${x.c.last} ${dm(x.d)} ${x.svc}:</b> ${x.reasons.map(r => r.text).join(' · ')}.</div>`)}
            ${check.broken.length > 5 && html`<div className="duty__more">… και ${check.broken.length - 5} ακόμα με περιορισμό</div>`}
            ${cap(check.under).map(o => html`<div key=${o.c.id} className="duty__it is-ok"><b>${rankTxt(o.c)} ${o.c.last}:</b> ${o.lim.done} από ${o.lim.effBase}${cfg.carry && o.lim.nextCarry > 0 ? '. Τον ' + acc(shiftMonth(ym, 1)) + ' ' + (o.lim.base + o.lim.nextCarry) : ''}.</div>`)}
            ${check.under.length > 5 && html`<div className="duty__more">… και ${check.under.length - 5} ακόμα κάτω από το όριο</div>`}
            ${!issues && !check.under.length && html`<p className="note" style=${{ margin: 0 }}>Δεν βρέθηκε κάτι.</p>`}
            <p className="note" style=${{ margin: '6px 0 0' }}>Κάθε υπηρεσία δίνει και μία απαλλαγή στην καρτέλα του στελέχους.</p></div><//>
      </aside></div>`}
    ${fill && html`<${FillDialog} fill=${fill} ym=${ym} onClose=${() => setFill(null)} onApply=${applyFill}/>`}
    ${clr && html`<${Dialog} title="Σβήσιμο αυτόματων υπηρεσιών" onClose=${() => setClr(null)}
      footer=${html`<${Button} variant="outline" onClick=${() => setClr(null)}>Άκυρο<//><${Button} variant="destructive" onClick=${clearAuto}>Σβήσε ${clr.length}<//>`}>
      <p>Θα σβηστούν ${clr.length} υπηρεσίες που μπήκαν αυτόματα τον ${acc(ym)}. Όσες έβαλες ή άλλαξες με το χέρι μένουν. Μπορείς να το αναιρέσεις.</p><//>`}
    ${ask && html`<${WhyDialog} ask=${ask} onClose=${() => setAsk(null)} onSave=${(why: string) => { const a = ask; setAsk(null); assign(a.c, a.svc, a.days, why); }}/>`}
  </div>`;
}

// ---- Στοιχεία υπηρεσιών ανά στέλεχος (mockup 4): ομάδα, όριο, περιορισμοί ----
export function DutyPersonDialog({ c, onClose }: { c: Cadre; onClose: () => void }) {
  const { state, run } = useStore(); const toast = useToast(); const cfg = dutyCfgOf(state.settings); const p = personOf(state, c.id);
  const all = cfg.groups.flatMap(g => g.services.map(v => ({ ...v, group: g.name })));
  const [f, setF] = useState(() => ({
    group: p.group && cfg.groups.some(g => g.id === p.group) ? p.group : '', own: p.limit != null, limit: p.limit != null ? String(p.limit) : '',
    none: !!p.none, noneUntil: p.none?.until || '', only: !!p.only, onlySvc: p.only?.services || [] as string[], onlyUntil: p.only?.until || '',
    no24: !!p.no24, no24Until: p.no24?.until || '', no24Why: p.no24?.why || '', noDow: p.noDow || [] as number[]
  }));
  const dirty = useDirty(f);
  const lim = cfg.limits[catOf(state, c)];
  const limN = Number(f.limit); const bad = (f.own && (f.limit.trim() === '' || !isFinite(limN) || limN < 0)) || (f.only && !f.onlySvc.length);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const person = {
      ...(f.group ? { group: f.group } : {}), ...(f.own ? { limit: Math.floor(limN) } : {}), ...(f.none ? { none: f.noneUntil ? { until: f.noneUntil } : {} } : {}),
      ...(f.only ? { only: { services: f.onlySvc, ...(f.onlyUntil ? { until: f.onlyUntil } : {}) } } : {}), ...(f.no24 ? { no24: { ...(f.no24Until ? { until: f.no24Until } : {}), ...(f.no24Why.trim() ? { why: f.no24Why.trim() } : {}) } } : {}),
      ...(f.noDow.length ? { noDow: f.noDow } : {})
    };
    if (await run({ t: 'setCadreDutyOf', cid: c.id, person: Object.keys(person).length ? person : null }, false)) { onClose(); toast({ text: rankTxt(c) + ' ' + c.last + ': αποθηκεύτηκαν τα στοιχεία υπηρεσιών' }); }
  };
  const date = (id: string, v: string, on: (v: string) => void, dis: boolean) => html`<${DateField} id=${id} className="ui-input" disabled=${dis} style=${{ maxWidth: '150px' }} value=${v} onChange=${(e: any) => on(e.target.value || '')}/>`;
  return html`<${Dialog} title=${'Στοιχεία υπηρεσιών · ' + rankTxt(c) + ' ' + c.last + ' ' + c.first} onClose=${onClose} dirty=${dirty && 'Δεν αποθηκεύτηκαν οι αλλαγές. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Why} text=${bad && 'Έλεγξε το όριο και τις υπηρεσίες'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${bad} why="Έλεγξε το όριο και τις υπηρεσίες" onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="dp-g">Ομάδα</label>
      <${Select} id="dp-g" className="ui-input" value=${f.group} onChange=${(e: any) => set('group', e.target.value)}><option value="">Καμία (μόνο με το χέρι στις θέσεις των στρατιωτών)</option>${cfg.groups.map(g => html`<option key=${g.id} value=${g.id}>${g.name}</option>`)}<//></div>
    <div className="field"><span className="field__label">Όριο τον μήνα</span>
      <div className="duty__row"><${Select} className="ui-input" aria-label="Όριο τον μήνα" style=${{ maxWidth: '280px' }} value=${f.own ? 'own' : 'all'} onChange=${(e: any) => set('own', e.target.value === 'own')}><option value="all">Όπως όλοι (${lim ? lim.base + '+' + lim.extra : ''}${c.monthMax ? ', ΕΠΟΠ/ΟΒΑ: ' + c.monthMax : ''})</option><option value="own">Δικός του αριθμός…</option><//>
        ${f.own && html`<input className="ui-input" aria-label="Δικός του αριθμός" type="number" min="0" max="31" style=${{ maxWidth: '90px' }} value=${f.limit} onChange=${(e: any) => set('limit', e.target.value)}/>`}</div></div>
    <div className="field"><span className="field__label">Περιορισμοί</span>
      <label className="check duty__row"><input type="checkbox" checked=${f.none} onChange=${(e: any) => set('none', e.target.checked)}/><span>Ελαφράς υπηρεσίας: <b>καμία υπηρεσία</b></span> ως ${date('dp-n', f.noneUntil, v => set('noneUntil', v), !f.none)}</label>
      <label className="check duty__row"><input type="checkbox" checked=${f.only} onChange=${(e: any) => set('only', e.target.checked)}/><span>Ελαφράς υπηρεσίας: <b>μόνο</b></span> ως ${date('dp-o', f.onlyUntil, v => set('onlyUntil', v), !f.only)}</label>
      ${f.only && html`<div className="duty__chips">${all.length ? all.map(v => html`<button key=${v.id} type="button" className="ui-chip" aria-pressed=${f.onlySvc.includes(v.id)} onClick=${() => set('onlySvc', f.onlySvc.includes(v.id) ? f.onlySvc.filter(x => x !== v.id) : [...f.onlySvc, v.id])}>${v.short} · ${v.name}</button>`) : html`<span className="muted">Δεν υπάρχουν υπηρεσίες.</span>`}</div>`}
      <label className="check duty__row"><input type="checkbox" checked=${f.no24} onChange=${(e: any) => set('no24', e.target.checked)}/><span><b>Όχι 24ωρες</b> (π.χ. μητέρα) ως</span> ${date('dp-24', f.no24Until, v => set('no24Until', v), !f.no24)}</label>
      ${f.no24 && html`<input className="ui-input" aria-label="Αιτία" placeholder="π.χ. μητέρα: η μέρα που το παιδί κλείνει την ηλικία του κανόνα" value=${f.no24Why} onChange=${(e: any) => set('no24Why', e.target.value)}/>`}
      <span className="field__help">Χωρίς ημερομηνία: ισχύει μέχρι να το αλλάξεις.</span></div>
    <div className="field"><span className="field__label">Μέρες της εβδομάδας που δεν θέλει</span>
      <div className="duty__chips">${DOW_ORDER.map(d => html`<button key=${d} type="button" className="ui-chip duty__dow" aria-pressed=${f.noDow.includes(d)} aria-label=${['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'][d]} onClick=${() => set('noDow', f.noDow.includes(d) ? f.noDow.filter((x: number) => x !== d) : [...f.noDow, d])}>${DOW_INI[d]}</button>`)}</div>
      <span className="field__help">Και συγκεκριμένες μέρες, στο Πρόγραμμα αδειών με ✕.</span></div>
    <${Alert} tone="info"><span>Ο ακριβής κανόνας της Ταξιαρχίας για ελαφράς υπηρεσίας και μητέρες (ηλικία παιδιού, ποιες υπηρεσίες) είναι ρύθμιση, όχι κώδικας: το γράφεις εδώ ανά άτομο, και οι ομάδες, τα όρια και η ανάπαυση αλλάζουν στις Ρυθμίσεις › Υπηρεσίες στελεχών.</span><//>
  <//>`;
}
