// Module shims for the screen HTML snapshot tests, used from vi.mock factories (see screens-harness.ts header).
// Kept in its own file with NO react imports: a vi.mock factory may not depend on the module it mocks.
// Does NOT: change any src/ behavior; only lets the server renderer accept two client-only APIs.

type Dict = Record<string, unknown>;
type Original = () => Promise<Dict>;

/** React shim for vi.mock('react'): useSyncExternalStore gets a server snapshot (see header). */
export async function mockReact(orig: Original): Promise<Dict> {
  const real = await orig();
  const useSyncExternalStore = (subscribe: unknown, get: () => unknown, getServer?: () => unknown) =>
    (real.useSyncExternalStore as Function)(subscribe, get, getServer ?? get);
  const def = real.default as Dict | undefined;
  return {
    ...real, useSyncExternalStore,
    ...(def ? { default: { ...def, useSyncExternalStore } } : {}),
  };
}

/** react-dom shim for vi.mock('react-dom'): a portal renders its children in place (see header). */
export async function mockReactDom(orig: Original): Promise<Dict> {
  const real = await orig();
  const createPortal = (children: unknown) => children;
  const def = real.default as Dict | undefined;
  return { ...real, createPortal, ...(def ? { default: { ...def, createPortal } } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// Probe shims: let a test "use" a server-rendered tree without a DOM (click a button, run effects, re-render).
//
// Purpose: replace tests that grep the source text for "the dialog asks before leaving" / "Ctrl+K opens the sheet" with
//   tests that do the thing: render, press, render again, assert on the HTML or on the callbacks that were called.
// Does NOT: emulate a browser (no layout, no real events, no refs). State lives in a map keyed by
//   (component type, n-th instance of that type in the pass, hook number), so a press that swaps a subtree (a new tab,
//   an opened dialog) cannot hand one component the state of another.
// Inactive (`globalThis[PROBE_KEY]` unset) every shim behaves exactly like React, so the snapshot tests are unaffected.
// Covering test: test/support/probe.test.ts.

/** Where test/support/probe.ts parks the active probe (read by the shims below). */
export const PROBE_KEY = '__grafeioProbe';

/** One element created during the last render pass (host element or component), with the props it got. */
export interface Recorded { type: unknown; props: Record<string, unknown> }
/** An effect registered during the last render pass. */
export interface RecordedEffect { fn: () => unknown; deps: unknown[] | undefined }
/** Hook state of the active probe. */
export interface ProbeData {
  /** useState values by key `typeId#instance:hook`. */
  states: Map<string, unknown>;
  /** useRef objects by the same keys. */
  refs: Map<string, { current: unknown }>;
  /** The first value each hook was created with, same keys, in creation order (used by seedState). */
  inits: Map<string, unknown>;
  effects: RecordedEffect[]; recorded: Recorded[];
  /** `typeId#instance` of every component that rendered in this pass: the rest were unmounted and lose their state. */
  visited: Set<string>;
  /** Instances of each component type rendered so far in this pass. */
  instances: Map<number, number>;
  /** The component function that is running right now, and its hook counter. */
  current: { id: number; instance: number; hook: number } | null;
  /** Hooks called outside any wrapped component (an element made before the probe started). */
  loose: number;
}
const active = (): ProbeData | undefined => (globalThis as unknown as Record<string, ProbeData | undefined>)[PROBE_KEY];

const withChildren = (props: Record<string, unknown> | null, kids: unknown[]): Record<string, unknown> =>
  ({ ...(props ?? {}), ...(kids.length ? { children: kids.length === 1 ? kids[0] : kids } : {}) });

type Fn = (...a: unknown[]) => unknown;
// Shared by every session of the test file: htm caches the elements it builds, so an element made in one test can be
// rendered in another and must find the wrapper (and the probe that is active NOW), not one bound to a finished session.
const typeIds = new Map<unknown, number>();
const wrappers = new WeakMap<object, unknown>();

/** Function components get a wrapper that tells the active probe which component is running (class components: as is). */
function wrapType(type: unknown): unknown {
  if (typeof type !== 'function' || (type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) return type;
  const cached = wrappers.get(type as object);
  if (cached) return cached;
  if (!typeIds.has(type)) typeIds.set(type, typeIds.size + 1);
  const id = typeIds.get(type)!;
  const wrapper = function (this: unknown, ...args: unknown[]) {
    const probe = active();
    if (!probe) return (type as Fn).apply(this, args);
    const instance = probe.instances.get(id) ?? 0;
    probe.instances.set(id, instance + 1);
    probe.visited.add(`${id}#${instance}`);
    probe.current = { id, instance, hook: 0 };
    try { return (type as Fn).apply(this, args); } finally { probe.current = null; }
  };
  Object.defineProperty(wrapper, 'name', { value: (type as { name: string }).name });
  wrappers.set(type as object, wrapper);
  wrappers.set(wrapper, wrapper);   // an element that already carries a wrapper is not wrapped twice
  return wrapper;
}

/** react shim for vi.mock('react') that adds recording and stateful hooks while a probe is active. */
export async function mockReactProbe(orig: Original): Promise<Dict> {
  const base = await mockReact(orig);
  const baseCreate = base.createElement as Fn;
  const baseState = base.useState as (init: unknown) => unknown;
  const baseEffect = base.useEffect as (fn: () => unknown, deps?: unknown[]) => void;
  const baseRef = base.useRef as (init: unknown) => unknown;
  const createElement = (type: unknown, props: Record<string, unknown> | null, ...kids: unknown[]) => {
    const probe = active();
    if (!probe) return baseCreate(type, props, ...kids);
    probe.recorded.push({ type, props: withChildren(props, kids) });
    return baseCreate(wrapType(type), props, ...kids);
  };
  const useState = (init: unknown) => {
    const probe = active();
    if (!probe) return baseState(init);
    const key = probe.current ? `${probe.current.id}#${probe.current.instance}:${probe.current.hook++}` : `loose:${probe.loose++}`;
    if (!probe.states.has(key)) {
      const start = typeof init === 'function' ? (init as () => unknown)() : init;
      probe.states.set(key, start);
      probe.inits.set(key, start);
    }
    const set = (next: unknown) => {
      probe.states.set(key, typeof next === 'function' ? (next as (v: unknown) => unknown)(probe.states.get(key)) : next);
    };
    return [probe.states.get(key), set];
  };
  // A ref keeps its object between passes (the app keeps "unsaved draft" flags in refs), like state does.
  const useRef = (init: unknown) => {
    const probe = active();
    if (!probe) return baseRef(init);
    const key = probe.current ? `${probe.current.id}#${probe.current.instance}:${probe.current.hook++}` : `loose:${probe.loose++}`;
    if (!probe.refs.has(key)) probe.refs.set(key, { current: init });
    return probe.refs.get(key);
  };
  const useEffect = (fn: () => unknown, deps?: unknown[]) => {
    const probe = active();
    if (!probe) return baseEffect(fn, deps);
    probe.effects.push({ fn, deps });
    return undefined;
  };
  const patch = { createElement, useState, useEffect, useRef };
  const def = base.default as Dict | undefined;
  return { ...base, ...patch, ...(def ? { default: { ...def, ...patch } } : {}) };
}

/** react/jsx-runtime and react/jsx-dev-runtime shim: records the elements TSX screens create (htm screens do not use it). */
export async function mockJsxRuntime(orig: Original): Promise<Dict> {
  const real = await orig();
  const record = (name: string) => (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
    const probe = active();
    if (!probe) return (real[name] as Fn)(type, props, ...rest);
    probe.recorded.push({ type, props });
    return (real[name] as Fn)(wrapType(type), props, ...rest);
  };
  return { ...real, jsx: record('jsx'), jsxs: record('jsxs'), ...(real.jsxDEV ? { jsxDEV: record('jsxDEV') } : {}) };
}
