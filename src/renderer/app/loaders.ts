// The on-demand code of the app: one `import()` per rarely used screen module, and the screen each route takes.
// Purpose: a single typed table of importers, read by routes.ts (the component of Έντυπα, Ρυθμίσεις, Οδηγός and
//   Διάγνωση) and prefetch.ts (loads the same modules while the app is idle).
// Does NOT: decide when to load (prefetch.ts does) or know any route (routes.ts picks `component`). Every other screen
//   and card is a static import, on purpose (see the decision below).
// Owner layer: renderer/app (architecture). Why: those four screens were already lazy; the table only makes their
//   importers shared with the prefetch. `import()` of one module returns the same promise every time, so a prefetch
//   and a click never load a chunk twice.
// Covering test: test/prefetch.test.ts (every lazy screen has a source that resolves to its component).
import { createElement, lazy, type ComponentType } from 'react';
import type { ScreenId } from './screenId';

/**
 * Screens that load on demand.
 * @decision Phase 5.1b, measured: making EVERY screen lazy cut the first JS file from 1,011,203 to 419,597 bytes but
 *   gave no boot gain (first screen 441 -> 449 ms at 4x CPU, 3936 -> 3934 ms cold), and the first open before prefetch
 *   got slower by +14..41 ms (x1) and +50..190 ms (x4); the declare dialog +60 ms. So the daily screens and the cards
 *   stay eager until this is measured on a real Intel Atom. The four screens below were lazy before and prefetching
 *   them makes their first open faster (Έντυπα 126 -> 46 ms, Ρυθμίσεις 206 -> 132 ms at 4x, after prefetch).
 */
export type LazyScreenId = Extract<ScreenId, 'reports' | 'templates' | 'guide' | 'diag'>;

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

/** One importer per on-demand screen module, keyed by the name prefetch.ts uses. */
export const MODULES = {
  reports: track('reports', () => import('../screens/reports')),
  settings: track('settings', () => import('../pages/settings')),
  guide: track('guide', () => import('../pages/guide')),
  diag: track('diag', () => import('../pages/diag')),
};

/** Name of a module in {@link MODULES}. */
export type ModuleName = keyof typeof MODULES;
type Loaded<K extends ModuleName> = Awaited<ReturnType<(typeof MODULES)[K]>>;

/**
 * A component that lives in an on-demand module: `load` is what `React.lazy` takes, `component` is what the route
 * renders (the module's own component as soon as it is loaded, the lazy one until then).
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

/** The on-demand screens, by id. `load()` resolves to `{ default: component }`. */
export const SCREEN_SOURCES = {
  reports: source('reports', (m) => m.ReportsScreen),
  templates: source('settings', (m) => m.TemplatesScreen),
  guide: source('guide', (m) => m.GuideScreen),
  diag: source('diag', (m) => m.DiagScreen),
} satisfies Record<LazyScreenId, unknown>;
