// The text of one guide topic: sub-titles, paragraphs, lists, tips and warnings, tables.
// Purpose: `Body`, a component (own memo of the parsed blocks), and `Pager`, the previous / next topic buttons.
// Does NOT: choose the topic or search (model/useGuide.ts).
// Owner layer: renderer/pages/guide. Why: moved verbatim from screens/guide.ts (Phase 6).
// Covering test: test/screens-settings-guide.test.ts.
import { useMemo } from 'react';
import { GUIDE, type GuideTopic } from '../../../guideText';
import { cx } from '../../../shared/lib/cx';
import { Alert, Button } from '../../../shared/ui';
import { type Block, hk, parseGuide } from '../model/view';
import { Inline } from './Inline';

/**
 * A topic's blocks.
 * @param topic - the open topic
 * @param open - opens another topic (a link click)
 */
export function Body({ topic, open }: { topic: GuideTopic; open: (id: string) => void }) {
  const blocks = useMemo(() => parseGuide(topic.body), [topic]);
  const I = (t: string) => <Inline text={t} open={open} />;
  const one = (b: Block, k: number) => {
    if (b.t === 'table')
      return (
        <div key={k} className="guide__table">
          <table className="legend">
            <thead>
              <tr>
                {b.rows[0].map((c, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id, columns keep their order
                  <th key={j}>{I(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.slice(1).map((r, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id, they keep their order
                <tr key={j}>
                  {r.map((c, x) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: cells have no id, columns keep their order
                    <td key={x}>{I(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    if ('items' in b) {
      const List = b.t;
      return (
        <List key={k} start={b.start}>
          {b.items.map((x, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items have no id, they keep their order
            <li key={j}>{I(x)}</li>
          ))}
        </List>
      );
    }
    if (b.t === 'h') return <h3 key={k}>{hk(b.text)}</h3>;
    if (b.t === 'p') return <p key={k}>{I(b.text)}</p>;
    return (
      <Alert key={k} tone={b.t === 'tip' ? 'info' : 'warn'}>
        <span>{I(b.text)}</span>
      </Alert>
    );
  };
  return <>{blocks.map(one)}</>;
}

/**
 * Previous / next topic, for whoever reads from the first to the last.
 * @param id - the open topic's id
 * @param open - opens a topic
 */
export function Pager({ id, open }: { id: string; open: (id: string) => void }) {
  const i = GUIDE.findIndex((t) => t.id === id);
  const prev = GUIDE[i - 1];
  const next = GUIDE[i + 1];
  return (
    <div className={cx('guide__pager')}>
      {prev ? (
        <Button variant="ghost" size="sm" onClick={() => open(prev.id)}>
          ← {hk(prev.title)}
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button variant="ghost" size="sm" onClick={() => open(next.id)}>
          {hk(next.title)} →
        </Button>
      )}
    </div>
  );
}
