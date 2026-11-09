// Harness for the screen HTML snapshot tests (test/screens-*.test.ts).
//
// Purpose: render any renderer screen, tab or dialog to static HTML (react-dom/server) with the same context providers
//   the app gives it (store, nav, prefs, toast, export), on deterministic data and a frozen clock.
// Does NOT: run effects (SSR never does), click anything, measure layout, or touch src/. No jsdom/happy-dom.
// Why: the rewrite moves every screen from htm to TSX and into Feature-Sliced folders; each structural PR must render
//   IDENTICAL HTML, and these snapshots are the net that proves it (CLAUDE.md, "identical screen HTML snapshots").
// Owner layer: test support only.
// Covering test: test/screens-main.test.ts, test/screens-dialogs-*.test.ts.
//
// Test-side shims (kept here so no src/ logic changes):
//   - `mockReact` (ssr-shims.ts, used in vi.mock('react')): React's server renderer throws without
//     `getServerSnapshot` for useSyncExternalStore (clock.ts, pending.ts use it client-only). The shim passes
//     `getSnapshot` as the server one.
//   - `mockReactDom` (ssr-shims.ts, used in vi.mock('react-dom')): Dialog/Sheet use createPortal(document.body),
//     which the server renderer cannot do; the shim renders the portal content in place, so the dialog markup
//     appears in the snapshot.
//   - minimal `window`/`document`/`localStorage`/`matchMedia` stubs (state read at first render only).
import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { benchState } from '../../bench/state';
import { mockApi } from '../../src/renderer/mockApi';
import { NavCtx, StoreCtx, type Nav, type StoreValue } from '../../src/renderer/store';
import { DEFAULT_PREFS, PrefsCtx, type Prefs } from '../../src/renderer/prefs';
import { ToastProvider } from '../../src/renderer/ui';
import { clockChanged } from '../../src/renderer/clock';
import { App } from '../../src/renderer/app';
import { ExportProvider } from '../../src/renderer/common';
import { addDays, type ISODate } from '../../src/shared/dates';
import { SCREEN_AMBIENT, applyAmbient } from '../../src/core/ambient';
import { type AppState, type AuditEntry, type Status } from '../../src/shared/domain';
import type { UserLists } from '../../src/shared/ranks';
import type { Report } from '../../src/shared/reports';
import { apply, type Command } from '../../src/shared/commands';
import type { Boot } from '../../src/shared/api';

/** Frozen "now": 2026-11-09 11:00 in the app zone (Europe/Athens, UTC+2 in November). Instant, so TZ-independent. */
export const FROZEN_NOW = '2026-11-09T09:00:00.000Z';
/** The app's "today" and "tomorrow" under FROZEN_NOW. */
export const TODAY: ISODate = '2026-11-09';
export const TOMORROW: ISODate = addDays(TODAY, 1);

type Params = Record<string, unknown>;

/** Minimal in-memory localStorage; `seed` puts keys the app itself would have written (e.g. `grafeio.prefs`). */
export function installBrowserStubs(seed: Record<string, string> = {}): void {
  const data = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(),
  };
  const noop = () => {};
  const root = { style: {}, setAttribute: noop, removeAttribute: noop, classList: { add: noop, remove: noop, toggle: noop } };
  const doc = {
    documentElement: root, body: { ...root, appendChild: noop }, title: '', activeElement: null,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null,
  };
  const media = (query: string) =>
    ({ matches: false, media: query, addEventListener: noop, removeEventListener: noop });
  Object.assign(globalThis, {
    window: globalThis, document: doc, localStorage: storage,
    matchMedia: media, innerWidth: 1600, innerHeight: 900, scrollTo: noop,
    addEventListener: noop, removeEventListener: noop,
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
  });
}

/** Deterministic data: 12 soldiers, 60 days of history up to TODAY, 7 days of duties ahead (bench/state.ts), plus
 *  notes (every filter of the Σημειώσεις screen has a row) and a health note, which bench/state.ts does not create. */
export function snapshotState(): AppState {
  const base = benchState({ n: 12, days: 60, fut: 7, end: TODAY });
  const lists: UserLists = { medKinds: { add: [{ name: 'ΕΛ. ΞΥΡΙΣΜΑΤΟΣ', like: 'EY', note: true }] } };
  const cadreId = base.cadreList[0].id;
  const cmds: Command[] = [
    { t: 'addNote', note: { text: 'Γενική σημείωση της ημέρας' } },
    { t: 'addNote', note: { text: 'Υπενθύμιση για σήμερα', rem: TODAY, star: true } },
    { t: 'addNote', note: { text: 'Υπενθύμιση για αύριο', rem: TOMORROW } },
    { t: 'addNote', note: { text: 'Σημείωση για στρατιώτη', pids: [2] } },
    { t: 'addNote', note: { text: 'Σημείωση για στέλεχος', cids: [cadreId] } },
    { t: 'addNote', note: { text: 'Ολοκληρωμένη σημείωση', pids: [3] } },
    { t: 'weaponOut', pids: [2, 3], reason: 'ΕΚΠ', day: TODAY, time: '09:30' },
  ];
  let seq = 0;
  const ctx = { today: TODAY, newId: () => 'z' + ++seq };
  const start: AppState = { ...base, settings: { ...base.settings, lists } };
  const noted = cmds.reduce<AppState>((acc, c) => apply(acc, c, ctx).state, start);
  const doneId = noted.notes[noted.notes.length - 1].id;
  const done = apply(noted, { t: 'doneNote', id: doneId, done: true }, ctx).state;
  const health: Status = {
    id: 'health1', pid: 4, type: 'EY', kind: 'ΕΛ. ΞΥΡΙΣΜΑΤΟΣ', from: addDays(TODAY, -10), to: addDays(TODAY, 20),
  };
  // one template and one form of the Έντυπα screen (people list), so the list/edit/run views have rows
  const report: Report = {
    id: 'rep1', name: 'ΛΙΣΤΑ ΔΟΚΙΜΗΣ', tpl: 'tpl1', kind: 'people', sheet: 'Φύλλο1', head: 1,
    cols: [{ c: 1, f: 'last' }, { c: 2, f: 'first' }], cells: [], pick: { from: 'all', mode: 'all' }, sort: 'name',
    day: 'today', out: 'file',
  };
  const reportTpls = [{ id: 'tpl1', name: 'ΛΙΣΤΑ ΔΟΚΙΜΗΣ', file: 'lista-dokimis.xlsx' }];
  const settings = { ...done.settings, reportTpls, reports: [report] };
  return { ...done, settings, statuses: [...done.statuses, health] };
}

/** A few history rows with fixed ids and times (the History screen and undo button read them). */
export const AUDIT: AuditEntry[] = [
  { id: 3, at: '10:40', day: TODAY, text: 'Δήλωση: άδεια', files: [], source: 'app', undoable: true, undone: false },
  { id: 2, at: '09:15', day: TODAY, text: 'Έξοδος όπλων', files: [], source: 'app', undoable: true, undone: false },
  {
    id: 1, at: '18:02', day: addDays(TODAY, -1), text: 'Νέα σημείωση', files: [], source: 'app',
    undoable: false, undone: false,
  },
];

/** Everything a rendered tree needs; build once per test file (the state build is the slow part). */
export interface World { state: AppState; boot: Boot; store: StoreValue }

export async function makeWorld(): Promise<World> {
  const api = mockApi();
  (globalThis as unknown as { api: unknown }).api = api;
  const base = await api.boot();
  const state = snapshotState();
  const boot: Boot = { ...base, state, audit: AUDIT, sessionStart: 3 };
  const asyncNo = async () => {};
  const store: StoreValue = {
    state, audit: AUDIT, boot, today: TODAY, tomorrow: TOMORROW,
    run: async () => null, undo: asyncNo, refresh: asyncNo, sync: asyncNo,
    undoMark: () => ({ label: 'Αναίρεση', fn: () => {}, undoId: 3 }),
  };
  return { state, boot, store };
}

/** Same side effects Root has before it renders screens (clock zone, unit words, namesakes). */
export function primeGlobals(state: AppState): void {
  applyAmbient(state, SCREEN_AMBIENT);
  // clock.ts caches "now" in a module variable at import time (real time); re-read it under the frozen clock
  clockChanged();
}

const noop = () => {};
/** Nav as the shell gives it: `params` is what selects a tab; every callback is a no-op (nothing is clicked). */
export function navOf(view: string, params: Params = {}): Nav {
  return {
    view, params, go: noop, set: noop, declare: noop, note: noop, openPerson: noop, openCadre: noop,
    guard: (go: () => void) => go(), setDirty: noop,
  };
}

/**
 * Server-render `element` inside the app providers. `prefs` overrides display preferences; `nav` replaces callbacks of the
 * no-op Nav (behaviour tests pass spies, e.g. `{ go: spy }`).
 */
export function renderIn(
  world: World, view: string, params: Params, element: ReactElement, prefs: Partial<Prefs> = {},
  nav: Partial<Nav> = {},
): string {
  primeGlobals(world.state);
  const p = { ...DEFAULT_PREFS, ...prefs };
  const tree = createElement(ToastProvider, null,
    createElement(StoreCtx.Provider, { value: world.store },
      createElement(PrefsCtx.Provider, { value: { prefs: p, set: noop, rail: p.nav === 'rail' } },
        createElement(NavCtx.Provider, { value: { ...navOf(view, params), ...nav } },
          createElement(ExportProvider, null, element)))));
  return prettyHtml(renderToStaticMarkup(tree));
}

/**
 * The whole app shell (menu, top bar, bottom bar, Home screen) as `App` renders it for `boot`. `prefs` is written to
 * localStorage first, exactly where loadPrefs() reads it.
 */
export function renderApp(world: World, prefs: Partial<Prefs> = {}): string {
  installBrowserStubs({ 'grafeio.prefs': JSON.stringify({ ...DEFAULT_PREFS, ...prefs }) });
  return prettyHtml(renderToStaticMarkup(createElement(App, { boot: world.boot })));
}

/** Convenience: render a component by reference. */
export const renderComponent = (
  world: World, view: string, params: Params, Comp: ComponentType<never>, props: object = {},
): string =>
  renderIn(world, view, params, createElement(Comp as ComponentType<object>, props));

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'col', 'path', 'circle', 'rect', 'line', 'polyline']);

/**
 * One tag or text run per line, indented by depth. Only whitespace OUTSIDE text is added, so the diff of a changed
 * label or class name is a single readable line. Reversible: removing the added newlines and indent gives the original.
 */
export function prettyHtml(markup: string): string {
  const tokens = markup.match(/<[^>]+>|[^<]+/g) ?? [];
  const lines: string[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (!token.startsWith('<')) { lines.push('  '.repeat(depth) + token); continue; }
    const closing = token.startsWith('</');
    const name = (token.match(/^<\/?([a-zA-Z0-9-]+)/)?.[1] ?? '').toLowerCase();
    if (closing) depth = Math.max(0, depth - 1);
    lines.push('  '.repeat(depth) + token);
    if (!closing && !token.endsWith('/>') && !VOID.has(name)) depth += 1;
  }
  return lines.join('\n') + '\n';
}

/** Freeze Date only (timers stay real so vitest itself keeps working). Call from beforeAll. */
export function freezeClock(): void {
  // The Settings > clock tab prints the OS zone on purpose ("Ώρα Windows"), so the OS zone is pinned too.
  process.env.TZ = 'Europe/Athens';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FROZEN_NOW));
}

/** Silence React's known SSR-only warnings (htm keys, useLayoutEffect, `stroke-width`); real errors still print. */
export function quietKnownWarnings(): void {
  const original = console.error.bind(console);
  const known = new RegExp([
    'Each child in a list', 'useLayoutEffect does nothing', 'Invalid DOM property', 'Invalid value for prop',
    'React does not recognize',
  ].join('|'));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && known.test(args[0])) return;
    original(...args);
  });
}

/** Path of one snapshot file, relative to the test file (all tests live in test/). */
export const snapPath = (kind: 'screen' | 'tab' | 'dialog', name: string): string =>
  './__snapshots__/screens/' + kind + '-' + name + '.html';
