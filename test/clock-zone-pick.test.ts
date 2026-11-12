// Ρυθμίσεις › Ώρα και ζώνη ώρας › «Άλλη ζώνη»: picking a zone from the list saves the zone name.
// Purpose: guards the 12/11 fix. `Select` hands its onChange `{ target: { value } }`; the handler used to save that
//   event object as `settings.tz` instead of the picked name.
// Does NOT: test the clock maths (test/clock.test.ts) or the pure rules of the section (test/settings-clock-view.test.ts).
// Owner layer: test (behaviour, SSR probe). Covering: src/renderer/pages/settings/ui/sections/ClockCard.tsx.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import * as H from './support/screens-harness';
import { startSession, type Session } from './support/probe';
import { loadWorld, withState, type BehaviourWorld } from './support/behaviour';
import { TemplatesScreen } from '../src/renderer/pages/settings';
import { Select } from '../src/renderer/shared/ui';
import type { Command } from '../src/shared/commands';

vi.mock('react', async (orig) => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async (orig) => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async (orig) => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async (orig) => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

let bw: BehaviourWorld;
let session: Session | null = null;
beforeAll(async () => {
  bw = await loadWorld();
});
afterEach(() => {
  session?.stop();
  session = null;
});

describe('«Άλλη ζώνη»', () => {
  it('saves the picked zone name, not the change event', () => {
    const runs: Command[] = [];
    const run = async (c: Command) => {
      runs.push(c);
      return null;
    };
    // a zone that is neither Athens nor «system» opens the section in «Άλλη…» mode, with the zone list shown
    const state = { ...bw.world.state, settings: { ...bw.world.state.settings, tz: 'Europe/Berlin' } };
    const world = withState(bw.world, state, { run: run as never });
    session = startSession(() => H.renderIn(world, 'templates', { tab: 'clock' }, createElement(TemplatesScreen)));
    session.render();
    const zoneSelect = session.elements().find((r) => r.type === Select && r.props.search === true);
    expect(zoneSelect).toBeDefined();
    (zoneSelect!.props.onChange as (e: unknown) => void)({ target: { value: 'UTC' }, currentTarget: { value: 'UTC' } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ t: 'setSettings', settings: { tz: 'UTC' } });
  });

  it('saves Athens as the empty zone, as the «Ελλάδα» choice does', () => {
    const runs: Command[] = [];
    const run = async (c: Command) => {
      runs.push(c);
      return null;
    };
    const state = { ...bw.world.state, settings: { ...bw.world.state.settings, tz: 'Europe/Berlin' } };
    const world = withState(bw.world, state, { run: run as never });
    session = startSession(() => H.renderIn(world, 'templates', { tab: 'clock' }, createElement(TemplatesScreen)));
    session.render();
    const zoneSelect = session.elements().find((r) => r.type === Select && r.props.search === true);
    const athens = { target: { value: 'Europe/Athens' }, currentTarget: { value: 'Europe/Athens' } };
    (zoneSelect!.props.onChange as (e: unknown) => void)(athens);
    expect(runs[0]).toMatchObject({ t: 'setSettings', settings: { tz: '' } });
  });
});
