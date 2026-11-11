// The logic of the quick-add dialog: rows, draft, checks, and what the keys, paste and buttons do.
// Purpose: `useQuickAdd` = `useQuickAddData` (state and checks) + effects + `useQuickAddActions` (handlers), called by
//   one component in this fixed order.
// Does NOT: draw anything, or change the draft format (model/draft.ts) or the `addPeople` command.
// Owner layer: renderer/features/quick-add. Why: moved verbatim from the 90-line body of QuickAddDialog.
// Covering test: test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type SetStateAction,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';
import { roomCfg, type Person } from '../../../../shared/domain';
import { essoPersonTxt } from '../../../../shared/esso';
import { listOf, optionsOf } from '../../../../shared/ranks';
import {
  QA_COLS,
  carryOf,
  checkRows,
  emptyRow,
  isFilled,
  parsePaste,
  toNewPerson,
  type QaKey,
  type QaRow,
} from '../../../../shared/quickAdd';
import { currentEssos } from '../../../../shared/rosterLists';
import { siCombos } from '../../../../shared/si';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import type { QaLists } from '../ui/QuickAddRow';
import { LISTED, isCarried, loadDraft, range, saveDraft, withTail } from './draft';

/** Which cell takes the focus after the next render. */
type FocusAt = { r: number; c: number } | null;

/** State, lists and checks of the dialog. */
export interface QuickAddData {
  store: ReturnType<typeof useStore>;
  toast: ReturnType<typeof useToast>;
  nav: ReturnType<typeof useNav>;
  /** The draft found when the dialog opened, if any. */
  draft: ReturnType<typeof loadDraft>;
  rows: QaRow[];
  setRows: Dispatch<SetStateAction<QaRow[]>>;
  essos: string;
  setEssos: (s: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  asking: boolean;
  setAsking: (b: boolean) => void;
  focus: MutableRefObject<FocusAt>;
  lists: QaLists;
  /** One message (or null) per row, worked out a little behind the typing. */
  errs: (string | null)[];
  /** Filled rows. */
  n: number;
  /** Rows that need a correction. */
  bad: number;
}

/** State hooks, in the order the component had them. */
export function useQuickAddData(): QuickAddData {
  const store = useStore();
  const toast = useToast();
  const nav = useNav();
  const { state } = store;
  const defEssos = useMemo(
    () => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)),
    [state.settings.essos, state.people],
  );
  const [draft] = useState(loadDraft);
  const [rows, setRows] = useState<QaRow[]>(() => withTail(draft?.rows || []));
  const [essos, setEssos] = useState(draft?.essos || defEssos);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const focus = useRef<FocusAt>(null);
  const ranks = useMemo(
    () =>
      optionsOf(
        listOf(state.settings.lists, 'soldierRanks'),
        state.people.map((y: Person) => y.rank),
      ),
    [state.people, state.settings.lists],
  );
  const specs = useMemo(
    () =>
      optionsOf(
        listOf(state.settings.lists, 'specs'),
        state.people.map((y: Person) => y.spec),
      ),
    [state.people, state.settings.lists],
  );
  const roomN = roomCfg(state.settings).n;
  const siList = state.settings.lists?.si;
  const lists = useMemo(
    () => ({ rank: ranks, spec: specs, room: range(roomN).map(String), si: siCombos(siList) }),
    [ranks, specs, roomN, siList],
  );
  // why: the check runs a little behind the keyboard, so many rows do not slow the typing
  const dRows = useDeferredValue(rows);
  const errs = useMemo(() => checkRows(state.people, dRows), [state.people, dRows]);
  const n = rows.filter(isFilled).length;
  const bad = errs.filter(Boolean).length;
  return {
    store,
    toast,
    nav,
    draft,
    rows,
    setRows,
    essos,
    setEssos,
    busy,
    setBusy,
    asking,
    setAsking,
    focus,
    lists,
    errs,
    n,
    bad,
  };
}

/** The draft is saved on every change; the focus request of the last key press is carried out after the render. */
function useQuickAddEffects({ rows, essos, focus }: QuickAddData): void {
  useEffect(() => {
    saveDraft(rows, essos);
  }, [rows, essos]);
  useEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    const el = document.querySelector(`.qa [data-r="${f.r}"][data-c="${f.c}"]`) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

/** The handlers of the dialog. */
export interface QuickAddActions {
  onCell: (i: number, k: QaKey, v: string) => void;
  onDel: (i: number) => void;
  save: () => Promise<void>;
  onKey: (e: KeyboardEvent<HTMLInputElement>, i: number, c: number) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, i: number, c: number) => void;
  close: () => void;
  clear: () => void;
}

/** Writes the cell; a changed rank, Ο/Σ or room is copied to the empty row below. */
const setCell = (rs: QaRow[], i: number, k: QaKey, v: string): QaRow[] => {
  const out = rs.slice();
  out[i] = { ...rs[i], [k]: v };
  if (isCarried(k) && out[i + 1] && !isFilled(out[i + 1]) && i + 1 === out.length - 1) {
    out[i + 1] = { ...out[i + 1], [k]: v };
  }
  return withTail(out);
};

/** Puts the pasted lines into the rows from row `i`, each new line carrying the rank, Ο/Σ and room of the one above. */
const pasteRows = (rs: QaRow[], i: number, got: Partial<QaRow>[]): QaRow[] => {
  const out = rs.slice();
  let carry: Partial<QaRow> = i > 0 ? carryOf(rs[i - 1]) : { rank: 'ΣΤΡ' };
  got.forEach((g, j) => {
    const cur = out[i + j];
    const base = cur && isFilled(cur) ? cur : emptyRow(cur ? carryOf(cur) : carry);
    out[i + j] = { ...base, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== '')) };
    carry = carryOf(out[i + j]);
  });
  return withTail(out);
};

/** «Πρόσθεσε»: adds all filled rows in one command (one undo), clears the draft, and goes to the people list. */
const saveOf = (d: QuickAddData, onClose: () => void) => async () => {
  const { store, toast, nav, rows, essos, busy, setBusy, bad } = d;
  const { state, run, undoMark } = store;
  const list = rows.filter(isFilled);
  if (!list.length || bad || busy) return;
  setBusy(true);
  try {
    const next = await run({ t: 'addPeople', people: list.map((r) => toNewPerson(r, essos)) }, false);
    if (!next) return;
    saveDraft([], essos);
    onClose();
    nav.go('people');
    const b = state.settings.sources?.people;
    toast({
      text:
        (list.length === 1 ? 'Προστέθηκε 1 στρατιώτης' : 'Προστέθηκαν ' + list.length + ' στρατιώτες') +
        (b && b.write !== false ? '. Γράφονται και στο Δυναμολόγιο.' : '.'),
      actions: [undoMark()],
    });
  } finally {
    setBusy(false);
  }
};

/** The handlers; `onCell`, `onDel`, `onKey` and `onPaste` are stable, so the memo rows do not re-render. */
export function useQuickAddActions(d: QuickAddData, onClose: () => void): QuickAddActions {
  const { toast, setRows, setAsking, busy, n, focus } = d;
  const onCell = useCallback((i: number, k: QaKey, v: string) => {
    setRows((rs) => setCell(rs, i, k, v));
  }, []);
  const onDel = useCallback((i: number) => {
    setRows((rs) => withTail(rs.filter((_, j) => j !== i)));
    focus.current = { r: i, c: 2 };
  }, []);
  const save = saveOf(d, onClose);
  const saveRef = useRef(save);
  saveRef.current = save;
  const onKey = useCallback((e: KeyboardEvent<HTMLInputElement>, i: number, c: number) => {
    const go = (r: number, col: number) => {
      e.preventDefault();
      focus.current = { r, c: col };
      setRows((rs) => rs.slice());
    };
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveRef.current();
      return;
    }
    // Enter: to the last name of the next row (rank, Ο/Σ and room come from above)
    if (e.key === 'Enter') {
      go(i + 1, QA_COLS.indexOf('last'));
      return;
    }
    // ↑↓ to another row, same column (not in the columns with a list, where the arrows pick from the list)
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !LISTED.includes(QA_COLS[c])) {
      const r = i + (e.key === 'ArrowDown' ? 1 : -1);
      if (r >= 0) go(r, c);
    }
  }, []);
  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>, i: number, c: number) => {
      const got = parsePaste(e.clipboardData?.getData('text/plain') || '', c);
      if (!got) return;
      e.preventDefault();
      setRows((rs) => pasteRows(rs, i, got));
      toast({
        text:
          'Επικολλήθηκαν ' +
          got.length +
          (got.length === 1 ? ' γραμμή' : ' γραμμές') +
          '. Έλεγξε τις στήλες πριν από την προσθήκη.',
      });
    },
    [toast],
  );
  // closing with soldiers not added asks first (they stay in the draft)
  const close = () => {
    if (busy) return;
    if (n) setAsking(true);
    else onClose();
  };
  const clear = () => {
    setRows(withTail([]));
    focus.current = { r: 0, c: 2 };
  };
  return { onCell, onDel, save, onKey, onPaste, close, clear };
}

/** Everything the dialog reads. */
export type QuickAdd = QuickAddData & QuickAddActions;

/** The logic of `QuickAddDialog`. */
export function useQuickAdd(onClose: () => void): QuickAdd {
  const data = useQuickAddData();
  useQuickAddEffects(data);
  return { ...data, ...useQuickAddActions(data, onClose) };
}
