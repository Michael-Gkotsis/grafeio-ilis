// app/AppShell: πλοήγηση, συντομεύσεις, επίπεδα (dialogs/sheets), σύνδεση με το main process
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Badge, Button, Icon, Kbd, Logo, Sheet, ToastProvider, useToast } from './ui';
import { StoreCtx, NavCtx, useStore, type StoreValue } from './store';
import { TodayScreen, RecordsScreen, StrengthScreen, HkaiScreen, HistoryScreen, TemplatesScreen, CommandPalette } from './screens/other';
import { DiagScreen } from './screens/diag';
import { CadreScreen } from './screens/cadre';
import { PeopleScreen, PersonSheet, DeclareStatusDialog, BaselineReviewDialog, needsBaselineReview } from './screens/people';
import { GuardScreen, OutsScreen } from './screens/guard';
import { WeaponsScreen } from './screens/weapons';
import { frouraEmpty } from './sheets';
import { ExportProvider, LegendDialog } from './common';
import { PrefsCtx, applyPrefs, load, loadPrefs, pushRecent, save, savePrefs, type Prefs, type PrefsValue } from './prefs';
import { addDays, dmy, dow, today as todayFn } from '../shared/dates';
import type { Boot, CmdResult } from '../shared/api';
import { noteNamesakes } from '../shared/domain';
import { currentEssos } from '../shared/rosterLists';
import { appLogo, appTitle } from '../shared/brand';
import { essoPersonTxt } from '../shared/esso';
import { HK, setUnitKind } from '../shared/unit';
import type { Command } from '../shared/commands';

const SCREENS: Record<string, [string, any, any]> = {
  home: ['Σήμερα', Icon.home, TodayScreen], people: ['Δυναμολόγιο', Icon.people, PeopleScreen], cadre: ['Στελέχη', Icon.cadre, CadreScreen], guard: ['Υπηρεσίες', Icon.guard, GuardScreen],
  outs: ['Εξοδούχοι', Icon.out, OutsScreen], records: ['Ιατρικά', Icon.med, RecordsScreen], strength: ['Δύναμη', Icon.strength, StrengthScreen],
  hkai: ['ΗΚΑΙ', Icon.file, HkaiScreen], weapons: ['Οπλισμός', Icon.weapon, WeaponsScreen], history: ['Ιστορικό', Icon.history, HistoryScreen], templates: ['Ρυθμίσεις', Icon.gear, TemplatesScreen],
  diag: ['Διάγνωση', Icon.gear, DiagScreen]   // κρυφή: Ctrl+Shift+D ή από την αναζήτηση
};
// το όνομα στο μενού: η ΗΚΑΙ λέγεται ΗΚΑΛ σε λόχο (Ρυθμίσεις › Μονάδα και έντυπα)
const screenName = (v: string) => (v === 'hkai' ? HK() : SCREENS[v][0]);
const NAV_MAIN = ['home', 'people', 'cadre', 'guard', 'outs', 'records', 'strength', 'hkai', 'weapons'], NAV_MORE = ['history', 'templates'];
const NAV_ALL = [...NAV_MAIN, 'templates'];   // Alt+1 … Alt+9 το κύριο μενού με αυτή τη σειρά, Alt+0 οι Ρυθμίσεις· το Ιστορικό μόνο από το μενού
// οθόνες με καρτέλες που από το μενού ανοίγουν πάντα στην πρώτη (Michael, 18/10: η ΗΚΑΙ προεπιλογή στο μενού ΗΚΑΙ)
const MENU_TAB: Record<string, string> = { hkai: 'hkTab' };
const MOBILE_MAIN = ['home', 'people', 'guard', 'outs'], MOBILE_MORE = ['cadre', 'records', 'strength', 'hkai', 'weapons', 'history', 'templates'];

function useToday() {
  const [d, setD] = useState(todayFn());
  useEffect(() => { const t = setInterval(() => setD(todayFn()), 30000); return () => clearInterval(t); }, []);
  return d;
}

// Ρυθμίσεις εμφάνισης του PC. Το μενού «auto» είναι στενό σε οθόνες κάτω από 1200px.
function usePrefsState(): PrefsValue {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1500);
  useEffect(() => { applyPrefs(prefs); savePrefs(prefs); }, [prefs]);
  useEffect(() => {
    if (prefs.nav !== 'auto') return;
    const f = () => setNarrow(window.innerWidth < 1500);
    window.addEventListener('resize', f); return () => window.removeEventListener('resize', f);
  }, [prefs.nav]);
  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs(p => ({ ...p, [k]: v })), []);
  const rail = prefs.nav === 'auto' ? narrow : prefs.nav === 'rail';
  return useMemo(() => ({ prefs, set, rail }), [prefs, set, rail]);
}

// Τι θυμάται κάθε οθόνη όταν γυρνάς από το μενού. Μετά από επανεκκίνηση: μόνο ουλαμός και ταξινόμηση του Προσωπικού.
type Route = { view: string; params: Record<string, any> };
const PEOPLE_KEY = 'grafeio.people', PEOPLE_KEEP = ['unit', 'sort'];
const pick = (o: Record<string, any>, keys: string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const sameRoute = (a: Route, b: Route) => a.view === b.view && JSON.stringify(a.params) === JSON.stringify(b.params);

function Root({ boot: initial }: { boot: Boot }) {
  const toast = useToast();
  const [boot, setBoot] = useState(initial);
  const [state, setState] = useState(initial.state);
  const [audit, setAudit] = useState(initial.audit);
  noteNamesakes(state.people);   // πατρώνυμο στους συνονόματους, πριν αποδοθούν οι οθόνες
  setUnitKind(state.settings);   // ΗΚΑΙ ή ΗΚΑΛ, Ίλη ή Λόχος στα κείμενα των οθονών
  const cur = useRef({ state: initial.state, audit: initial.audit });
  const today = useToday();
  const refresh = useCallback(async () => { const b = await window.api.boot(); cur.current = { state: b.state, audit: b.audit }; setBoot(b); setState(b.state); setAudit(b.audit); }, []);
  // Ο main στέλνει μόνο ό,τι άλλαξε: τα υπόλοιπα κρατούν την ίδια αναφορά, άρα και τα ευρετήρια (rules.ts) και τα useMemo τους
  const merge = useCallback((r: Extract<CmdResult, { ok: true }>) => {
    const state = Object.keys(r.changes).length ? { ...cur.current.state, ...r.changes } : cur.current.state;   // τίποτα δεν άλλαξε: ούτε νέα απόδοση
    const audit = r.audit || (r.newAudit.length ? [...r.newAudit, ...cur.current.audit].slice(0, 300) : cur.current.audit);
    cur.current = { state, audit }; setState(state); setAudit(audit);
    return state;
  }, []);
  // όταν αλλάξει η μέρα (εφαρμογή ανοιχτή από χθες) ο main τρέχει τις εργασίες της μέρας (λήξεις, αντίγραφο) και στέλνει
  // μόνο ό,τι άλλαξε. Όχι στο πρώτο άνοιγμα: το boot μόλις ήρθε.
  const bootDay = useRef(today);
  useEffect(() => { if (today !== bootDay.current) { bootDay.current = ''; window.api.dayCheck().then(r => { if (r.ok) merge(r); }, () => refresh()); } }, [today]);   // eslint-disable-line react-hooks/exhaustive-deps
  const run = useCallback(async (cmd: Command, okText?: string | false) => {
    const r = await window.api.run(cmd);
    if (!r.ok) { toast({ text: html`<span><b>Δεν έγινε.</b> ${r.error}</span>` }); return null; }
    const next = merge(r);
    if (okText !== false && (okText || r.text)) toast({ text: okText || r.text });
    return next;
  }, [toast, merge]);
  // μία αναίρεση τη φορά (διπλό κλικ ή κρατημένο Ctrl+Z δεν αναιρούν δύο ενέργειες)
  const undoing = useRef(false);
  const undo = useCallback(async (id?: number) => {
    if (undoing.current) return; undoing.current = true;
    try {
      const r = await window.api.undo(id);
      if (!r.ok) { toast({ text: r.error }); return; }
      merge(r); toast({ text: r.text });
    } finally { undoing.current = false; }
  }, [toast, merge]);
  const undoMark = useCallback(() => {
    const id = cur.current.audit.find(a => a.undoable && !a.undone)?.id ?? -1;
    return { label: 'Αναίρεση', fn: () => { undo(id); } };
  }, [undo]);
  const sync = useCallback(async () => { const r = await window.api.sync(); if (r.ok) merge(r); }, [merge]);
  const store = useMemo<StoreValue>(() => ({ state, audit, boot, today, tomorrow: addDays(today, 1), run, undo, undoMark, refresh, sync }), [state, audit, boot, today, run, undo, undoMark, refresh, sync]);
  return html`<${StoreCtx.Provider} value=${store}><${Shell}/><//>`;
}

function Shell() {
  const { state, today, tomorrow, undo, boot } = useStore();
  // η ΕΣΣΟ των Ρυθμίσεων (Νέα ΕΣΣΟ), αλλιώς η πιο συχνή όσων είναι σε δύναμη
  const essos = useMemo(() => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)), [state.settings.essos, state.people]);
  const [route, setRoute] = useState<Route>({ view: 'home', params: {} });
  const [layer, setLayer] = useState<any>(null);
  // Υπόμνημα (F1) και αναζήτηση (Ctrl+K) ανοίγουν από πάνω, χωρίς να κλείσουν τη δήλωση που γράφεις
  const [over, setOver] = useState<'legend' | 'palette' | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [baseLater, setBaseLater] = useState(false);
  const prefsV = usePrefsState(); const { rail } = prefsV;
  const toggleRail = useCallback(() => prefsV.set('nav', rail ? 'full' : 'rail'), [prefsV.set, rail]);
  // μνήμη ανά οθόνη (§1) και ιστορικό για το «Πίσω» (§2)
  const memory = useRef<Record<string, Record<string, any>>>({ people: load(PEOPLE_KEY, {}) });
  const [back, setBack] = useState<Route[]>([]);
  useEffect(() => { memory.current[route.view] = route.params; if (route.view === 'people') save(PEOPLE_KEY, pick(route.params, PEOPLE_KEEP)); }, [route]);
  useEffect(() => { memory.current = { people: load(PEOPLE_KEY, {}) }; }, [today]);   // νέα μέρα: οι ημερομηνίες ξεκινούν από σήμερα
  const cur = useRef({ route, back }); cur.current = { route, back };
  const moveTo = useCallback((next: Route, push: boolean) => {
    const r = cur.current.route;
    if (push && !sameRoute(r, next)) setBack(b => [...b.slice(-29), r]);
    setRoute(next); setLayer(null); setOver(null); setPersonId(null); window.scrollTo(0, 0);
  }, []);
  // από το μενού (χωρίς params): ό,τι άφησες. Με params (π.χ. από το «Σήμερα»): μόνο αυτά, για να ταιριάζουν οι αριθμοί.
  const go = useCallback((view: string, params?: Record<string, any>) => {
    const r = cur.current.route; let base = view === r.view ? r.params : params ? {} : memory.current[view] || {};
    if (!params && MENU_TAB[view]) base = { ...base, [MENU_TAB[view]]: undefined };
    moveTo({ view, params: { ...base, ...(params || {}) } }, true);
  }, [moveTo]);
  const goBack = useCallback(() => {
    const b = cur.current.back; if (!b.length) return;
    setBack(b.slice(0, -1)); moveTo(b[b.length - 1], false);
  }, [moveTo]);
  const setParams = useCallback((params: Record<string, any>) => setRoute(r => ({ view: r.view, params: { ...r.params, ...params } })), []);
  const declare = useCallback((data: any) => setLayer({ kind: 'declare', data }), []);
  const openPerson = useCallback((id: number) => { setPersonId(id); setLayer(null); pushRecent(id); }, []);
  const nav = useMemo(() => ({ view: route.view, params: { ...route.params, person: personId }, go, set: setParams, declare, openPerson }), [route, personId, go, setParams, declare, openPerson]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey; const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || '');
      if (mod && (k === 'k' || k === 'κ')) { e.preventDefault(); setOver('palette'); }
      else if (mod && (k === 'n' || k === 'ν')) { e.preventDefault(); setLayer({ kind: 'declare', data: {} }); }
      else if (mod && (k === 'z' || k === 'ζ') && !typing) { e.preventDefault(); if (!e.repeat) undo(); }
      else if (mod && e.shiftKey && (k === 'd' || k === 'δ')) { e.preventDefault(); go('diag'); }
      else if (mod && (k === 'b' || k === 'β')) { e.preventDefault(); toggleRail(); }
      else if (e.altKey && !mod && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
      else if (e.altKey && !mod && /^Digit[0-9]$/.test(e.code) && NAV_ALL[(+e.code.slice(5) + 9) % 10]) { e.preventDefault(); go(NAV_ALL[(+e.code.slice(5) + 9) % 10]); }
      else if (mod && (k === 'f' || k === 'φ')) {   // αναζήτηση στη λίστα της οθόνης, αλλιώς η γενική
        e.preventDefault(); const el = document.querySelector('.main input[type="search"]') as HTMLInputElement | null;
        if (el) { el.focus(); el.select(); } else setOver('palette');
      }
      else if (e.key === 'F1') { e.preventDefault(); setOver('legend'); }
    };
    // πλαϊνό κουμπί «πίσω» του ποντικιού
    const m = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); goBack(); } };
    document.addEventListener('keydown', h); document.addEventListener('mouseup', m);
    return () => { document.removeEventListener('keydown', h); document.removeEventListener('mouseup', m); };
  }, [undo, go, goBack, toggleRail]);
  const Screen = SCREENS[route.view][2];
  // ο τίτλος (Ρυθμίσεις › Εμφάνιση) και στη γραμμή του παραθύρου
  const title = appTitle(state.settings);
  useEffect(() => { document.title = title; }, [title]);
  const emptyTomorrow = useMemo(() => (state.people.some(p => p.active) ? frouraEmpty(state, tomorrow) : 0), [state, tomorrow]);
  const waiting = useMemo(() => state.requests.filter(r => r.leave && !r.decision && state.people.some(p => p.id === r.pid && p.active)).length, [state.requests, state.people]);
  const navItem = (v: string, inRail = false) => {
    const [, icon] = SCREENS[v]; const label = screenName(v); const n = v === 'guard' ? emptyTomorrow : v === 'hkai' ? waiting : 0;
    const tip = v === 'guard' ? 'Κενές θέσεις στις υπηρεσίες αύριο' : 'Αιτήσεις άδειας που περιμένουν απάντηση';
    const ix = NAV_ALL.indexOf(v); const key = ix < 0 || ix > 9 ? '' : String((ix + 1) % 10); const kb = key ? ' (Alt+' + key + ')' : '';
    return html`<button key=${v} type="button" className="navbtn" aria-current=${route.view === v ? 'page' : undefined} aria-label=${inRail ? label + (n > 0 ? ' (' + n + ')' : '') : undefined} aria-keyshortcuts=${key ? 'Alt+' + key : undefined}
      data-tip=${inRail ? label + (n > 0 ? ': ' + n + ' ' + (v === 'guard' ? 'κενές θέσεις αύριο' : 'αιτήσεις άδειας περιμένουν') : '') + kb : undefined} data-tip-side=${inRail ? 'right' : undefined} title=${inRail ? undefined : label + kb} onClick=${() => go(v)}>
      ${icon}<span className="navbtn__lbl">${label}</span>${n > 0 && html`<${Badge} tone=${v === 'guard' ? 'bad' : 'warn'} data-tip=${inRail ? undefined : tip} data-tip-side="left">${n}<//>`}</button>`;
  };
  return html`<${PrefsCtx.Provider} value=${prefsV}><${NavCtx.Provider} value=${nav}><${ExportProvider}>
    <div className=${cx('shell', rail && 'is-rail')}>
      <header className="topbar">
        <${Button} variant="ghost" size="icon" className="backbtn" aria-label="Πίσω" data-tip=${back.length ? 'Πίσω στο ' + screenName(back[back.length - 1].view) + ' (Alt+←)' : 'Πίσω (Alt+←)'} disabled=${!back.length} onClick=${goBack}>${Icon.back}<//>
        <div className="brand" data-tip=${'Έκδοση ' + boot.version}><${Logo} size=${30} ...${appLogo(state.settings)}/><span>${title}<small>${state.settings.unit[2] || ''}</small></span></div>
        <button type="button" className="searchbtn" aria-label="Αναζήτηση" data-tip="Βρες άνθρωπο ή ενέργεια από οπουδήποτε (Ctrl+K)" onClick=${() => setOver('palette')}>${Icon.search}<span>Αναζήτηση προσώπου ή ενέργειας…</span><${Kbd}>Ctrl K<//></button>
        ${essos && html`<span className="essochip" data-tip=${state.settings.essos ? 'Η τωρινή ΕΣΣΟ (Ρυθμίσεις › ΕΣΣΟ)' : 'ΕΣΣΟ όσων είναι σε δύναμη (από το Δυναμολόγιο)'} data-tip-side="bottom"><small>ΕΣΣΟ</small><b>${essos}</b></span>`}
        <div className="topbar__right">
          ${boot.version === 'dev' && html`<span className="mockchip" data-tip="Δοκιμή στον browser: φανταστικά δεδομένα, τίποτα δεν αποθηκεύεται" data-tip-side="left">Δοκιμαστικό<//>`}
          <${Button} variant="ghost" size="sm" data-tip="Τι σημαίνει κάθε κωδικός (F1)" data-tip-side="left" onClick=${() => setOver('legend')}>Υπόμνημα<//>
          <span className="today-lbl" aria-label=${'Σήμερα ' + dow(today) + ' ' + dmy(today)}>${dow(today)}<b>${dmy(today)}</b></span>
          <${Button} variant="outline" size="sm" data-tip="Αναίρεση τελευταίας ενέργειας (Ctrl+Z)" data-tip-side="left" onClick=${() => undo()}>Αναίρεση<//>
        </div>
      </header>
      <nav className="sidenav" aria-label="Κύριο μενού">${NAV_MAIN.map(v => navItem(v, rail))}<div className="sidenav__sep"></div>${NAV_MORE.map(v => navItem(v, rail))}
        <button type="button" className="navbtn sidenav__toggle" aria-expanded=${!rail} aria-label=${rail ? 'Άνοιγμα μενού' : undefined} data-tip=${rail ? 'Άνοιγμα μενού (Ctrl+B)' : 'Στενό μενού, για περισσότερο χώρο (Ctrl+B)'} data-tip-side=${rail ? 'right' : undefined} onClick=${toggleRail}>${rail ? Icon.expand : Icon.collapse}<span className="navbtn__lbl">${rail ? 'Άνοιγμα' : 'Σύμπτυξη μενού'}</span></button></nav>
      <main className="main"><${Screen} key=${route.view}/></main>
    </div>
    <nav className="bottomnav" aria-label="Κύριο μενού">
      ${MOBILE_MAIN.map(v => html`<button key=${v} type="button" aria-current=${route.view === v ? 'page' : undefined} onClick=${() => go(v)}>${SCREENS[v][1]}${screenName(v)}${v === 'guard' && emptyTomorrow > 0 && html`<span className="dot">${emptyTomorrow}</span>`}</button>`)}
      <button type="button" aria-current=${MOBILE_MORE.includes(route.view) ? 'page' : undefined} onClick=${() => setLayer({ kind: 'more' })}>${Icon.more}Άλλα</button>
    </nav>
    ${personId != null && html`<${PersonSheet} pid=${personId} onClose=${() => setPersonId(null)}/>`}
    ${layer && layer.kind === 'declare' && html`<${DeclareStatusDialog} initial=${layer.data || {}} onClose=${() => setLayer(null)}/>`}
    ${layer && layer.kind === 'more' && html`<${Sheet} title=${html`<h2 style=${{ fontSize: '18px' }}>Άλλα</h2>`} onClose=${() => setLayer(null)}><div className="morelist">${MOBILE_MORE.map(v => navItem(v))}</div><//>`}
    ${!baseLater && !layer && state && needsBaselineReview(state) && html`<${BaselineReviewDialog} onClose=${() => setBaseLater(true)}/>`}
    ${over === 'legend' && html`<${LegendDialog} onClose=${() => setOver(null)}/>`}
    ${over === 'palette' && html`<${CommandPalette} onClose=${() => setOver(null)}/>`}
  <//><//><//>`;
}

export function App({ boot }: { boot: Boot }) {
  return html`<${ToastProvider}><${Root} boot=${boot}/><//>`;
}
