// The pure rules of the «Ρυθμίσεις» screen: the section menu and the sub-tab chosen by the route parameters
// (pages/settings/model/screenView.ts).
import { describe, expect, it } from 'vitest';
import {
  DUTY_SUBS,
  SET_GROUPS,
  SET_SECTIONS,
  dutySubOf,
  groupOf,
  groupSummary,
  sectionLabel,
  sectionOf,
} from '../src/renderer/pages/settings/model/screenView';
import { groupCount } from '../src/renderer/pages/settings/model/settingsIndex';

describe('Ρυθμίσεις screen view', () => {
  it('keeps the thirteen old sections and adds `brand`, `hkrows` and `sigs`', () => {
    const oldKeys = [
      'unit',
      'rooms',
      'duty',
      'lists',
      'import',
      'files',
      'templates',
      'excel',
      'look',
      'clock',
      'esso',
      'backup',
      'update',
    ];
    const keys = SET_SECTIONS.map(([key]) => key);
    expect(keys.filter((key) => oldKeys.includes(key))).toHaveLength(13);
    expect([...keys].sort()).toEqual([...oldKeys, 'brand', 'hkrows', 'sigs'].sort());
  });

  it('has the seven groups and their sections in the menu order', () => {
    expect(SET_GROUPS.map((group) => [group.key, group.label, group.sections])).toEqual([
      ['me', 'Η μονάδα μου', ['unit', 'brand', 'rooms', 'esso']],
      ['duty', 'Υπηρεσίες', ['duty']],
      ['outs', 'Έξοδοι και ΗΚΑΙ', ['hkrows']],
      ['lists', 'Λίστες και κωδικοί', ['lists']],
      ['files', 'Αρχεία Excel', ['import', 'files', 'templates', 'excel']],
      ['paper', 'Χαρτιά: υπογραφές και θέσεις', ['sigs']],
      ['pc', 'Αυτό το PC', ['look', 'clock', 'backup', 'update']],
    ]);
  });

  it('keeps the old labels of the sections', () => {
    const labels = new Map(SET_SECTIONS);
    expect(labels.get('unit')).toBe('Μονάδα και έντυπα');
    expect(labels.get('duty')).toBe('Υπηρεσίες και αργίες');
    expect(labels.get('look')).toBe('Εμφάνιση');
    expect(labels.get('sigs')).toBe('Υπογραφές');
    expect(labels.get('brand')).toBe('Τίτλος και λογότυπο');
    expect(labels.get('hkrows')).toBe('Γραμμές και ονόματα ΗΚΑΙ');
  });

  it('finds the group of every section, and of an old or unknown route value', () => {
    expect(SET_SECTIONS.every(([key]) => groupOf(key).sections.includes(key))).toBe(true);
    expect(groupOf('sigs').key).toBe('paper');
    expect(groupOf('brand').key).toBe('me');
    expect(groupOf('look').key).toBe('pc');
    expect(groupOf(sectionOf('settings')).key).toBe('me');
    expect(groupOf(sectionOf('nope')).key).toBe('me');
    expect(groupOf('zzz').key).toBe('me');
  });

  it('opens the overview for a missing or unknown tab, «Μονάδα» for the old `settings` tab (U11c)', () => {
    expect(sectionOf(undefined)).toBe('home');
    expect(sectionOf('nope')).toBe('home');
    expect(sectionOf('home')).toBe('home');
    expect(sectionOf('settings')).toBe('unit');
    expect(sectionLabel('home')).toBe('Όλες οι ρυθμίσεις');
    expect(SET_SECTIONS.some(([key]) => key === 'home')).toBe(false);
    expect(SET_GROUPS.some((g) => g.sections.includes('home'))).toBe(false);
  });

  it('has a one-line summary and a count for each group, the counts add up to the 44 settings', () => {
    for (const g of SET_GROUPS) {
      expect(groupSummary(g.key).length, g.key).toBeGreaterThan(20);
      expect(groupCount(g.key), g.key).toBeGreaterThan(0);
    }
    expect(SET_GROUPS.reduce((n, g) => n + groupCount(g.key), 0)).toBe(44);
    expect(groupSummary('zzz')).toBe('');
    expect(groupCount('zzz')).toBe(0);
  });

  it('opens a known section as asked', () => {
    expect(SET_SECTIONS.map(([key]) => sectionOf(key))).toEqual(SET_SECTIONS.map(([key]) => key));
  });

  it('has the four duty sub-tabs and falls back to «Υπηρεσίες»', () => {
    expect(DUTY_SUBS.map(([key]) => key)).toEqual(['blocks', 'si', 'stat', 'hol']);
    expect(dutySubOf(undefined)).toBe('blocks');
    expect(dutySubOf('zzz')).toBe('blocks');
    expect(DUTY_SUBS.map(([key]) => dutySubOf(key))).toEqual(['blocks', 'si', 'stat', 'hol']);
  });
});
