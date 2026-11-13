// The search box of «Ρυθμίσεις» and its list of results.
// Purpose: `SettingsSearchBox` (the input in the page header) and `SettingsResults` (the list shown instead of the open
//   section while something is typed).
// Does NOT: search or navigate (model/settingsIndex.ts, model/useSettingsSearch.ts) or touch the cards.
// Owner layer: renderer/pages/settings. Why: U11b; same look as the guide search (box, `mark`, snippet line).
// Covering test: test/screens-settings-guide.test.ts, test/settings-index.test.ts.
import { Fragment } from 'react';
import { Button } from '../../../shared/ui';
import { markParts, pathOf } from '../model/settingsIndex';
import type { SettingsSearch } from '../model/useSettingsSearch';

const RESULTS_ID = 'settings-results';

/** Highlights the typed words inside a line. */
const Marked = ({ text, words }: { text: string; words: string[] }) => (
  <>
    {markParts(text, words).map((part, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts are rebuilt from one string, their order is the key
      <Fragment key={i}>{part.hit ? <mark>{part.text}</mark> : part.text}</Fragment>
    ))}
  </>
);

/** The input for the `PageHeader`; Ctrl+F focuses it (it is the only search box of the page). */
export function SettingsSearchBox({ s }: { s: SettingsSearch }) {
  return (
    <input
      type="search"
      className="ui-input settings__search"
      aria-label="Αναζήτηση ρύθμισης"
      aria-controls={s.on ? RESULTS_ID : undefined}
      placeholder="Βρες ρύθμιση… · Ctrl+F"
      value={s.q}
      onChange={(e) => s.setQ(e.target.value)}
      onKeyDown={s.onKeyDown}
    />
  );
}

/** The results card: one button per setting with its path, or the «nothing found» line. */
export function SettingsResults({ s }: { s: SettingsSearch }) {
  if (!s.results.length) {
    return (
      <div className="ui-card settings__results" aria-live="polite">
        <p className="settings__none">
          Καμία ρύθμιση δεν ταιριάζει με «{s.q.trim()}»
          <Button variant="ghost" size="sm" onClick={() => s.setQ('')}>
            Καθάρισε
          </Button>
        </p>
      </div>
    );
  }
  return (
    <div className="ui-card settings__results">
      <p className="settings__count" aria-live="polite">
        {s.results.length === 1 ? '1 ρύθμιση' : `${s.results.length} ρυθμίσεις`}
      </p>
      <ul className="settings__hits" id={RESULTS_ID}>
        {s.results.map((entry, i) => (
          <li key={`${entry.label}|${pathOf(entry.where)}`}>
            <button
              type="button"
              className="settings__hit"
              aria-current={i === s.pick ? 'true' : undefined}
              onMouseEnter={() => s.setPick(i)}
              onClick={() => s.open(entry)}
            >
              <span className="settings__hit-label">
                <Marked text={entry.label} words={s.words} />
              </span>
              <span className="settings__hit-path">
                <Marked text={pathOf(entry.where)} words={s.words} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
