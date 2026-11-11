// The pure helpers of the «Οδηγός χρήσης» screen (pages/guide/model/view.ts): the block parser, the link titles and
// the accent-free search with its ΗΚΑΙ swap.
import { describe, expect, it } from 'vitest';
import { byId, INLINE, parseGuide, plain, searchGuide, titleOf } from '../src/renderer/pages/guide/model/view';

describe('guide view', () => {
  it('parser: sub-title, paragraph joining, bullets, tip, warning and table', () => {
    const blocks = parseGuide('## Τίτλος\nμία\nδύο\n\n- α\n- β\n> συμβουλή\n! προσοχή\n|Χ | Υ\n|1 | 2');
    expect(blocks).toEqual([
      { t: 'h', text: 'Τίτλος' },
      { t: 'p', text: 'μία δύο' },
      { t: 'ul', items: ['α', 'β'] },
      { t: 'tip', text: 'συμβουλή' },
      { t: 'warn', text: 'προσοχή' },
      {
        t: 'table',
        rows: [
          ['Χ', 'Υ'],
          ['1', '2'],
        ],
      },
    ]);
  });

  it('parser: steps that continue after bullets keep their numbering', () => {
    const blocks = parseGuide('1. α\n2. β\n- κουκκίδα\n3. γ');
    expect(blocks.at(-1)).toEqual({ t: 'ol', items: ['γ'], start: 3 });
  });

  it('plain text: links keep their label or the topic title, markup is dropped', () => {
    expect(plain('**έντονο** `Ctrl+K` [[about|εδώ]]')).toBe('έντονο Ctrl+K εδώ');
    expect(plain('[[about]]')).toBe(titleOf('about'));
    expect(titleOf('no-such-topic')).toBe('no-such-topic');
    expect(byId.has('about')).toBe(true);
  });

  it('inline pattern: bold, key cap and both link forms', () => {
    expect([...'**β** `k` [[a-b]] [[a-b|x]]'.matchAll(INLINE)].map((m) => m[0])).toEqual([
      '**β**',
      '`k`',
      '[[a-b]]',
      '[[a-b|x]]',
    ]);
  });

  it('search: empty query finds nothing, accents are ignored, title matches come first', () => {
    expect(searchGuide('  ')).toEqual([]);
    const hits = searchGuide('ΠΟΙΝ');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.score)).toEqual([...hits.map((h) => h.score)].sort((a, b) => b - a));
    expect(hits.every((h) => h.lines.length <= 3)).toBe(true);
  });
});
