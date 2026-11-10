// The on-demand code of the app: one `import()` per screen module, and the screen / dialog each route or overlay takes.
// Purpose: a single typed table of importers, read by routes.ts (React.lazy for each screen), Overlays.tsx (lazy cards
//   and dialogs) and prefetch.ts (loads the same modules while the app is idle).
// Does NOT: decide when to load (prefetch.ts does) or know any route (routes.ts and Overlays.tsx pick `component`).
// Owner layer: renderer/app (architecture). Why: the first JS file used to hold every screen (1.0 MB, all parsed before
//   «Σήμερα» could appear); now only the Σήμερα screen and the shell are static (Phase 5.1b). `import()` of one module
//   returns the same promise every time, so a prefetch and a click never load a chunk twice.
// Covering test: test/lazy-routes.test.ts (every screen but «Σήμερα» has a loader that resolves to a component).
import { createElement, lazy, type ComponentType } from 'react';
import type { ScreenId } from './screenId';

/** What `React.lazy` expects from its factory. */
export type ComponentLoader = () => Promise<{ default: ComponentType }>;

/** Screens that are not part of the first JS file: every screen but «Σήμερα» (`home`). */
export type LazyScreenId = Exclude<ScreenId, 'home'>;

// Modules that have finished loading, by name. A lazy component looks here first: once prefetch (or an earlier click)
// has loaded its module it renders at once, with no Suspense fallback and no extra render pass.
const loadedModules = new Map<string, unknown>();

/** Wraps an importer so the module is remembered when it arrives. `import()` itself is cached by the browser. */
const track =
  <M>(name: string, load: () => Promise<M>) =>
  async (): Promise<M> => {
    const mod = await load();
    loadedModules.set(name, mod);
    return mod;
  };

/**
 * One importer per screen module, keyed by the name prefetch.ts uses. Several screens share a module (Υπηρεσίες and
 * Εξοδούχοι live in guard.ts), so prefetching the module once covers all of them.
 */
export const MODULES = {
  people: track('people', () => import('../screens/people')),
  guard: track('guard', () => import('../screens/guard')),
  other: track('other', () => import('../screens/other')),
  cadre: track('cadre', () => import('../screens/cadre')),
  weapons: track('weapons', () => import('../screens/weapons')),
  notes: track('notes', () => import('../screens/notes')),
  reports: track('reports', () => import('../screens/reports')),
  settings: track('settings', () => import('../screens/settings')),
  guide: track('guide', () => import('../screens/guide')),
  diag: track('diag', () => import('../screens/diag')),
  // Opened from a button on «Σήμερα» (see screens/today.ts, which imports the same module).
  dayForms: track('dayForms', () => import('../screens/dayForms')),
};

/** Name of a module in {@link MODULES}. */
export type ModuleName = keyof typeof MODULES;
type Loaded<K extends ModuleName> = Awaited<ReturnType<(typeof MODULES)[K]>>;

/**
 * A component that lives in an on-demand module: `load` is what `React.lazy` takes, `component` is what the route or
 * overlay renders (the module's own component as soon as it is loaded, the lazy one until then).
 * @param name - module in {@link MODULES}
 * @param pick - the component inside that module
 */
function source<K extends ModuleName, P extends object>(name: K, pick: (mod: Loaded<K>) => ComponentType<P>) {
  const load = async () => ({ default: pick((await MODULES[name]()) as Loaded<K>) });
  const Lazy = lazy(load);
  const component = function OnDemand(props: P) {
    const mod = loadedModules.get(name) as Loaded<K> | undefined;
    return createElement((mod ? pick(mod) : Lazy) as ComponentType<P>, props);
  };
  return { load, component };
}

/** The screens, by id. `load()` resolves to `{ default: component }`; `component` is what the route renders. */
export const SCREEN_SOURCES = {
  people: source('people', (m) => m.PeopleScreen),
  cadre: source('cadre', (m) => m.CadreScreen),
  guard: source('guard', (m) => m.GuardScreen),
  outs: source('guard', (m) => m.OutsScreen),
  records: source('other', (m) => m.RecordsScreen),
  strength: source('other', (m) => m.StrengthScreen),
  hkai: source('other', (m) => m.HkaiScreen),
  weapons: source('weapons', (m) => m.WeaponsScreen),
  reports: source('reports', (m) => m.ReportsScreen),
  notes: source('notes', (m) => m.NotesScreen),
  history: source('other', (m) => m.HistoryScreen),
  templates: source('settings', (m) => m.TemplatesScreen),
  guide: source('guide', (m) => m.GuideScreen),
  diag: source('diag', (m) => m.DiagScreen),
} satisfies Record<LazyScreenId, unknown>;

/** The cards and dialogs the shell can open on top of any screen. They live in the modules of their screens. */
export const OVERLAY_SOURCES = {
  personSheet: source('people', (m) => m.PersonSheet),
  cadreSheet: source('cadre', (m) => m.CadreSheet),
  declareDialog: source('people', (m) => m.DeclareStatusDialog),
  baselineDialog: source('people', (m) => m.BaselineReviewDialog),
  noteDialog: source('notes', (m) => m.NoteDialog),
};
