// Render of the search results of «Ρυθμίσεις» (pages/settings/ui/SettingsSearch.tsx): path line, highlight, count and
// the «nothing found» line with its «Καθάρισε» button.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { searchSettings, wordsOf } from '../src/renderer/pages/settings/model/settingsIndex';
import type { SettingsSearch } from '../src/renderer/pages/settings/model/useSettingsSearch';
import { SettingsResults } from '../src/renderer/pages/settings/ui/SettingsSearch';

const fake = (q: string): SettingsSearch => ({
  q,
  on: q.trim() !== '',
  setQ: () => undefined,
  results: searchSettings(q),
  words: wordsOf(q),
  pick: 0,
  setPick: () => undefined,
  open: () => undefined,
  onKeyDown: () => undefined,
  bodyRef: { current: null },
});

describe('settings search results', () => {
  it('shows label, path and highlighted words, the first result selected', () => {
    const html = renderToStaticMarkup(createElement(SettingsResults, { s: fake('υπογραφ') }));
    expect(html).toContain('<mark>Υπογραφ</mark>ές');
    expect(html).toContain('Χαρτιά: <mark>υπογραφ</mark>ές και θέσεις › <mark>Υπογραφ</mark>ές');
    expect(html).toContain('aria-current="true"');
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('says nothing matched and offers «Καθάρισε»', () => {
    const html = renderToStaticMarkup(createElement(SettingsResults, { s: fake('ψψψψ') }));
    expect(html).toContain('Καμία ρύθμιση δεν ταιριάζει με «ψψψψ»');
    expect(html).toContain('Καθάρισε');
  });
});
