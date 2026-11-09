// "Use" a server-rendered tree without a DOM: render, press a button, run the effects, render again.
//
// Purpose: behaviour tests for what a click or a key does (a dialog asks before leaving, Ctrl+K opens a sheet, a nav
//   param opens a tab) on top of the 0.3a SSR harness, so they survive moving screens between files and htm -> TSX.
// Does NOT: lay anything out, dispatch real DOM events, or know about refs. See the "Probe shims" header in
//   ssr-shims.ts for the keying rule. The test file must mock react with `mockReactProbe` (and, when it presses
//   TSX screens, `react/jsx-runtime` with `mockJsxRuntime`).
// Owner layer: test support only. Covering test: test/support/probe.test.ts.
import { vi } from 'vitest';
import { PROBE_KEY, type ProbeData, type Recorded } from './ssr-shims';

type Event = Record<string, unknown>;

/** Visible text of a React children tree (strings and numbers; elements contribute their own children). */
export function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? textOf(props.children) : '';
}

const fakeEvent = (extra: Event = {}): Event => ({
  preventDefault: () => {}, stopPropagation: () => {}, target: {}, currentTarget: {}, ...extra,
});

/** Let promises and zero timers run (handlers like `onClick={async () => ...}`). */
export const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export interface Session {
  /** Render once; state set by earlier presses/effects is kept, effects and recorded elements are the new ones. */
  render(): string;
  /** Run the effects of the last render (timers are stubbed so no interval or timeout keeps running). */
  flushEffects(): void;
  /** Recorded elements of the last render. */
  elements(): Recorded[];
  /** Value of the first context provider of the last render whose value satisfies `match` (e.g. the app's `nav`). */
  contextValue<T>(match: (value: Record<string, unknown>) => boolean): T;
  /** Host elements (button, a, li, ...) of the last render whose handler `prop` exists and whose text matches. */
  handlers(prop: string, label: string | RegExp): Recorded[];
  /**
   * Call the `onClick` (or `prop`) of the enabled host element whose text or aria-label matches. Without `index` exactly
   * one element must match (a test never guesses); with `index` the nth match is used.
   */
  press(label: string | RegExp, opts?: { prop?: string; event?: Event; index?: number }): void;
  /**
   * Type into a text-like `<input>`/`<textarea>` of the last render (calls its onChange with the value): the nth one, or
   * the one whose aria-label is given.
   */
  type(value: string, at?: number | string): void;
  /** Number of text-like inputs of the last render. */
  textFields(): number;
  /**
   * Overwrite the state of the `nth` useState whose first value satisfies `match` (e.g. `v => v === ''` for the text
   * field of the component under test). Call after a render, then render again.
   */
  seedState(match: (initial: unknown) => boolean, value: unknown, nth?: number): void;
  /** Run the effect cleanups collected so far (unregisters listeners and pending cards) and turn the probe off. */
  stop(): void;
}

/** Start a probe session around `renderFn` (which must call renderToStaticMarkup, e.g. H.renderIn). */
export function startSession(renderFn: () => string): Session {
  const cleanups: (() => void)[] = [];
  const data: ProbeData = {
    states: new Map(), inits: new Map(), refs: new Map(), effects: [], recorded: [],
    instances: new Map(), visited: new Set(), current: null, loose: 0,
  };
  (globalThis as unknown as Record<string, ProbeData>)[PROBE_KEY] = data;
  const matches = (text: string, label: string | RegExp) => (typeof label === 'string' ? text.trim() === label : label.test(text));
  const hostWith = (prop: string, label: string | RegExp) => data.recorded.filter(r =>
    typeof r.type === 'string' && typeof r.props[prop] === 'function'
    && (matches(textOf(r.props.children), label) || matches(String(r.props['aria-label'] ?? ''), label)));
  const textFields = () => data.recorded.filter(r => (r.type === 'input' || r.type === 'textarea')
    && typeof r.props.onChange === 'function' && !['checkbox', 'radio', 'search', 'file'].includes(String(r.props.type ?? 'text')));
  return {
    render() {
      data.effects = []; data.recorded = []; data.instances = new Map(); data.visited = new Set(); data.loose = 0;
      const out = renderFn();
      // a component that did not render this time was unmounted (a closed dialog): it starts afresh when it comes back
      for (const store of [data.states, data.inits, data.refs] as Map<string, unknown>[]) {
        for (const key of [...store.keys()]) if (!key.startsWith('loose:') && !data.visited.has(key.slice(0, key.indexOf(':')))) store.delete(key);
      }
      return out;
    },
    flushEffects() {
      while (cleanups.length) cleanups.pop()!();   // like React: the previous effects clean up before the new ones run
      const run = data.effects; data.effects = [];
      const timers = vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as never);
      const timeouts = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(0 as never);
      try {
        for (const e of run) {
          const back = e.fn();
          if (typeof back === 'function') cleanups.push(back as () => void);
        }
      } finally { timers.mockRestore(); timeouts.mockRestore(); }
    },
    elements: () => data.recorded,
    contextValue<T>(match: (value: Record<string, unknown>) => boolean): T {
      const hit = data.recorded.find(r => typeof r.type === 'object' && r.props.value && typeof r.props.value === 'object' && match(r.props.value as Record<string, unknown>));
      if (!hit) throw new Error('contextValue: no provider value matches');
      return hit.props.value as T;
    },
    handlers: hostWith,
    press(label, { prop = 'onClick', event, index } = {}) {
      const found = hostWith(prop, label).filter(r => !r.props.disabled);
      if (index === undefined && found.length !== 1) throw new Error(`press(${String(label)}): ${found.length} enabled elements match`);
      const hit = found[index ?? 0];
      if (!hit) throw new Error(`press(${String(label)}): no element at index ${index}`);
      (hit.props[prop] as (e: Event) => unknown)(fakeEvent(event));
    },
    type(value, at = 0) {
      const fields = textFields();
      const hit = typeof at === 'number' ? fields[at] : fields.find(f => f.props['aria-label'] === at);
      if (!hit) throw new Error(`type: no text field ${String(at)}`);
      (hit.props.onChange as (e: Event) => unknown)(fakeEvent({ target: { value } }));
    },
    textFields: () => textFields().length,
    seedState(match, value, nth = 0) {
      const key = [...data.inits].filter(([, v]) => match(v)).map(([k]) => k)[nth];
      if (key === undefined) throw new Error('seedState: no useState with a matching first value');
      data.states.set(key, value);
    },
    stop() {
      while (cleanups.length) cleanups.pop()!();
      delete (globalThis as unknown as Record<string, unknown>)[PROBE_KEY];
    },
  };
}

export interface DocumentKeys {
  /** Call every `type` listener the app registered on `document` (e.g. dispatch('keydown', { key: 'Escape' })). */
  dispatch(type: string, event: Event): void;
  /** Put the stub's own addEventListener back. */
  restore(): void;
}

/**
 * Make `document.addEventListener` remember its listeners so a test can press a key: the shell and `useEscape` listen on
 * `document`. Install before the effects run; `restore()` in afterEach.
 */
export function captureDocumentListeners(): DocumentKeys {
  const doc = document as unknown as { addEventListener: unknown; removeEventListener: unknown };
  const saved = { add: doc.addEventListener, remove: doc.removeEventListener };
  const listeners: [string, (e: Event) => unknown][] = [];
  doc.addEventListener = (type: string, fn: (e: Event) => unknown) => { listeners.push([type, fn]); };
  doc.removeEventListener = (type: string, fn: (e: Event) => unknown) => {
    const at = listeners.findIndex(([t, f]) => t === type && f === fn);
    if (at >= 0) listeners.splice(at, 1);
  };
  return {
    dispatch: (type, event) => { for (const [t, fn] of [...listeners]) if (t === type) fn(fakeEvent(event)); },
    restore: () => { doc.addEventListener = saved.add; doc.removeEventListener = saved.remove; },
  };
}
