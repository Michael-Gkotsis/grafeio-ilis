// Inline markup of a guide line: bold, key caps and links to other topics, plus the search highlight.
// Purpose: `Inline` (a component, as before) and `Mark` (a plain function, as before).
// Does NOT: split lines into blocks (model/view.ts) or know the open topic.
// Owner layer: renderer/pages/guide. Why: moved verbatim from screens/guide.ts (Phase 6).
// Covering test: test/screens-settings-guide.test.ts, test/guide.test.ts.
import { Fragment, type ReactNode } from 'react';
import { normGreek } from '../../../../shared/text';
import { Kbd } from '../../../shared/ui';
import { byId, hk, INLINE, titleOf } from '../model/view';

/**
 * One line of guide text with its markup drawn.
 * @param text - the raw line (`**bold**`, `` `key` ``, `[[id]]`, `[[id|label]]`)
 * @param open - opens another topic (a link click)
 */
export function Inline({ text, open }: { text: string; open: (id: string) => void }) {
  const parts: ReactNode[] = [];
  let i = 0;
  const txt = hk;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > i) parts.push(txt(text.slice(i, m.index)));
    if (m[1] != null) parts.push(<b>{txt(m[1])}</b>);
    else if (m[2] != null) parts.push(<Kbd>{m[2]}</Kbd>);
    else {
      const id = m[3];
      parts.push(
        byId.has(id) ? (
          <button type="button" className="guide__link" onClick={() => open(id)}>
            {m[4] ? hk(m[4]) : titleOf(id)}
          </button>
        ) : (
          m[4] || id
        ),
      );
    }
    i = m.index! + m[0].length;
  }
  if (i < text.length) parts.push(txt(text.slice(i)));
  return (
    <>
      {parts.map((p, k) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts are rebuilt from one string, their order is the key
        <Fragment key={k}>{p}</Fragment>
      ))}
    </>
  );
}

/**
 * Highlights the search word inside a line (accents ignored: the position is found in the normalised text, which
 * has the same length).
 * @param s - the line
 * @param q - the first search word, already normalised
 * @returns the line unchanged when the word is not found or the lengths differ
 */
export function Mark(s: string, q: string) {
  const n = normGreek(s).replace(/\s/g, ' ');
  const at = n.indexOf(q);
  if (at < 0 || n.length !== s.length) return s;
  return (
    <>
      {s.slice(0, at)}
      <mark>{s.slice(at, at + q.length)}</mark>
      {s.slice(at + q.length)}
    </>
  );
}
