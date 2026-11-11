// U5 (redesign): the «Καταστάσεις» hub, the «Ημερήσια Διαταγή» menu item and the old ΗΚΑΙ-tab links.
//
// Purpose: pins that the hub draws the four tabs with their counts and the widget of each tab, that the requests badge
//   sits on «Καταστάσεις», that Alt+6 still opens `records`, that ΗΚΑΙ has no top tabs, that `hd` renders HdTab, and
//   that every old link (`{ hkai, hkTab }`) and Ctrl+K command still reaches the same content.
// Does NOT: lay anything out (bench:styles and the screenshots do) or click (route memory is covered by shell tests).
// Covering: src/renderer/pages/statuses/, app/normalizeRoute.ts, app/routes.ts, app/paletteActions.ts, SideNav.tsx.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as H from './support/screens-harness';
import { StatusesPage } from '../src/renderer/pages/statuses';
import { statusCounts, statusTab, statusTabItems } from '../src/renderer/pages/statuses';
import { normalizeRoute } from '../src/renderer/app/normalizeRoute';
import { MENU_TAB, NAV_ALL, NAV_GROUPS, SCREENS, screenName } from '../src/renderer/app/routes';
import { paletteActions } from '../src/renderer/app/paletteActions';
import { SideNav, type NavBadges, type NavMenu } from '../src/renderer/app/SideNav';
import { matchShortcut } from '../src/renderer/app/shortcuts';
import { HkaiScreen } from '../src/renderer/screens/other';
import { HdTab } from '../src/renderer/widgets/hd';
import { personMap } from '../src/shared/rules';
import { norm } from '../src/shared/text';

vi.mock('react', async (orig) => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async (orig) => (await import('./support/ssr-shims')).mockReactDom(orig));

let world: H.World;
beforeAll(async () => {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  world = await H.makeWorld();
});

const hub = (params: Record<string, unknown> = {}) => H.renderIn(world, 'records', params, createElement(StatusesPage));
const tabLabels = (markup: string) =>
  [...markup.matchAll(/role="tab" aria-selected="(true|false)">\s*([^<]*?)\s*<\/button>/g)].map((m) => [m[1], m[2]]);

describe('normalizeRoute: old ΗΚΑΙ-tab links', () => {
  const to = (view: string, params: Record<string, unknown>) => normalizeRoute({ view: view as never, params });
  it('pun / leave / req go to the same tab of «Καταστάσεις», other params kept', () => {
    expect(to('hkai', { hkTab: 'pun' })).toEqual({ view: 'records', params: { stTab: 'pun' } });
    expect(to('hkai', { hkTab: 'leave', leaveTab: 'back' })).toEqual({
      view: 'records',
      params: { leaveTab: 'back', stTab: 'leave' },
    });
    expect(to('hkai', { hkTab: 'req', hkaiDate: '2026-11-09' }).params).toEqual({
      hkaiDate: '2026-11-09',
      stTab: 'req',
    });
  });
  it('hd goes to its own screen and keeps hdDate', () => {
    expect(to('hkai', { hkTab: 'hd', hdDate: '2026-11-10' })).toEqual({
      view: 'hd',
      params: { hdDate: '2026-11-10' },
    });
  });
  it('hkai, empty and undefined hkTab stay on ΗΚΑΙ without the key', () => {
    expect(to('hkai', { hkTab: 'hkai', hkaiDate: 'x' })).toEqual({ view: 'hkai', params: { hkaiDate: 'x' } });
    expect(to('hkai', { hkTab: undefined })).toEqual({ view: 'hkai', params: {} });
  });
  it('any other route is returned as the same object', () => {
    const plain = { view: 'hkai' as const, params: { hkaiDate: 'x' } };
    expect(normalizeRoute(plain)).toBe(plain);
    const other = { view: 'guard' as const, params: { hkTab: 'pun' } };
    expect(normalizeRoute(other)).toBe(other);
  });
});

describe('«Καταστάσεις» hub', () => {
  it('draws the four tabs with their counts, Ιατρικά first and selected by default', () => {
    const { state, store } = world;
    const counts = statusCounts(state, personMap(state.people), store.today, 9 * 60);
    expect(statusTabItems(counts).map((t) => t.value)).toEqual(['med', 'pun', 'leave', 'req']);
    const labels = tabLabels(hub());
    expect(labels.map((l) => l[1].replace(/ \(\d+\)$/, ''))).toEqual(['Ιατρικά', 'Ποινές', 'Άδειες', 'Αιτήσεις']);
    expect(labels.map((l) => l[0])).toEqual(['true', 'false', 'false', 'false']);
    // the snapshot data has 4 people on leave and 1 waiting request (same numbers the old ΗΚΑΙ tabs showed)
    expect(labels.map((l) => l[1])).toContain('Άδειες (4)');
    expect(labels.map((l) => l[1])).toContain('Αιτήσεις (1)');
  });
  it('count labels hide a zero and an unknown stTab falls back to Ιατρικά', () => {
    expect(statusTabItems({ med: 0, pun: 0, leave: 0, req: 0 }).map((t) => t.label)).toEqual([
      'Ιατρικά',
      'Ποινές',
      'Άδειες',
      'Αιτήσεις',
    ]);
    expect(statusTab('nope')).toBe('med');
    expect(statusTab(undefined)).toBe('med');
    expect(statusTab('req')).toBe('req');
  });
  it('has the title and each tab shows its widget', () => {
    expect(hub()).toContain('Καταστάσεις');
    expect(hub()).toContain('Τώρα (');
    expect(hub({ stTab: 'med', recTab: 'changes' })).toContain('Μεταβολές ημέρας');
    expect(hub({ stTab: 'pun' })).toContain('Ποινές');
    expect(hub({ stTab: 'leave' })).toContain('+ Άδεια');
    expect(hub({ stTab: 'req' })).toContain('Άλλη αίτηση');
  });
});

describe('menu: «Καταστάσεις», «Ημερήσια Διαταγή», badge, Alt+6', () => {
  const badges: NavBadges = { guard: 0, requests: 2, notes: 0 };
  const menu: NavMenu = { view: 'home', badges, go: () => {} };
  const side = () => {
    H.installBrowserStubs();
    return renderToStaticMarkup(createElement(SideNav, { menu, rail: false, toggleRail: () => {} }));
  };
  const button = (html: string, label: string) =>
    html.split('<button').find((part) => part.includes('<span class="navbtn__lbl">' + label + '</span>')) ?? '';
  it('names the entries and puts the Ημερήσια Διαταγή after Έντυπα', () => {
    expect(screenName('records')).toBe('Καταστάσεις');
    expect(screenName('hd')).toBe('Ημερήσια Διαταγή');
    expect(NAV_GROUPS[2].items).toEqual(['reports', 'hd', 'weapons']);
    expect(MENU_TAB).toMatchObject({ records: 'stTab' });
    expect(MENU_TAB.hkai).toBeUndefined();
  });
  it('the requests badge is on Καταστάσεις and not on ΗΚΑΙ', () => {
    const html = side();
    expect(button(html, 'Καταστάσεις')).toMatch(/ui-badge--warn[^>]*>2</);
    expect(button(html, 'ΗΚΑΙ')).not.toContain('ui-badge');
    expect(button(html, 'Ημερήσια Διαταγή')).not.toContain('ui-badge');
  });
  it('Alt+6 still opens records; Alt keys follow the frozen NAV_ALL (hd has none)', () => {
    expect(NAV_ALL[5]).toBe('records');
    expect(NAV_ALL).not.toContain('hd');
    const key = { key: '6', code: 'Digit6', altKey: true, ctrlKey: false, shiftKey: false } as KeyboardEvent;
    expect(matchShortcut(key, false)).toEqual({ id: 'view', view: 'records' });
  });
});

describe('ΗΚΑΙ and Ημερήσια Διαταγή screens', () => {
  it('ΗΚΑΙ has no top tabs: only its own Μπροστά / Πίσω switch', () => {
    const html = H.renderIn(world, 'hkai', {}, createElement(HkaiScreen));
    const labels = tabLabels(html).map((l) => l[1]);
    expect(labels).toEqual(['Μπροστά', 'Πίσω']);
    expect(html).toContain('5. Αιτήσεις');
  });
  it('the hd route renders HdTab', () => {
    expect(SCREENS.hd.component).toBe(HdTab);
    expect(H.renderIn(world, 'hd', {}, createElement(SCREENS.hd.component))).toContain('Ημερήσια Διαταγή της');
  });
});

describe('Ctrl+K: every old command still reaches the same content', () => {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const actions = () =>
    paletteActions({
      nav: { go: (v: string, p?: Record<string, unknown>) => calls.push([v, p]) } as never,
      state: world.state,
      today: H.TODAY,
      tomorrow: H.TOMORROW,
      usb: () => {},
    });
  const run = (title: string) => {
    calls.length = 0;
    actions()
      .find((a) => a.t === title)
      ?.fn();
    return calls[0];
  };
  const OLD: [string, string, Record<string, unknown>][] = [
    ['Καταστάσεις › Ποινές', 'hkai', { hkTab: 'pun' }],
    ['Καταστάσεις › Άδειες', 'hkai', { hkTab: 'leave' }],
    ['Καταστάσεις › Αιτήσεις', 'hkai', { hkTab: 'req' }],
  ];
  it.each(OLD)('%s opens what the old ΗΚΑΙ command opened', (title, oldView, oldParams) => {
    const [view, params] = run(title);
    const old = normalizeRoute({ view: oldView as never, params: oldParams });
    expect([view, params]).toEqual([old.view, old.params]);
  });
  it('Ιατρικά, expired medical and the ΗΚΑΙ report keep their targets; Ημερήσια Διαταγή is new', () => {
    expect(run('Καταστάσεις › Ιατρικά')).toEqual(['records', { stTab: 'med', recTab: 'med' }]);
    expect(run('Ιατρικά που έληξαν')).toEqual(['records', { stTab: 'med', recTab: 'expired' }]);
    expect(run('ΗΚΑΙ (η αναφορά)')).toEqual(['hkai', undefined]);
    expect(run('Ημερήσια Διαταγή')).toEqual(['hd', undefined]);
  });
  it('the old words still find the moved commands', () => {
    const keywords = (title: string) => norm(actions().find((a) => a.t === title)?.k ?? '');
    for (const title of ['Καταστάσεις › Ποινές', 'Καταστάσεις › Άδειες', 'Καταστάσεις › Αιτήσεις']) {
      expect(keywords(title), title).toContain(norm('ΗΚΑΙ'));
    }
  });
});
