// HTML snapshots of every section of Ρυθμίσεις (and its Υπηρεσίες sub-tabs) and of every topic of the Οδηγός.
//
// Purpose: part of the screen HTML net for the Feature-Sliced/TSX rewrite (see test/screens-main.test.ts for the rules:
//   a structural PR must pass WITHOUT -u; a UI redesign PR updates with `-u` and says so in its description).
// Does NOT: click or run effects. Sections are selected the way the app selects them: nav param `tab` (and `dsub` for
//   Υπηρεσίες και αργίες) for Ρυθμίσεις, nav param `topic` for the Οδηγός. Cards that fetch data in an effect
//   (Αρχεία Excel,
//   Αντίγραφα, Ενημερώσεις) show their first, empty/loading render.
// Files: test/__snapshots__/screens/tab-settings--*.html, tab-guide--*.html.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import * as H from './support/screens-harness';
import { TemplatesScreen } from '../src/renderer/screens/settings';
import { GuideScreen } from '../src/renderer/screens/guide';
import { GUIDE } from '../src/renderer/guideText';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

// Same keys as SET_SECTIONS in screens/settings.ts; 'unit' is the default section.
const SECTIONS = [
  'unit', 'rooms', 'duty', 'lists', 'import', 'files', 'templates', 'excel', 'look', 'clock', 'esso', 'backup',
  'update',
];
// DUTY_SUBS in screens/settings.ts; 'blocks' is the default sub-tab (the `duty` snapshot).
const DUTY_SUBS = ['si', 'stat', 'hol'];

let world: H.World;
beforeAll(async () => {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  world = await H.makeWorld();
});

const settings = (params: Record<string, unknown>) =>
  H.renderIn(world, 'templates', params, createElement(TemplatesScreen as ComponentType<object>));

describe('Ρυθμίσεις sections', () => {
  it.each(SECTIONS)('section %s', async tab => {
    await expect(settings({ tab })).toMatchFileSnapshot(H.snapPath('tab', 'settings--' + tab));
  });
  it.each(DUTY_SUBS)('Υπηρεσίες και αργίες sub-tab %s', async dsub => {
    await expect(settings({ tab: 'duty', dsub })).toMatchFileSnapshot(H.snapPath('tab', 'settings--duty-' + dsub));
  });
});

describe('Οδηγός topics', () => {
  it('the guide has topics', () => { expect(GUIDE.length).toBeGreaterThan(20); });
  it.each(GUIDE.map(t => t.id))('topic %s', async topic => {
    const out = H.renderIn(world, 'guide', { topic }, createElement(GuideScreen as ComponentType<object>));
    await expect(out).toMatchFileSnapshot(H.snapPath('tab', 'guide--' + topic));
  });
});
