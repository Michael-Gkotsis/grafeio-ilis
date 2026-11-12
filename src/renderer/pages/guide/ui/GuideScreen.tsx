// Screen «Οδηγός χρήσης» (Michael, 21/10): one topic per menu and setting, contents on the left, accent-free search
// and «what affects what» links. Loaded when opened, like Ρυθμίσεις. The texts are in src/renderer/guideText.ts.
// Purpose: `GuideScreen`, also opened from the top bar «Οδηγός χρήσης» and from topic links in other screens.
// Does NOT: hold state (model/useGuide.ts) or parse texts (model/view.ts).
// Owner layer: renderer/pages/guide. Why: moved verbatim from screens/guide.ts (Phase 6); Body, Pager and Inline stay
//   components and Mark a plain function, so React renders exactly what it rendered before.
// Covering test: test/screens-settings-guide.test.ts, test/guide.test.ts.
import { Fragment } from 'react';
import { GUIDE_GROUPS } from '../../../guideText';
import { Button, PageHeader } from '../../../shared/ui';
import { useGuide } from '../model/useGuide';
import { hk } from '../model/view';
import { Body, Pager } from './Body';
import { Mark } from './Inline';

/** The «Οδηγός χρήσης» page: search box, contents list and the open topic (or the search results). */
export function GuideScreen() {
  const { nav, boot, state, q, setQ, dq, topic, open, hits, first, group } = useGuide();
  return (
    <div className="guide">
      <PageHeader
        title="Οδηγός χρήσης"
        sub="Τι κάνει κάθε μενού, πώς το χρησιμοποιείς και τι επηρεάζει τι. Πάτα ένα θέμα αριστερά ή ψάξε μια λέξη."
      >
        <input
          type="search"
          className="ui-input guide__search"
          aria-label="Αναζήτηση στον οδηγό"
          placeholder="Ψάξε, π.χ. ΔΝ, κενή θέση, υπογραφές · Ctrl+F"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </PageHeader>
      <div className="guide__grid">
        <nav className="guidenav" aria-label="Περιεχόμενα οδηγού">
          {GUIDE_GROUPS.map(([g, label]) => (
            <Fragment key={g}>
              <span className="guidenav__group">{label}</span>
              {group(g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={!dq.trim() && topic.id === t.id ? 'page' : undefined}
                  onClick={() => open(t.id)}
                >
                  {hk(t.title)}
                </button>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="guide__body">
          {dq.trim() ? (
            <div className="ui-card guide__card">
              <h2 className="guide__title">
                {hits.length
                  ? 'Βρέθηκαν ' + hits.length + (hits.length === 1 ? ' θέμα' : ' θέματα')
                  : 'Δεν βρέθηκε κάτι'}
              </h2>
              {!hits.length && (
                <p className="muted">Δοκίμασε άλλη λέξη ή μόνο τα πρώτα γράμματα (π.χ. «ποιν» για ποινές).</p>
              )}
              <ul className="guide__hits">
                {hits.map((h) => (
                  <li key={h.topic.id}>
                    <button type="button" className="guide__link guide__hit" onClick={() => open(h.topic.id)}>
                      {hk(h.topic.title)}
                    </button>
                    {h.lines.map((l, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: snippets have no id, they keep their order
                      <p key={j} className="guide__snip">
                        {Mark(hk(l), first)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <article className="ui-card guide__card" aria-labelledby="guide-title">
              <div className="guide__head">
                <h2 id="guide-title" className="guide__title">
                  {hk(topic.title)}
                </h2>
                {topic.go && (
                  <Button variant="outline" size="sm" onClick={() => nav.go(topic.go!.view, topic.go!.params)}>
                    Άνοιξε: {hk(topic.go.label)}
                  </Button>
                )}
              </div>
              {topic.id === 'about' && (
                <dl className="kv guide__kv">
                  <dt>Έκδοση</dt>
                  <dd>{boot.version}</dd>
                  <dt>Δεδομένα</dt>
                  <dd>{boot.dataDir}</dd>
                  <dt>Έντυπα που βγαίνουν</dt>
                  <dd>{state.settings.outputDir || boot.outputDir}</dd>
                </dl>
              )}
              <Body topic={topic} open={open} />
              <Pager id={topic.id} open={open} />
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
