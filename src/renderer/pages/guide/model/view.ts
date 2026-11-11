// Pure helpers of the «Οδηγός χρήσης» screen: the markup parser of the topic text, the accent-free search and the
// ΗΚΑΙ ↔ ΗΚΑΛ text swap.
// Purpose: `parseGuide`, `searchGuide`, `hk`, `titleOf`, `byId`, `plain`, `INLINE`, for the guide screen and its tests.
// Does NOT: render anything or touch React (ui/), hold the texts (src/renderer/guideText.ts) or read the navigation.
// Owner layer: renderer/pages/guide. Why: moved verbatim from screens/guide.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/guide.test.ts, test/guide-view.test.ts.
import { normGreek } from '../../../../shared/text';
import { HK } from '../../../../shared/unit';
import { GUIDE, type GuideTopic } from '../../../guideText';

/** Every guide topic by its id. */
export const byId = new Map(GUIDE.map((t) => [t.id, t]));

/**
 * Swaps «ΗΚΑΙ» for the unit's own word («ΗΚΑΛ»), like the whole app (Ρυθμίσεις › Μονάδα και έντυπα).
 * @param s - any guide text
 */
export const hk = (s: string) => (HK() === 'ΗΚΑΙ' ? s : s.replace(/ΗΚΑΙ/g, HK()));

/** Title of a topic with the ΗΚΑΙ swap applied; the id itself when the topic does not exist. */
export const titleOf = (id: string) => hk(byId.get(id)?.title || id);

/**
 * One block of a topic text: sub-title, paragraph, bullets, steps, tip, warning or table.
 * Steps that continue after bullets (1, 2, 3, bullets, 4…) keep their numbering through `start`.
 */
export type Block =
  | { t: 'h' | 'p' | 'tip' | 'warn'; text: string }
  | { t: 'ul' | 'ol'; items: string[]; start?: number }
  | { t: 'table'; rows: string[][] };

/**
 * Splits a topic body into blocks, line by line.
 * @param body - the topic text with its light markup (`## `, `- `, `1. `, `> `, `! `, `|`)
 * @returns blocks in order; blank lines end a paragraph and are dropped
 */
export function parseGuide(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const last = out[out.length - 1];
    if (!line) {
      out.push({ t: 'p', text: '' });
      continue;
    }
    if (line.startsWith('## ')) out.push({ t: 'h', text: line.slice(3) });
    else if (line.startsWith('- ')) {
      if (last?.t === 'ul') last.items.push(line.slice(2));
      else out.push({ t: 'ul', items: [line.slice(2)] });
    } else if (/^\d+\. /.test(line)) {
      const x = line.replace(/^\d+\. /, '');
      const before = out[out.length - 2];
      if (last?.t === 'ol') last.items.push(x);
      else if (last?.t === 'ul' && before?.t === 'ol')
        out.push({ t: 'ol', items: [x], start: (before.start || 1) + before.items.length });
      else out.push({ t: 'ol', items: [x] });
    } else if (line.startsWith('> ')) out.push({ t: 'tip', text: line.slice(2) });
    else if (line.startsWith('! ')) out.push({ t: 'warn', text: line.slice(2) });
    else if (line.startsWith('|')) {
      const row = line
        .replace(/^\|/, '')
        .split(' | ')
        .map((c) => c.trim());
      if (last?.t === 'table') last.rows.push(row);
      else out.push({ t: 'table', rows: [row] });
    } else if (last?.t === 'p' && last.text) last.text += ` ${line}`;
    else out.push({ t: 'p', text: line });
  }
  return out.filter((b) => !(b.t === 'p' && !b.text));
}

/** A line without its markup, for the search (links keep their label, tables use « · »). */
export const plain = (s: string) =>
  s
    .replace(/\[\[([a-z-]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([a-z-]+)\]\]/g, (_, id) => titleOf(id))
    .replace(/\*\*|`/g, '')
    .replace(/^(## |- |\d+\. |> |! |\|)/, '')
    .replace(/ \| /g, ' · ');

/** Inline markup: `**bold**`, `` `key` ``, `[[id]]` or `[[id|label]]` (global; use it with `matchAll`). */
export const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[\[([a-z-]+)(?:\|([^\]]+))?\]\]/g;

/** One search result: the topic, up to 3 matching lines and the order score. */
export type Hit = { topic: GuideTopic; lines: string[]; score: number };

/**
 * Searches the guide: every word must be in the title, the keywords or the text (accents ignored).
 * Topics that match in the title come first.
 * @param q - what the user typed
 * @returns hits, best first; empty for an empty query
 */
export function searchGuide(q: string): Hit[] {
  const words = normGreek(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const t of GUIDE) {
    const lines = t.body
      .split('\n')
      .map(plain)
      .filter((l) => l.trim());
    const all = normGreek(`${hk(t.title)} ${t.keys || ''} ${lines.join(' ')}`);
    if (!words.every((w) => all.includes(w))) continue;
    const title = normGreek(hk(t.title));
    const found = lines.filter((l) => words.some((w) => normGreek(l).includes(w)));
    hits.push({
      topic: t,
      lines: found.slice(0, 3),
      score:
        (words.every((w) => title.includes(w)) ? 100 : words.some((w) => title.includes(w)) ? 50 : 0) + found.length,
    });
  }
  return hits.sort((a, b) => b.score - a.score);
}
