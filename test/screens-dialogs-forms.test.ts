// HTML snapshots of dialogs and sheets, part 2: Δυναμολόγιο, quick add, Έντυπα, Ρυθμίσεις, Excel sources,
// weapons, Ημερολόγιο.
//
// Purpose: part of the screen HTML net for the rewrite (rules in test/screens-main.test.ts: a structural PR passes
//   WITHOUT -u; a UI redesign PR runs `npx vitest run -u` and says so in its description).
// Does NOT: click or run effects. Dialogs that fetch in an effect (Excel preview, history) show their first render.
//   Which of the 75 dialog sites are covered: test/__snapshots__/screens/COVERAGE.md.
// Cases: test/support/dialog-cases-forms.ts. Files: test/__snapshots__/screens/dialog-*.html.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as H from './support/screens-harness';
import { pickRows, type Rows } from './support/dialog-fixtures';
import { FORMS_CASES } from './support/dialog-cases-forms';
import { mockApi } from '../src/renderer/mockApi';
import type { SourceBook } from '../src/shared/api';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let world: H.World;
let rows: Rows;
beforeAll(async () => {
  H.quietKnownWarnings();
  H.installBrowserStubs();
  H.freezeClock();
  world = await H.makeWorld();
  // the Excel book that the dev (browser) build shows for «Αρχεία Excel»
  const book = (await mockApi().srcRead('people')) as SourceBook;
  rows = pickRows(world, book);
});

describe('dialog HTML snapshots: forms, Excel, weapons', () => {
  it.each(FORMS_CASES.map(c => [c.name, c] as const))('dialog %s', async (_name, c) => {
    const out = H.renderIn(world, c.view ?? 'home', c.params ?? {}, c.build(world, rows));
    await expect(out).toMatchFileSnapshot(H.snapPath('dialog', c.name));
  });
});
