// Μενού ΗΚΑΙ › Άδειες (Michael, 18/10): κανονικές, τιμητικές και αναρρωτικές, ποιος λείπει και πότε γυρνά
import { HK } from '../../shared/unit';
import { useDeferredValue, useMemo, useState } from 'react';
import { html, Badge, Button, PageHeader, Segmented } from '../ui';
import { useNav, useStore } from '../store';
import { LeaveEndDialog, LeaveTimesDialog, leaveStarted } from './people';
import { TYPES, fullName, type Status } from '../../shared/domain';
import { awayNow, personMap } from '../../shared/rules';
import { useNowMin } from '../clock';
import { statusLbl } from '../../shared/ranks';
import { hasTimes, timesTxt } from '../../shared/hours';
import { addDays, dayName, daysBetween, dm, dow } from '../../shared/dates';
import { normGreek } from '../../shared/text';

const isLeave = (s: Status) => TYPES[s.type].cat === 'abs';

export function LeavesTab() {
  const { state, today } = useStore(); const nav = useNav();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const view: string = nav.params.leaveTab === 'back' ? 'back' : 'now';
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const [times, setTimes] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const since = addDays(today, -14);
  // γύρισε σήμερα και πέρασε η ώρα επιστροφής: πάει στους «Γύρισαν» (Michael, 20/10)
  const now = useNowMin(); const away = (s: Status) => awayNow(s, today, now);
  const nNow = useMemo(() => state.statuses.filter(s => isLeave(s) && away(s) && pm.has(s.pid)).length, [state.statuses, today, pm, now]);   // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const qq = normGreek(dq.trim());
    const ok = (s: Status) => pm.has(s.pid) && (!qq || normGreek(fullName(pm.get(s.pid)!) + ' ' + statusLbl(s, state.settings.lists) + ' ' + TYPES[s.type].long + ' ' + (s.kind || '') + ' ' + (s.note || '')).includes(qq));
    // τώρα: όσοι λείπουν πρώτα (κατά επιστροφή), μετά όσοι φεύγουν (κατά αναχώρηση)
    if (view === 'now') return state.statuses.filter(s => isLeave(s) && away(s) && ok(s)).sort((a, b) => (a.from > today ? 1 : 0) - (b.from > today ? 1 : 0) || (a.from > today ? a.from.localeCompare(b.from) : a.to.localeCompare(b.to)));
    return state.statuses.filter(s => isLeave(s) && !away(s) && s.to >= since && ok(s)).sort((a, b) => b.to.localeCompare(a.to) || (b.toTime || '').localeCompare(a.toTime || ''));
  }, [state.statuses, view, today, dq, pm, state.settings.lists, now]);   // eslint-disable-line react-hooks/exhaustive-deps
  const when = (s: Status) => {
    if (s.to === today && !away(s)) return 'γύρισε σήμερα';
    if (s.to < today) { const d = daysBetween(s.to, today) - 1; return d === 1 ? 'γύρισε χθες' : 'γύρισε πριν από ' + d + ' ημ.'; }
    if (s.from > today) return 'φεύγει ' + dayName(s.from, today).toLowerCase();
    if (s.open) return 'χωρίς λήξη';
    const n = daysBetween(today, s.to) - 1; return n === 0 ? 'τελευταία μέρα σήμερα' : n === 1 ? 'τελευταία μέρα αύριο' : 'λείπει ακόμα ' + (n + 1) + ' ημ.';
  };
  return html`<div>
    <${PageHeader} title="Άδειες" sub="Κανονικές, τιμητικές και αναρρωτικές. Γράφονται στην ${HK()} (3. Άδειες, Απόντες) και στη Δύναμη. Οι αιτήσεις άδειας είναι στην καρτέλα Αιτήσεις.">
      <${Button} variant="outline" onClick=${() => nav.set({ hkTab: 'req' })}>Αιτήσεις<//><${Button} onClick=${() => nav.declare({ cat: 'abs' })}>+ Άδεια<//><//>
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${view} onChange=${(v: string) => nav.set({ leaveTab: v })} items=${[{ value: 'now', label: 'Τώρα και επόμενες (' + nNow + ')' }, { value: 'back', label: 'Γύρισαν (14 ημ.)' }]}/></div>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Όνομα, είδος άδειας ή σημείωση · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>${dq.trim() && html`<span className="toolbar__count">${list.length} ${list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}</span>`}</div>
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; const tt = timesTxt(s); return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}>${fullName(p)}</button> <${Badge} tone=${t.tone} data-tip=${t.long}>${statusLbl(s, state.settings.lists)}<//>
        <small>${dow(s.from)} ${dm(s.from)} – ${s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · ${when(s)}${tt ? ' · ' + tt : ''}${s.req ? ' · από αίτηση' : ''}${s.note ? ' · ' + s.note : ''}</small></div>
      ${view === 'now' && hasTimes(s.type) && html`<${Button} size="sm" variant="ghost" onClick=${() => setTimes(s)} data-tip="Ώρα αναχώρησης την πρώτη μέρα και ώρα επιστροφής την τελευταία" data-tip-side="left">Ώρες…<//>`}
      ${view === 'now' && (leaveStarted(s, today) ? html`<${Button} size="sm" variant="ghost" onClick=${() => setEnd(s)} data-tip="Γύρισε νωρίτερα: η άδεια τελειώνει τη μέρα και ώρα που λες" data-tip-side="left">Διακοπή…<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setEnd(s)} data-tip="Δεν θα φύγει: η άδεια φεύγει ολόκληρη" data-tip-side="left">Ακύρωση…<//>`)}
    </li>`; })}</ul>` : html`<div className="empty">${view === 'now' ? 'Κανείς σε άδεια τώρα ή στις επόμενες μέρες.' : 'Κανείς δεν γύρισε από άδεια τις τελευταίες 14 μέρες.'}</div>`}</div>
    ${times && html`<${LeaveTimesDialog} st=${times} onClose=${() => setTimes(null)}/>`}
    ${end && html`<${LeaveEndDialog} st=${end} onClose=${() => setEnd(null)}/>`}
  </div>`;
}
