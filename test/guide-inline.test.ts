// The guide's inline markup: a link to another topic written inside bold («**[[today|Σήμερα]]**», topic «Μια
// συνηθισμένη μέρα») is drawn as a bold link, not as the raw «[[today|Σήμερα]]» text.
// Covers: src/renderer/pages/guide/ui/Inline.tsx.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Inline } from '../src/renderer/pages/guide/ui/Inline';
import { GUIDE } from '../src/renderer/guideText';

const html = (text: string): string => renderToStaticMarkup(createElement(Inline, { text, open: () => {} }));

describe('guide inline markup', () => {
  it('draws a link inside bold as a bold link', () => {
    const out = html('Άνοιξε το **[[today|Σήμερα]]**. Μετά');
    expect(out).toContain('<b><button type="button" class="guide__link">Σήμερα</button></b>');
    expect(out).not.toContain('[[');
  });
  it('keeps plain bold, keys and links as before', () => {
    expect(html('**Δήλωσε**')).toBe('<b>Δήλωσε</b>');
    expect(html('[[today]]')).toContain('class="guide__link"');
  });
  it('no guide topic shows raw link markup', () => {
    const raw = GUIDE.flatMap((t) => t.body.split('\n')).filter((line) => html(line).includes('[['));
    expect(raw).toEqual([]);
  });
});
