// HTML snapshots of dialogs and sheets, part 1: shared dialogs, updates, cadre, ΕΣΣΟ, duties, notes, ΗΚΑΙ, outs,
// day forms.
//
// Purpose: part of the screen HTML net for the rewrite (rules in test/screens-main.test.ts: a structural PR passes
//   WITHOUT -u; a UI redesign PR runs `npx vitest run -u` and says so in its description).
// Does NOT: click. Each dialog is mounted in its open state with props; dialogs that only a click opens are listed as
//   not covered in test/__snapshots__/screens/COVERAGE.md (they belong to the browser DOM snapshot, PR 0.3b).
// Cases: test/support/dialog-cases-shell.ts. Files: test/__snapshots__/screens/dialog-*.html.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as H from './support/screens-harness';
import { pickRows, type Rows } from './support/dialog-fixtures';
import { mockApi } from '../src/renderer/shared/api/mockApi';
import type { SourceBook } from '../src/shared/api';
import { SHELL_CASES } from './support/dialog-cases-shell';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let world: H.World;
let rows: Rows;
beforeAll(async () => {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  world = await H.makeWorld();
  rows = pickRows(world, (await mockApi().srcRead('people')) as SourceBook);
});

describe('dialog HTML snapshots: shell and shared', () => {
  it.each(SHELL_CASES.map(c => [c.name, c] as const))('dialog %s', async (_name, c) => {
    const out = H.renderIn(world, c.view ?? 'home', c.params ?? {}, c.build(world, rows));
    await expect(out).toMatchFileSnapshot(H.snapPath('dialog', c.name));
  });
});
