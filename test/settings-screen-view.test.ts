// The pure rules of the «Ρυθμίσεις» screen: the section menu and the sub-tab chosen by the route parameters
// (pages/settings/model/screenView.ts).
import { describe, expect, it } from 'vitest';
import { DUTY_SUBS, SET_SECTIONS, dutySubOf, sectionOf } from '../src/renderer/pages/settings/model/screenView';

describe('Ρυθμίσεις screen view', () => {
  it('has the thirteen sections in the menu order', () => {
    expect(SET_SECTIONS.map(([key]) => key)).toEqual([
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
    ]);
  });

  it('opens «Μονάδα» for a missing, unknown or old `settings` tab', () => {
    expect(sectionOf(undefined)).toBe('unit');
    expect(sectionOf('settings')).toBe('unit');
    expect(sectionOf('nope')).toBe('unit');
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
