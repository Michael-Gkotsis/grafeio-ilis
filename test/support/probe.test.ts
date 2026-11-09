// Unit tests of the render probe (test/support/probe.ts): press, effects, state, seeding, and that it is inert when off.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installBrowserStubs } from './screens-harness';
import { createElement, useEffect, useState } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { captureDocumentListeners, startSession, textOf, type Session } from './probe';

vi.mock('react', async orig => (await import('./ssr-shims')).mockReactProbe(orig));
vi.mock('react/jsx-runtime', async orig => (await import('./ssr-shims')).mockJsxRuntime(orig));

beforeAll(() => { installBrowserStubs(); });
let session: Session | null = null;
afterEach(() => { session?.stop(); session = null; });

function Counter({ log }: { log: string[] }) {
  const [n, setN] = useState(0);
  const [text] = useState('');
  useEffect(() => { log.push('effect'); setN(5); }, []);
  return createElement('div', null,
    createElement('button', { onClick: () => setN((v: number) => v + 1) }, 'plus ', n),
    createElement('button', { disabled: true, onClick: () => log.push('disabled') }, 'off'),
    createElement('input', { value: text, onChange: (e: { target: { value: string } }) => log.push(e.target.value) }));
}

describe('render probe', () => {
  it('keeps state between renders, runs effects on request and presses enabled buttons', () => {
    const log: string[] = [];
    session = startSession(() => renderToStaticMarkup(createElement(Counter, { log })));
    expect(session.render()).toContain('plus 0');
    session.flushEffects();
    expect(log).toEqual(['effect']);
    expect(session.render()).toContain('plus 5');
    session.press('plus 5');
    expect(session.render()).toContain('plus 6');
    expect(() => session!.press('off')).toThrow(/0 enabled/);
    session.type('abc');
    expect(session.textFields()).toBe(1);
    expect(log).toEqual(['effect', 'abc']);
    log.pop();
    expect(log).toEqual(['effect']);
  });
  it('finds a handler by aria-label and calls other handlers such as onChange', () => {
    const calls: string[] = [];
    session = startSession(() => renderToStaticMarkup(createElement('button', { 'aria-label': 'Κλείσιμο', onClick: () => calls.push('x') })));
    session.render();
    session.press('Κλείσιμο');
    expect(calls).toEqual(['x']);
  });
  it('seedState overwrites the first value of a matching useState', () => {
    function Box() { const [q] = useState(''); return createElement('p', null, 'q=' + q); }
    session = startSession(() => renderToStaticMarkup(createElement(Box)));
    expect(session.render()).toContain('q=<');
    session.seedState(v => v === '', 'εκτ');
    expect(session.render()).toContain('q=εκτ');
    expect(() => session!.seedState(v => v === 'nope', 'x')).toThrow(/no useState/);
  });
  it('records elements made by the TSX runtime too', () => {
    const calls: string[] = [];
    session = startSession(() => renderToStaticMarkup(jsx('button', { onClick: () => calls.push('jsx'), children: 'go' })));
    session.render();
    session.press('go');
    expect(calls).toEqual(['jsx']);
  });
  it('captures document listeners so a key can be pressed, and puts the stub back', () => {
    const seen: string[] = [];
    const keys = captureDocumentListeners();
    const on = (e: { key?: string }) => seen.push(String(e.key));
    document.addEventListener('keydown', on as never);
    keys.dispatch('keydown', { key: 'Escape' });
    document.removeEventListener('keydown', on as never);
    keys.dispatch('keydown', { key: 'x' });
    keys.restore();
    expect(seen).toEqual(['Escape']);
  });
  it('is inert when no session is active', () => {
    expect(renderToStaticMarkup(createElement(Counter, { log: [] }))).toContain('plus 0');
  });
  it('textOf flattens strings, numbers and nested elements', () => {
    expect(textOf(['a', 1, null, false, { props: { children: ['b', { props: { children: 'c' } }] } }])).toBe('a1bc');
  });
});
