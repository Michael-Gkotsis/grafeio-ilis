// The search index of «Ρυθμίσεις» (pages/settings/model/settingsIndex.ts): every route is real, every §16 home is
// reachable, and the office words and typing habits (accents, Latin letters) find the right card first.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SET_GROUPS, SET_SECTIONS, DUTY_SUBS } from '../src/renderer/pages/settings/model/screenView';
import {
  ROUTES,
  SETTINGS_INDEX,
  isTabWhere,
  markParts,
  pathOf,
  searchSettings,
  wordsOf,
} from '../src/renderer/pages/settings/model/settingsIndex';
import { SCREEN_IDS } from '../src/renderer/app/screenId';

const first = (q: string) => searchSettings(q)[0];
const tabOf = (q: string) => {
  const w = first(q)?.where;
  return w && isTabWhere(w) ? w.tab : undefined;
};

describe('settings search index', () => {
  it('has one entry per section and 44 rows of checklist §16', () => {
    const sections = SETTINGS_INDEX.filter((e) => e.words === '' && isTabWhere(e.where));
    expect(sections.map((e) => e.label)).toEqual(SET_SECTIONS.map(([, label]) => label));
    expect(SETTINGS_INDEX).toHaveLength(SET_SECTIONS.length + 44);
  });

  it('points every entry at a real section, sub-tab or screen', () => {
    const tabs = SET_SECTIONS.map(([key]) => key);
    const subs = DUTY_SUBS.map(([key]) => key);
    for (const e of SETTINGS_INDEX) {
      if (isTabWhere(e.where)) {
        expect(tabs).toContain(e.where.tab);
        if (e.where.dsub) {
          expect(e.where.tab).toBe('duty');
          expect(subs).toContain(e.where.dsub);
        }
      } else {
        expect(SCREEN_IDS as readonly string[]).toContain(e.where.view);
        expect(pathOf(e.where)).toMatch(/^Οθόνη /);
      }
    }
  });

  it('reaches every group of the menu', () => {
    for (const g of SET_GROUPS) {
      const reached = SETTINGS_INDEX.some((e) => isTabWhere(e.where) && g.sections.includes(e.where.tab));
      expect(reached, g.label).toBe(true);
    }
  });

  it('keeps the routes equal to the Ctrl+K commands where one exists', () => {
    const palette = readFileSync('src/renderer/app/paletteActions.ts', 'utf8');
    expect(palette).toContain("'guard', {\n      gopen: 'rules',");
    expect(ROUTES.rules.params).toEqual({ gopen: 'rules' });
    expect(palette).toContain("tab: 'sigs'");
    expect(palette).toContain("'Οπλισμός'");
    // the guard screen reads `gopen`: `rules`, or a tab of the rules dialog
    const guard = readFileSync('src/renderer/screens/guard.ts', 'utf8');
    for (const k of ['rules', 'order', 'hours']) expect(guard).toContain(`value: '${k}'`);
    expect(ROUTES.order.params.gopen).toBe('order');
    expect(ROUTES.hours.params.gopen).toBe('hours');
    expect(readFileSync('src/renderer/screens/people.ts', 'utf8')).toContain("ptab: v === 'imer'");
  });

  it('finds the card by its office words, with or without accents', () => {
    expect(tabOf('υπογραφ')).toBe('sigs');
    expect(first('υπογραφ')?.label).toBe('Υπογραφές');
    expect(tabOf('ποιν')).toBe('lists');
    expect(tabOf('ζωνη ωρας')).toBe('clock');
    expect(tabOf('ΖΩΝΗ ΩΡΑΣ')).toBe('clock');
    expect(tabOf('γραμματα')).toBe('excel');
    expect(tabOf('προτυπα εφαρμογης')).toBe('templates');
  });

  it('finds the duty rules by «κανονες» without accents', () => {
    const hits = searchSettings('κανονες');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((e) => !isTabWhere(e.where) && e.where.params?.gopen === 'rules')).toBe(true);
    expect(hits.every((e) => !isTabWhere(e.where) && e.where.view === 'guard')).toBe(true);
  });

  it('finds ΕΣΣΟ typed in Latin letters and Latin look-alikes', () => {
    expect(tabOf('ESSO')).toBe('esso');
    expect(tabOf('essο')).toBe('esso');
    expect(tabOf('EKDOSEIS')).toBeUndefined();
    expect(searchSettings('AΡΓΙΕΣ').some((e) => isTabWhere(e.where) && e.where.dsub === 'hol')).toBe(true);
  });

  it('needs every word, puts label hits first and returns nothing for an empty query', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('   ')).toEqual([]);
    expect(searchSettings('υπογραφ ζωνη')).toEqual([]);
    const hits = searchSettings('ωρες');
    const firstWords = hits.findIndex((e) => !normLabelHas(e.label, 'ΩΡΕΣ'));
    expect(firstWords).toBeGreaterThan(0);
    expect(hits.slice(firstWords).every((e) => !normLabelHas(e.label, 'ΩΡΕΣ'))).toBe(true);
  });

  it('lists a section and a row with the same name once', () => {
    const names = searchSettings('ενημερωσεις').map((e) => `${e.label}|${pathOf(e.where)}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names the path of a result', () => {
    expect(pathOf({ tab: 'sigs' })).toBe('Χαρτιά: υπογραφές και θέσεις › Υπογραφές');
    expect(pathOf({ tab: 'duty', dsub: 'si' })).toBe('Υπηρεσίες › Υπηρεσίες και αργίες › Σ.Ι.');
    expect(pathOf(ROUTES.rules)).toBe('Οθόνη Υπηρεσίες › Κανόνες');
  });

  it('marks the typed words without accents and keeps the text whole', () => {
    const parts = markParts('Υπογραφές ανά έντυπο', wordsOf('υπογραφ εντυπ'));
    expect(parts.map((p) => p.text).join('')).toBe('Υπογραφές ανά έντυπο');
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['Υπογραφ', 'έντυπ']);
    expect(markParts('Λίστες', wordsOf('xyz'))).toEqual([{ text: 'Λίστες', hit: false }]);
  });
});

function normLabelHas(label: string, word: string): boolean {
  return label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(word);
}
