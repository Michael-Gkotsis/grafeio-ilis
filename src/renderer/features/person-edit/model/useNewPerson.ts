// State and actions of the «Νέος στρατιώτης» dialog.
// Purpose: `useNewPerson` holds the draft, the list of those added with «Προσθήκη και επόμενος», the unsaved-ask and the
//   save / save-and-next / Ctrl+Enter actions, for `NewPersonDialog`.
// Does NOT: draw anything. Every hook of the dialog is called here, in the order the dialog had them.
// Owner layer: renderer/features/person-edit. Why: moved verbatim from NewPersonDialog's body (Phase 5.3c).
// Covering test: test/dialog-cases.test.ts.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Person } from '../../../../shared/domain';
import { essoPersonTxt } from '../../../../shared/esso';
import { currentEssos } from '../../../../shared/rosterLists';
import { useNav, useStore } from '../../../shared/model';
import { missingOf } from '../../../shared/lib/missingOf';
import { useToast } from '../../../shared/ui';

/** An empty form of a new soldier, with the most frequent ΕΣΣΟ and the given fields over it. */
function blankPerson(essos: string | undefined, c: Partial<Person>) {
  return {
    rank: 'ΣΤΡ',
    spec: '',
    last: '',
    first: '',
    father: '',
    asm: '',
    phone: '',
    room: null,
    si: 'Ι1',
    post: null,
    role: null,
    essos,
    attached: false,
    notes: '',
    weapon: '',
    ...c,
  } as Person;
}

/** The state of the dialog and its actions. */
export function useNewPerson(onClose: () => void) {
  const { run, state, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  // η πιο συχνή ΕΣΣΟ όσων είναι σε δύναμη
  const essos = useMemo(
    () => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)),
    [state.settings.essos, state.people],
  );
  const blank = (c: Partial<Person> = {}) => blankPerson(essos, c);
  const [x, setX] = useState<Person>(blank);
  const [done, setDone] = useState<string[]>([]); // όσοι μπήκαν με «Προσθήκη και επόμενος»
  const [gen, setGen] = useState(0);
  const ok = !!x.last.trim() && !!x.first.trim();
  const miss = missingOf([
    ['Επώνυμο', x.last.trim()],
    ['Όνομα', x.first.trim()],
  ]);
  // γράφτηκε κάτι που δεν προστέθηκε: πριν κλείσει ρωτά (Michael, 19/10)
  const dirty = (['last', 'first', 'father', 'asm', 'phone', 'notes', 'weapon', 'post', 'role'] as const).some((k) =>
    String(x[k] ?? '').trim(),
  );
  const [asking, setAsking] = useState<null | (() => void)>(null);
  const close = (after?: () => void) => {
    if (dirty)
      setAsking(() => () => {
        onClose();
        after?.();
      });
    else {
      onClose();
      after?.();
    }
  };
  const name = x.last.trim().toUpperCase() + ' ' + x.first.trim().toUpperCase();
  const toExcel = () => {
    const b = state.settings.sources?.people;
    return !!b && b.write !== false;
  };
  const save = async () => {
    if (!ok) return;
    const next = await run({ t: 'addPerson', person: x }, false);
    if (!next) return;
    onClose();
    nav.openPerson(next.people.reduce((a: number, y: Person) => Math.max(a, y.id), 0)); // ο νέος έχει τον μεγαλύτερο αριθμό
    toast({
      text: 'Προστέθηκε ο ' + name + (toExcel() ? '. Γράφεται και στο Δυναμολόγιο.' : '.'),
      actions: [undoMark()],
    });
  };
  const saveNext = async () => {
    if (!ok) return;
    if (!(await run({ t: 'addPerson', person: x }, false))) return;
    setDone((d) => [...d, name]);
    setX(blank({ rank: x.rank, origin: x.origin, spec: x.spec, room: x.room, essos: x.essos }));
    setGen((g) => g + 1);
  };
  useEffect(() => {
    if (gen) (document.getElementById('np-last') as HTMLInputElement | null)?.focus();
  }, [gen]);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveNext();
    }
  };
  return { state, x, setX, done, gen, ok, miss, dirty, asking, setAsking, close, name, toExcel, save, saveNext, keys };
}

/** What `useNewPerson` returns. */
export type NewPersonModel = ReturnType<typeof useNewPerson>;
