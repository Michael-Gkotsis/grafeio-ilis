// Shared setup of the behaviour tests that replaced "read the source text" checks (Phase 0.4).
//
// Purpose: one deterministic world (the 0.3a snapshot state), the snapshot render cases by name, and small builders,
//   so each behaviour test file only states what it presses and what it expects.
// Does NOT: mock react (each test file must call vi.mock('react') with `mockReactProbe` itself: vi.mock is per file),
//   click anything, or touch src/.
// Owner layer: test support only. Covering test: the behaviour tests that import it (ux-names, notes, status-fix, ...).
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { useLeaveAsk, usePending } from '../../src/renderer/pending';
import { DEFAULT_PREFS } from '../../src/renderer/prefs';
import type { SourceBook } from '../../src/shared/api';
import { mockApi } from '../../src/renderer/shared/api/mockApi';
import * as H from './screens-harness';
import { pickRows, type Rows } from './dialog-fixtures';
import { SHELL_CASES } from './dialog-cases-shell';
import { FORMS_CASES } from './dialog-cases-forms';
import type { StoreValue } from '../../src/renderer/store';
import type { AppState } from '../../src/shared/domain';

export interface BehaviourWorld { world: H.World; rows: Rows }

/** Build the world once per test file (beforeAll). Browser stubs and the frozen clock are set here. */
export async function loadWorld(): Promise<BehaviourWorld> {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  const world = await H.makeWorld();
  const book = (await mockApi().srcRead('people')) as SourceBook;
  return { world, rows: pickRows(world, book) };
}

/** The 0.3a render case with this snapshot name (a dialog or sheet in its open state). */
export function caseNamed(name: string) {
  const hit = [...SHELL_CASES, ...FORMS_CASES].find(c => c.name === name);
  if (!hit) throw new Error('no render case ' + name);
  return hit;
}

/** Element of a render case, ready for H.renderIn. */
export const elementOf = (bw: BehaviourWorld, name: string): ReactElement => caseNamed(name).build(bw.world, bw.rows);

/** HTML of a render case (first render). */
export function renderCase(bw: BehaviourWorld, name: string): string {
  const c = caseNamed(name);
  return H.renderIn(bw.world, c.view ?? 'home', c.params ?? {}, c.build(bw.world, bw.rows));
}

/** The same world with another state (and optionally another `run`), for tests that need a specific situation. */
export function withState(world: H.World, state: AppState, store: Partial<StoreValue> = {}): H.World {
  return { ...world, state, boot: { ...world.boot, state }, store: { ...world.store, state, ...store } };
}

/**
 * Render function for the whole app shell (`App`, with the 0.3a world's boot data), optionally next to extra siblings
 * (e.g. a card that registers a pending change). Browser stubs are installed once, here: install
 * `captureDocumentListeners()` AFTER calling this and before the first flushEffects.
 */
export function appRenderer(world: H.World, ...siblings: ReactElement[]): () => string {
  H.installBrowserStubs({ 'grafeio.prefs': JSON.stringify(DEFAULT_PREFS) });
  return () => {
    H.primeGlobals(world.state);
    const tree = createElement(Fragment, null, ...siblings, createElement(App, { boot: world.boot }));
    return H.prettyHtml(renderToStaticMarkup(tree));
  };
}

/**
 * A card with an unsaved change (what `usePending(true, ...)` registers) and a probe that reads the «ask before leaving»
 * callback the app would show in its PendingBar. Put both next to the screen under test and call
 * `session.flushEffects()` once.
 */
export function pendingFixtures() {
  const discard = vi.fn();
  const seen: { asking: (() => void) | null } = { asking: null };
  const PendingCard = () => { usePending(true, { label: 'Δοκιμή', save: () => true, discard }); return null; };
  const Asker = () => { seen.asking = useLeaveAsk(); return null; };
  return { PendingCard, Asker, discard, asking: () => seen.asking };
}
