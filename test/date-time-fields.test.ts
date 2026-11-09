// Πεδία ημερομηνίας με το χέρι (Michael, 21/10: ώρες και ημερομηνίες με λίστα, γράφονται και με το χέρι)
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { parseDmy } from '../src/shared/dates';
import * as H from './support/screens-harness';
import { loadWorld, type BehaviourWorld } from './support/behaviour';
import { renderEverything } from './support/all-markup';
import { definersOf, readSources } from './support/source-scan';
import { DateField, MonthField, TimeField } from '../src/renderer/common';

// Phase 0.4: the last test used to list src/renderer/**/*.ts and expect `['common.ts']`. It now checks the rendered
// screens/dialogs and finds the one allowed file by what it exports (DateField), over .ts/.tsx/.jsx.
vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReact(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));

let bw: BehaviourWorld;
beforeAll(async () => { bw = await loadWorld(); });

describe('ημερομηνία γραμμένη με το χέρι', () => {
  it('δέχεται ηη/μμ, ηη.μμ.εε, ηη-μμ-εεεε', () => {
    expect(parseDmy('21/10', '2026-01-05')).toBe('2026-10-21');
    expect(parseDmy('1.2.27', '2026-01-05')).toBe('2027-02-01');
    expect(parseDmy(' 03-11-2026 ', '2025-01-01')).toBe('2026-11-03');
    expect(parseDmy('29/02/2028', '2026-01-01')).toBe('2028-02-29');
  });
  it('όχι μέρες που δεν υπάρχουν ή σκέτο κείμενο', () => {
    for (const s of ['31/02/2026', '29/02/2026', '0/1', '12/13', '2026-10-21', 'αύριο', '']) expect(parseDmy(s, '2026-10-21')).toBeNull();
  });
  it('καμία οθόνη δεν έχει δικό της <input type="date"> ή "month" (μόνο το DateField, για το ημερολόγιο)', () => {
    // what the screens and dialogs render: the only native date input is the hidden calendar of DateField
    const found = renderEverything(bw).flatMap(x => [...x.html.matchAll(/<input\b[^>]*\btype="(?:date|month|time)"[^>]*>/g)].map(m => ({ where: x.name, tag: m[0] })));
    expect(found.length).toBeGreaterThan(0);   // DateField is on screen somewhere: the check is not vacuous
    expect(found.filter(f => !/class="datefld__cal"/.test(f.tag))).toEqual([]);
    // the source rule behind it: only the file that defines DateField names such an input (htm and JSX quotes)
    const sources = readSources();
    const own = definersOf(sources, 'DateField');
    expect(own).toHaveLength(1);
    const hits = sources.filter(s => /\btype=(?:\{\s*)?["'](?:date|month|time)["']/.test(s.text)).map(s => s.rel);
    expect(hits).toEqual([own[0].rel]);
  });
  it('DateField: πεδίο κειμένου ηη/μμ/εεεε και κρυφό ημερολόγιο· MonthField και TimeField δεν γράφουν type="month"/"time"', () => {
    const w = bw.world;
    const date = H.renderIn(w, 'home', {}, createElement(DateField as never, { value: '2026-10-21', onChange: () => {} }));
    expect(date).toContain('value="21/10/2026"'); expect(date).toContain('placeholder="ηη/μμ/εεεε"');
    expect(date).toMatch(/<input[^>]*type="date"[^>]*class="datefld__cal"|<input[^>]*class="datefld__cal"[^>]*type="date"/);
    expect(date).toMatch(/aria-hidden="true"/);
    const month = H.renderIn(w, 'home', {}, createElement(MonthField as never, { value: '2026-10', onChange: () => {} }));
    const time = H.renderIn(w, 'home', {}, createElement(TimeField as never, { id: 't', label: 'Ώρα', value: '08:30', onChange: () => {} }));
    for (const out of [month, time]) expect(out).not.toMatch(/type="(?:month|time)"/);
    expect(month).toContain('Οκτώβριος 2026'); expect(time).toContain('08:30');
  });
});
