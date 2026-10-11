// app/AppShell: πλοήγηση, συντομεύσεις, επίπεδα (dialogs/sheets), σύνδεση με το main process
import { useCallback, useEffect, useMemo, useState } from 'react';
import { html, cx, Badge, Button, Icon, Kbd, Logo, Sheet, ToastProvider, useToast } from './ui';
import { StoreCtx, NavCtx, useStore, type StoreValue } from './store';
import { TodayScreen, RecordsScreen, StrengthScreen, HkaiScreen, HistoryScreen, TemplatesScreen, CommandPalette } from './screens/other';
import { DiagScreen } from './screens/diag';
import { PeopleScreen, PersonSheet, DeclareStatusDialog } from './screens/people';
import { GuardScreen, OutsScreen } from './screens/guard';
import { frouraEmpty } from './sheets';
import { ExportProvider, LegendDialog } from './common';
import { addDays, dmy, dow, today as todayFn } from '../shared/dates';
import type { Boot } from '../shared/api';
import type { Command } from '../shared/commands';

const SCREENS: Record<string, [string, any, any]> = {
  home: ['Σήμερα', Icon.home, TodayScreen], people: ['Προσωπικό', Icon.people, PeopleScreen], guard: ['Υπηρεσίες', Icon.guard, GuardScreen],
  outs: ['Εξοδούχοι', Icon.out, OutsScreen], records: ['Ιατρικά & ποινές', Icon.med, RecordsScreen], strength: ['Δύναμη', Icon.strength, StrengthScreen],
  hkai: ['ΗΚΑΙ', Icon.file, HkaiScreen], history: ['Ιστορικό', Icon.history, HistoryScreen], templates: ['Templates & ρυθμίσεις', Icon.gear, TemplatesScreen],
  diag: ['Διάγνωση', Icon.gear, DiagScreen]   // κρυφή: Ctrl+Shift+D ή από την αναζήτηση
};
const NAV_MAIN = ['home', 'people', 'guard', 'outs', 'records', 'strength', 'hkai'], NAV_MORE = ['history', 'templates'];
const MOBILE_MAIN = ['home', 'people', 'guard', 'outs'], MOBILE_MORE = ['records', 'strength', 'hkai', 'history', 'templates'];

function useToday() {
  const [d, setD] = useState(todayFn());
  useEffect(() => { const t = setInterval(() => setD(todayFn()), 30000); return () => clearInterval(t); }, []);
  return d;
}

// Πλαϊνό μενού: πλήρες ή στενό (μόνο εικονίδια). Μέχρι να το αλλάξει ο χρήστης, στενό σε οθόνες κάτω από 1200px.
const NAV_KEY = 'grafeio.nav';
function useRail() {
  const read = () => { try { return localStorage.getItem(NAV_KEY); } catch { return null; } };
  const auto = () => window.innerWidth < 1200;
  const [rail, setRail] = useState(() => { const v = read(); return v ? v === 'rail' : auto(); });
  useEffect(() => {
    const f = () => { if (!read()) setRail(auto()); };
    window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, []);
  const toggle = useCallback(() => setRail(r => { try { localStorage.setItem(NAV_KEY, r ? 'full' : 'rail'); } catch { /* χωρίς αποθήκευση */ } return !r; }), []);
  return [rail, toggle] as const;
}

function Root({ boot: initial }: { boot: Boot }) {
  const toast = useToast();
  const [boot, setBoot] = useState(initial);
  const [state, setState] = useState(initial.state);
  const [audit, setAudit] = useState(initial.audit);
  const today = useToday();
  const refresh = useCallback(async () => { const b = await window.api.boot(); setBoot(b); setState(b.state); setAudit(b.audit); }, []);
  // όταν αλλάξει η μέρα (εφαρμογή ανοιχτή από χθες) ο main γράφει τις λήξεις· φέρνουμε τη νέα κατάσταση
  useEffect(() => { refresh(); }, [today]);
  const run = useCallback(async (cmd: Command, okText?: string | false) => {
    const r = await window.api.run(cmd);
    if (!r.ok) { toast({ text: html`<span><b>Δεν έγινε.</b> ${r.error}</span>` }); return false; }
    setState(r.state); setAudit(r.audit);
    if (okText !== false && (okText || r.text)) toast({ text: okText || r.text });
    return true;
  }, [toast]);
  const undo = useCallback(async () => {
    const r = await window.api.undo();
    if (!r.ok) { toast({ text: r.error }); return; }
    setState(r.state); setAudit(r.audit); toast({ text: r.text });
  }, [toast]);
  const store = useMemo<StoreValue>(() => ({ state, audit, boot, today, tomorrow: addDays(today, 1), run, undo, refresh }), [state, audit, boot, today, run, undo, refresh]);
  return html`<${StoreCtx.Provider} value=${store}><${Shell}/><//>`;
}

function Shell() {
  const { state, today, tomorrow, undo, boot } = useStore();
  const [route, setRoute] = useState<{ view: string; params: Record<string, any> }>({ view: 'home', params: {} });
  const [layer, setLayer] = useState<any>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [rail, toggleRail] = useRail();
  const go = useCallback((view: string, params?: Record<string, any>) => { setRoute(r => ({ view, params: { ...(view === r.view ? r.params : {}), ...(params || {}) } })); setLayer(null); setPersonId(null); window.scrollTo(0, 0); }, []);
  const setParams = useCallback((params: Record<string, any>) => setRoute(r => ({ view: r.view, params: { ...r.params, ...params } })), []);
  const declare = useCallback((data: any) => setLayer({ kind: 'declare', data }), []);
  const openPerson = useCallback((id: number) => { setPersonId(id); setLayer(null); }, []);
  const nav = useMemo(() => ({ view: route.view, params: { ...route.params, person: personId }, go, set: setParams, declare, openPerson }), [route, personId, go, setParams, declare, openPerson]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey; const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || '');
      if (mod && (k === 'k' || k === 'κ')) { e.preventDefault(); setLayer({ kind: 'palette' }); }
      else if (mod && (k === 'n' || k === 'ν')) { e.preventDefault(); setLayer({ kind: 'declare', data: {} }); }
      else if (mod && (k === 'z' || k === 'ζ') && !typing) { e.preventDefault(); undo(); }
      else if (mod && e.shiftKey && (k === 'd' || k === 'δ')) { e.preventDefault(); go('diag'); }
      else if (mod && (k === 'b' || k === 'β')) { e.preventDefault(); toggleRail(); }
      else if (mod && (k === 'f' || k === 'φ')) {   // αναζήτηση στη λίστα της οθόνης, αλλιώς η γενική
        e.preventDefault(); const el = document.querySelector('.main input[type="search"]') as HTMLInputElement | null;
        if (el) { el.focus(); el.select(); } else setLayer({ kind: 'palette' });
      }
      else if (e.key === 'F1') { e.preventDefault(); setLayer({ kind: 'legend' }); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [undo, go, toggleRail]);
  const Screen = SCREENS[route.view][2];
  const emptyTomorrow = state.people.some(p => p.active) ? frouraEmpty(state, tomorrow) : 0;
  const pending = state.statuses.filter(s => s.pending).length;
  const navItem = (v: string, inRail = false) => {
    const [label, icon] = SCREENS[v]; const n = v === 'guard' ? emptyTomorrow : v === 'records' ? pending : 0;
    const tip = v === 'guard' ? 'Κενές θέσεις στις υπηρεσίες αύριο' : 'Ποινές που αιτούνται';
    return html`<button key=${v} type="button" className="navbtn" aria-current=${route.view === v ? 'page' : undefined} aria-label=${inRail ? label + (n > 0 ? ' (' + n + ')' : '') : undefined}
      data-tip=${inRail ? label + (n > 0 ? ': ' + n + ' ' + (v === 'guard' ? 'κενές θέσεις αύριο' : 'ποινές αιτούνται') : '') : undefined} data-tip-side=${inRail ? 'right' : undefined} onClick=${() => go(v)}>
      ${icon}<span className="navbtn__lbl">${label}</span>${n > 0 && html`<${Badge} tone=${v === 'guard' ? 'bad' : 'warn'} data-tip=${inRail ? undefined : tip} data-tip-side="left">${n}<//>`}</button>`;
  };
  return html`<${NavCtx.Provider} value=${nav}><${ExportProvider}>
    <div className=${cx('shell', rail && 'is-rail')}>
      <header className="topbar">
        <div className="brand"><${Logo} size=${30}/><span>Γραφείο Ίλης <small>${state.settings.unit[2] || ''}</small></span></div>
        <button type="button" className="searchbtn" aria-label="Αναζήτηση" data-tip="Βρες άνθρωπο ή ενέργεια από οπουδήποτε (Ctrl+K)" onClick=${() => setLayer({ kind: 'palette' })}>${Icon.search}<span>Αναζήτηση προσώπου ή ενέργειας…</span><${Kbd}>Ctrl K<//></button>
        <div className="topbar__right">
          ${boot.version === 'dev' && html`<span className="mockchip" data-tip="Δοκιμή στον browser: φανταστικά δεδομένα, τίποτα δεν αποθηκεύεται" data-tip-side="left">Δοκιμαστικό<//>`}
          <${Button} variant="ghost" size="sm" data-tip="Τι σημαίνει κάθε κωδικός (F1)" data-tip-side="left" onClick=${() => setLayer({ kind: 'legend' })}>Υπόμνημα<//>
          <${Button} variant="outline" size="sm" data-tip="Αναίρεση τελευταίας ενέργειας (Ctrl+Z)" data-tip-side="left" onClick=${() => undo()}>Αναίρεση<//>
          <span className="today-lbl">Σήμερα: <b>${dow(today)} ${dmy(today)}</b></span>
        </div>
      </header>
      <nav className="sidenav" aria-label="Κύριο μενού">${NAV_MAIN.map(v => navItem(v, rail))}<div className="sidenav__sep"></div>${NAV_MORE.map(v => navItem(v, rail))}
        <button type="button" className="navbtn sidenav__toggle" aria-expanded=${!rail} aria-label=${rail ? 'Άνοιγμα μενού' : undefined} data-tip=${rail ? 'Άνοιγμα μενού (Ctrl+B)' : 'Μόνο εικονίδια, για περισσότερο χώρο (Ctrl+B)'} data-tip-side=${rail ? 'right' : undefined} onClick=${toggleRail}>${rail ? Icon.expand : Icon.collapse}<span className="navbtn__lbl">Σύμπτυξη μενού</span></button></nav>
      <main className="main"><${Screen} key=${route.view}/></main>
    </div>
    <nav className="bottomnav" aria-label="Κύριο μενού">
      ${MOBILE_MAIN.map(v => html`<button key=${v} type="button" aria-current=${route.view === v ? 'page' : undefined} onClick=${() => go(v)}>${SCREENS[v][1]}${SCREENS[v][0]}${v === 'guard' && emptyTomorrow > 0 && html`<span className="dot">${emptyTomorrow}</span>`}</button>`)}
      <button type="button" aria-current=${MOBILE_MORE.includes(route.view) ? 'page' : undefined} onClick=${() => setLayer({ kind: 'more' })}>${Icon.more}Άλλα</button>
    </nav>
    ${personId != null && html`<${PersonSheet} pid=${personId} onClose=${() => setPersonId(null)}/>`}
    ${layer && layer.kind === 'declare' && html`<${DeclareStatusDialog} initial=${layer.data || {}} onClose=${() => setLayer(null)}/>`}
    ${layer && layer.kind === 'legend' && html`<${LegendDialog} onClose=${() => setLayer(null)}/>`}
    ${layer && layer.kind === 'palette' && html`<${CommandPalette} onClose=${() => setLayer(null)}/>`}
    ${layer && layer.kind === 'more' && html`<${Sheet} title=${html`<h2 style=${{ fontSize: '18px' }}>Άλλα</h2>`} onClose=${() => setLayer(null)}><div className="morelist">${MOBILE_MORE.map(v => navItem(v))}</div><//>`}
  <//><//>`;
}

export function App({ boot }: { boot: Boot }) {
  return html`<${ToastProvider}><${Root} boot=${boot}/><//>`;
}
