// Screen «Σημειώσεις»: quick add on top (Ctrl+Enter), filters and people on the left, the notes grouped by reminder.
// Purpose: `NotesScreen`; Michael 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε» (general, per soldier, per cadre member).
// Does NOT: hold state (model/useNotes.ts), the filter rules (model/view.ts) or the composer (features/note-compose).
// Owner layer: renderer/pages/notes. Why: moved verbatim from screens/notes.ts (Phase 6); the markup, keys and text
//   nodes are exactly what the htm version rendered.
// Covering test: test/screens-main.test.ts, test/notes-view.test.ts.
import { NOTE_FILTERS } from '../../../../shared/notes';
import { EditDialog, NoteComposer, NoteGroup as Group } from '../../../features/note-compose';
import { cx } from '../../../shared/lib/cx';
import { Button, PageHeader } from '../../../shared/ui';
import { useNotes } from '../model/useNotes';

/** The «Σημειώσεις» page, also opened from Ctrl+K and from the «Σημειώσεις» tab of a person. */
export function NotesScreen() {
  const {
    notes,
    filter,
    who,
    q,
    setQ,
    edit,
    setEdit,
    draft,
    compRef,
    due,
    open,
    counts,
    people,
    rows,
    g,
    done,
    openWho,
    setFilter,
    pickWho,
    filtered,
    clear,
    sub,
  } = useNotes();
  return (
    <div>
      <PageHeader title="Σημειώσεις" sub={sub}>
        <Button
          variant="outline"
          data-tip="Από οποιαδήποτε οθόνη: Ctrl+Shift+N"
          onClick={() => {
            (document.getElementById('nt-text') as HTMLElement | null)?.focus();
            compRef.current?.scrollIntoView?.({ block: 'nearest' });
          }}
        >
          + Νέα σημείωση
        </Button>
      </PageHeader>
      <div className="notes-layout">
        <aside className="notes-side" aria-label="Φίλτρα σημειώσεων">
          {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before */}
          <div className="notes-filters" role="group">
            {NOTE_FILTERS.map(([f, l]) => (
              <button
                key={f}
                type="button"
                className="notes-f"
                aria-pressed={filter === f && !who}
                onClick={() => setFilter(f)}
              >
                {l}
                <span className={cx('cnt', f === 'rem' && due > 0 && 'is-hot')}>
                  {f === 'rem' && due > 0 ? due : counts[f]}
                </span>
              </button>
            ))}
          </div>
          {people.length > 0 && (
            <>
              <div className="notes-sep">Άτομα με σημειώσεις</div>
              {/* biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with role="group" as before */}
              <div className="notes-filters notes-people" role="group">
                {people.map((x) => (
                  <button
                    key={x.k}
                    type="button"
                    className="notes-f"
                    aria-pressed={who === x.k}
                    onClick={() => pickWho(x.k)}
                  >
                    <span className="notes-f__t">{x.label}</span>
                    <span className="cnt">{x.n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <div className="notes-main">
          <div className="ui-card note-quick" ref={compRef}>
            <NoteComposer draft={draft} />
          </div>
          <div className="toolbar">
            <input
              type="search"
              className="ui-input"
              aria-label="Αναζήτηση στις σημειώσεις"
              placeholder="Αναζήτηση στο κείμενο και στο όνομα (χωρίς τόνους) · Ctrl+F"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Καθάρισε τα φίλτρα
              </Button>
            )}
            <span className="toolbar__count">
              {rows.length} από {filter === 'done' ? counts.done : open.length}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="ui-card empty">
              {notes.length === 0
                ? 'Δεν υπάρχει καμία σημείωση ακόμα. Γράψε την πρώτη στο πλαίσιο από πάνω: ό,τι θα έγραφες σε χαρτάκι και θα το ξεχνούσες.'
                : filtered
                  ? 'Καμία σημείωση δεν ταιριάζει με αυτά τα φίλτρα.'
                  : 'Δεν έχεις ανοιχτές σημειώσεις.'}
            </div>
          ) : filter === 'done' ? (
            <Group title="Ολοκληρωμένες" list={done} onEdit={setEdit} onOpen={openWho} />
          ) : (
            <>
              <Group title="Πρέπει σήμερα" list={g.due} onEdit={setEdit} onOpen={openWho} />
              <Group title="Με υπενθύμιση" list={g.soon} onEdit={setEdit} onOpen={openWho} />
              <Group
                title={g.due.length || g.soon.length ? 'Χωρίς υπενθύμιση' : 'Σημειώσεις'}
                list={g.rest}
                onEdit={setEdit}
                onOpen={openWho}
              />
            </>
          )}
        </div>
      </div>
      {edit && <EditDialog note={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
