// State and derived lists of the person picker.
// Purpose: `usePersonPicker` holds the typed text, the open/selected state, the filtered rows and the pick action.
// Does NOT: render anything or know the markup (ui/PersonPicker.tsx does).
// Owner layer: renderer/entities/person. Why: view logic lives in `model/`, the component only draws.
// Covering test: test/screens-main.test.ts (pickers in dialogs), test/ux-names.test.ts (search by Greek/Latin text).
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Person } from '../../../../shared/domain';
import { useFloat } from '../../../shared/ui';
import { useStore } from '../../../shared/model/store';
import { searchPeople } from './search';

/** A row of the list: the person and the reason they cannot be chosen (`null`: free). */
export interface PickerRow {
  p: Person;
  na: string | null | undefined;
}

/** What the picker needs from its props (the single/multiple split is resolved by the component). */
export interface PickerInput {
  multiple: boolean;
  /** The ids already chosen (multiple mode only). */
  chosen: number[];
  /** Another list than the soldiers (guard duties, ΕΠΟΠ/ΟΒΑ cadre with duties). */
  people?: Person[];
  unavailable?: (p: Person) => string | null | undefined;
  onBlocked?: (p: Person, why: string) => void;
  /** Called with the picked id in single mode. */
  onPickOne: (id: number) => void;
  /** Called with the new list in multiple mode. */
  onPickMany: (ids: number[]) => void;
}

/** Everything the markup reads. */
export function usePersonPicker(input: PickerInput) {
  const { multiple, chosen, people, unavailable, onBlocked, onPickOne, onPickMany } = input;
  const { state, today } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const dq = useDeferredValue(q);
  const all: Person[] = people || state.people;
  const pm = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  // Everyone who matches, not only the first 8 (@decision Michael 17/10: «να τους βγάζεις όλους στο search»); the
  // list scrolls. Cadre members (when the list has any) come last, in their own group.
  const items = useMemo(() => {
    const l: PickerRow[] = searchPeople(all, dq)
      .filter((p) => !chosen.includes(p.id))
      .map((p) => ({ p, na: unavailable ? unavailable(p) : null }));
    return l.some((x) => x.p.cid) ? [...l.filter((x) => !x.p.cid), ...l.filter((x) => x.p.cid)] : l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, chosen.join(','), unavailable, all]);
  useEffect(() => {
    const i = items.findIndex((x) => !x.na);
    setSel(i < 0 ? 0 : i);
  }, [items]);
  const box = useRef<HTMLInputElement>(null);
  const pos = useFloat(box, open, 420);
  const list = useRef<HTMLUListElement>(null);
  // With the arrows the selection stays inside the scrolling list.
  useEffect(() => {
    (list.current?.children[sel] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }, [sel]);
  const pick = (i: number) => {
    const x = items[i];
    if (!x) return;
    if (x.na) {
      if (onBlocked) {
        setOpen(false);
        setQ('');
        onBlocked(x.p, x.na);
      }
      return;
    }
    if (multiple) {
      onPickMany([...chosen, x.p.id]);
      setQ('');
    } else {
      setOpen(false);
      setQ('');
      onPickOne(x.p.id);
    }
  };
  return { state, today, q, setQ, open, setOpen, sel, setSel, pm, items, box, pos, list, pick };
}
