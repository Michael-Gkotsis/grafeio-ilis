// The «@» suggestions under the note text.
// Purpose: `useMention` finds soldiers and cadre while the text ends in «@…», handles the keys of the list and returns
// the list markup.
// Does NOT: bind the person to the note (the caller's `pick` does) or own the text.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { cadreSearch, orderedCadre } from '../../../../shared/cadre';
import { rankTxt } from '../../../../shared/ranks';
import { searchPeople } from '../../../entities/person';
import { useStore } from '../../../shared/model';

/** The person a suggestion stands for. */
export type MentionPick = { kind: 'sol'; id: number } | { kind: 'cad'; id: string };

/** The suggestion list markup (plain function, not a component: it is drawn inside the owner's render). */
function mentionList(
  items: { kind: 'sol' | 'cad'; id: string | number; label: string; sub: string }[],
  q: string | null,
  sel: number,
  setSel: (i: number) => void,
  choose: (i: number) => void,
) {
  return (
    <ul
      className="note-sug"
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: markup kept as it was
      role="listbox"
      aria-label="Άτομα"
    >
      {items.length === 0 ? (
        <li className="note-sug__hd">{q ? 'Κανείς δεν ταιριάζει.' : 'Γράψε τα πρώτα γράμματα του επωνύμου…'}</li>
      ) : (
        items.map((x, i) => (
          // biome-ignore lint/a11y/useFocusableInteractive: markup kept as it was; the textarea keeps the focus
          <li
            key={x.kind + x.id}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: markup kept as it was (Phase 5.3b moves, it does not redraw)
            role="option"
            aria-selected={i === sel}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(i);
            }}
            onMouseEnter={() => setSel(i)}
          >
            <b>{x.label}</b>
            <small>{x.sub}</small>
          </li>
        ))
      )}
    </ul>
  );
}

/**
 * Γράφοντας «@» και τα πρώτα γράμματα, προτείνει στρατιώτες και στελέχη (το κείμενο μπορεί να έχει και email, γι' αυτό μόνο στο τέλος).
 * `onKey` returns true when the list took the key. `list` is null while there is no «@…» at the end.
 */
export function useMention(text: string, setText: (t: string) => void, pick: (x: MentionPick) => void) {
  const { state } = useStore();
  const [sel, setSel] = useState(0);
  const [off, setOff] = useState(false);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const q = m ? m[1] : null;
  useEffect(() => {
    setSel(0);
    setOff(false);
  }, [q]);
  const items = useMemo(() => {
    if (!q) return [];
    const ppl = searchPeople(state.people, q)
      .slice(0, 5)
      .map((p) => ({ kind: 'sol' as const, id: p.id, label: p.last + ' ' + p.first, sub: rankTxt(p) || 'Στρατιώτης' }));
    const cad = orderedCadre(state.cadreList)
      .filter((c) => c.active && cadreSearch(c, q))
      .slice(0, 3)
      .map((c) => ({ kind: 'cad' as const, id: c.id, label: c.last + ' ' + c.first, sub: 'Στέλεχος · ' + rankTxt(c) }));
    return [...ppl, ...cad];
  }, [q, state.people, state.cadreList]);
  const open = q != null && !off;
  // το όνομα μπαίνει στο κείμενο (@ΕΠΩΝΥΜΟ ΟΝΟΜΑ) και το άτομο δένεται με τη σημείωση· όσα άτομα θες
  const choose = (i: number) => {
    const x = items[i];
    if (!x) return;
    setText(text.replace(/@([^\s@]*)$/, () => '@' + x.label + ' '));
    pick(x);
  };
  // true: το πλήκτρο το πήρε η λίστα
  const onKey = (e: KeyboardEvent): boolean => {
    if (!open) return false;
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOff(true);
      return true;
    }
    if (!items.length) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (s + 1) % items.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s + items.length - 1) % items.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
      e.preventDefault();
      choose(sel);
      return true;
    }
    return false;
  };
  const list = open ? mentionList(items, q, sel, setSel, choose) : null;
  return { onKey, list };
}
