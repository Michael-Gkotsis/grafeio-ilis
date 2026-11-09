// Read the pretty-printed HTML of the SSR harness (screens-harness.ts `prettyHtml`) as plain data.
//
// Purpose: small queries for behaviour tests (which buttons exist and what tooltip they carry, which texts a dialog
//   shows) so a test asserts on rendered output, not on source text.
// Does NOT: parse HTML in general. It relies on the harness format and on React's escaping, and only reads what the
//   tests ask for. Owner layer: test support only. Covering test: test/support/html.test.ts.

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
const decode = (s: string): string => s.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, m => ENTITIES[m]);

/** The pretty HTML on one line (the harness only adds whitespace outside text, so this is the original markup). */
export const flat = (pretty: string): string => pretty.split('\n').map(l => l.trim()).join('');

/** Text of the page without tags, entities decoded, runs of tags collapsed to one space. */
export const textOfHtml = (pretty: string): string => decode(flat(pretty).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();

export interface ButtonInfo { label: string; attrs: Record<string, string>; disabled: boolean }

const attrsOf = (raw: string): Record<string, string> =>
  Object.fromEntries([...raw.matchAll(/([a-zA-Z:-]+)(?:="([^"]*)")?/g)].map(m => [m[1], decode(m[2] ?? '')]));

/** Every `<button>` whose content is plain text (nested tags are dropped from the label). */
export function buttonsOf(pretty: string): ButtonInfo[] {
  return [...flat(pretty).matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(m => {
    const attrs = attrsOf(m[1]);
    return { label: decode(m[2].replace(/<[^>]*>/g, '')).trim(), attrs, disabled: 'disabled' in attrs };
  });
}

/** The one button with this label; throws when there is none or several (a test never guesses). */
export function buttonLabelled(pretty: string, label: string): ButtonInfo {
  const hits = buttonsOf(pretty).filter(b => b.label === label);
  if (hits.length !== 1) throw new Error(`${hits.length} buttons labelled "${label}"`);
  return hits[0];
}

/** Text of every element matching `<tag ...>text</tag>` (no nested tags), for list rows such as `<b>` titles. */
export function textsIn(pretty: string, tag: string): string[] {
  return [...flat(pretty).matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map(m => decode(m[1]).trim());
}
