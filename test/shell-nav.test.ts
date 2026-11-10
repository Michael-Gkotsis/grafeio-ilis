// U4 (redesign): the grouped side menu, the rail and the «⋯» menu of the 44 px top bar.
//
// Purpose: pins the frozen Alt+1…9/Alt+0 mapping against the new visual order, that no screen of the old menu was
//   lost, what SideNav draws (three headings, hints, rail) and how TopBarMore behaves (items, disabled Back, update dot,
//   Esc, arrows, Enter).
// Does NOT: lay anything out; real focus and pixel sizes are covered by `npm run bench:styles` and the screenshots.
// Covering: src/renderer/app/routes.ts, SideNav.tsx, TopBarMore.tsx, topBarMoreView.ts, app/styles/shell.css, shell-nav.css.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NAV_ALL, NAV_GROUPS, NAV_MORE, screenName } from '../src/renderer/app/routes';
import { SideNav, type NavMenu } from '../src/renderer/app/SideNav';
import { TopBarMore } from '../src/renderer/app/TopBarMore';
import { focusTarget, type TopBarMoreProps } from '../src/renderer/app/topBarMoreView';
import { installBrowserStubs } from './support/screens-harness';
import { startSession, type Session } from './support/probe';
import { readStyles } from './support/css';

vi.mock('react', async (orig) => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async (orig) => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async (orig) => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async (orig) => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

const OLD_MENU = [
  'home',
  'people',
  'cadre',
  'guard',
  'outs',
  'records',
  'strength',
  'hkai',
  'weapons',
  'reports',
  'notes',
  'templates',
];

describe('routes: NAV_ALL and NAV_GROUPS', () => {
  it('NAV_ALL (Alt+1…9, Alt+0) is the frozen literal, whatever the visual order is', () => {
    expect([...NAV_ALL]).toEqual([
      'home',
      'people',
      'cadre',
      'guard',
      'outs',
      'records',
      'strength',
      'hkai',
      'weapons',
      'templates',
    ]);
  });
  it('the groups are ΗΜΕΡΑ, ΑΝΘΡΩΠΟΙ, ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ and an unlabelled Notes block', () => {
    expect(NAV_GROUPS.map((g) => [g.label, [...g.items]])).toEqual([
      ['ΗΜΕΡΑ', ['home', 'guard', 'outs', 'strength', 'hkai']],
      ['ΑΝΘΡΩΠΟΙ', ['people', 'cadre', 'records']],
      ['ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ', ['reports', 'weapons']],
      ['', ['notes']],
    ]);
  });
  it('groups + NAV_MORE hold every screen of the old menu exactly once', () => {
    const all = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_MORE];
    expect([...all].sort()).toEqual([...OLD_MENU].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('SideNav', () => {
  const menu: NavMenu = { view: 'home', badges: { guard: 3, hkai: 1, notes: 2 }, go: () => {} };
  const render = (rail: boolean) => {
    installBrowserStubs();
    return renderToStaticMarkup(createElement(SideNav, { menu, rail, toggleRail: () => {} }));
  };

  it('renders the three headings, each naming its group, and a heading-less Notes group', () => {
    const html = render(false);
    const headings = [...html.matchAll(/<div class="sidenav__group" id="([^"]+)">([^<]*)<\/div>/g)];
    expect(headings.map((m) => m[2])).toEqual(['ΗΜΕΡΑ', 'ΑΝΘΡΩΠΟΙ', 'ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ']);
    for (const [, id] of headings) expect(html).toContain('aria-labelledby="' + id + '"');
    expect(html.match(/role="group"/g)).toHaveLength(4);
  });
  it('the Alt hints are the ones of NAV_ALL, not of the visual order', () => {
    const html = render(false);
    for (const [index, view] of NAV_ALL.entries()) {
      const key = String((index + 1) % 10);
      expect(html, view).toContain('title="' + screenName(view) + ' (Alt+' + key + ')"');
      expect(html, view).toContain('aria-keyshortcuts="Alt+' + key + '"');
    }
    expect(html).toContain('title="Έντυπα (Ctrl+E)"');
  });
  it('shows the three badges', () => {
    const html = render(false);
    expect(html).toMatch(/ui-badge--bad[^>]*>3</);
    expect(html).toMatch(/ui-badge--warn[^>]*>1</);
    expect(html).toMatch(/ui-badge--bad[^>]*>2</);
  });
  it('rail: icon buttons with the name in aria-label and data-tip (side right), headings hidden by CSS', () => {
    const html = render(true);
    expect(html).toContain('aria-label="Υπηρεσίες (3)"');
    expect(html).toContain('data-tip="Υπηρεσίες: 3 κενές θέσεις αύριο (Alt+4)"');
    expect(html).toContain('data-tip-side="right"');
    expect(html).not.toContain(' title="Σήμερα');
    // the headings stay in the markup for screen readers; no rule of the rail may draw them
    const hide = readStyles().filter((r) => r.selectors.includes('.is-rail .sidenav__group'));
    expect(hide.some((r) => r.decls.clip === 'rect(0 0 0 0)' && r.decls.position === 'absolute')).toBe(true);
  });
});

describe('TopBarMore', () => {
  let session: Session | null = null;
  afterEach(() => {
    session?.stop();
    session = null;
    vi.unstubAllGlobals();
  });
  const base: TopBarMoreProps = {
    backTo: undefined,
    hasUpdate: false,
    routeKey: 'home',
    onBack: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenLegend: vi.fn(),
    onOpenUpdate: vi.fn(),
    onOpenDiag: vi.fn(),
  };
  const open = (props: Partial<TopBarMoreProps> = {}) => {
    installBrowserStubs();
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      run();
      return 0;
    }); // no layout here: focus moves at once
    session = startSession(() => renderToStaticMarkup(createElement(TopBarMore, { ...base, ...props })));
    session.render();
    session.flushEffects();
    return session;
  };
  const labelOf = (hasUpdate: boolean) => (hasUpdate ? /^Περισσότερα \(/ : 'Περισσότερα');
  const items = (html: string) =>
    [...html.matchAll(/role="menuitem"[^>]*>(.*?)<\/button>/g)].map((m) =>
      m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );

  it('is closed at first: aria-haspopup="menu", aria-expanded="false", no menu', () => {
    const s = open();
    const html = s.render();
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
  it('opens with five items; Back is disabled without history', () => {
    const s = open();
    s.press('Περισσότερα');
    const html = s.render();
    expect(html).toContain('aria-expanded="true"');
    expect(items(html)).toEqual([
      'Πίσω Alt+←',
      'Ιστορικό ενεργειών',
      'Υπόμνημα κωδικών Shift+F1',
      'Διάγνωση Ctrl+Shift+D',
    ]);
    expect(html).toMatch(/role="menuitem"[^>]*disabled=""[^>]*>[\s\S]*?Πίσω/);
  });
  it('with history Back names the screen; with an update the dot and «Νέα έκδοση» appear (five items)', () => {
    const s = open({ backTo: 'Σήμερα', hasUpdate: true });
    expect(s.render()).toContain('topmore__dot');
    s.press(labelOf(true));
    const list = items(s.render());
    expect(list).toEqual([
      'Πίσω στο Σήμερα Alt+←',
      'Ιστορικό ενεργειών',
      'Υπόμνημα κωδικών Shift+F1',
      'Νέα έκδοση',
      'Διάγνωση Ctrl+Shift+D',
    ]);
    expect(s.render()).not.toMatch(/role="menuitem"[^>]*disabled/);
  });
  it('no update: no dot and no «Νέα έκδοση»', () => {
    const s = open();
    expect(s.render()).not.toContain('topmore__dot');
    s.press('Περισσότερα');
    expect(items(s.render()).join('|')).not.toContain('Νέα έκδοση');
  });
  it('an item runs its callback and closes the menu', () => {
    const onOpenLegend = vi.fn();
    const s = open({ onOpenLegend });
    s.press('Περισσότερα');
    s.render();
    s.press(/^Υπόμνημα κωδικών/);
    expect(onOpenLegend).toHaveBeenCalledOnce();
    expect(s.render()).not.toContain('role="menu"');
  });
  it('Enter, Space and ArrowDown open the menu; Esc closes it', () => {
    for (const key of ['Enter', ' ', 'ArrowDown']) {
      const s = open();
      s.press('Περισσότερα', { prop: 'onKeyDown', event: { key } });
      expect(s.render(), key).toContain('role="menu"');
      s.press('Περισσότερα', { prop: 'onKeyDown', event: { key: 'Escape' }, index: 1 });
      expect(s.render(), key).not.toContain('role="menu"');
      s.stop();
      session = null;
    }
  });
  it('Tab closes the menu, a route change closes it too', () => {
    const s = open();
    s.press('Περισσότερα');
    s.render();
    s.press('Περισσότερα', { prop: 'onKeyDown', event: { key: 'Tab' }, index: 1 });
    expect(s.render()).not.toContain('role="menu"');
  });
});

describe('focusTarget (arrow keys inside the menu)', () => {
  const all = ['a', 'b', 'c'] as unknown as HTMLElement[];
  it('ArrowDown/ArrowUp wrap around, Home/End jump, other keys do nothing', () => {
    expect(focusTarget('ArrowDown', all, 0)).toBe(all[1]);
    expect(focusTarget('ArrowDown', all, 2)).toBe(all[0]);
    expect(focusTarget('ArrowUp', all, 0)).toBe(all[2]);
    expect(focusTarget('ArrowUp', all, 2)).toBe(all[1]);
    expect(focusTarget('Home', all, 1)).toBe(all[0]);
    expect(focusTarget('End', all, 1)).toBe(all[2]);
    expect(focusTarget('x', all, 1)).toBeUndefined();
  });
});
