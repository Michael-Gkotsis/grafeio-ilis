// State of the «Κινήσεις» tab: the view, the search, the ticked moves and the dialogs.
// Purpose: `useMoves`, the hooks of `MovesView`, in the order the tab always called them.
// Does NOT: draw anything (ui/MovesView.tsx) or hold the rules (shared/weaponView.ts, model/view.ts).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weaponMoves.ts (Phase 6); hook order and every
//   dependency list are unchanged.
// Covering test: test/screens-main.test.ts (weapons--moves), test/weapons.test.ts.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNav, useStore } from '../../../shared/model';
import { useViewportHeight } from '../../../shared/ui';
import { armedRows, type ArmRow } from '../../../../shared/armed';
import { dm } from '../../../../shared/dates';
import type { Person, WeaponMove } from '../../../../shared/domain';
import { byOut, dutyMove, idRange, movesOn, type WeaponInfo } from '../../../../shared/weapons';
import { fixIds, inIds, moveFilter, moveReasons, openMoveList } from '../../../../shared/weaponView';

/** What the tab gets from the screen. */
export interface MovesProps {
  /** ISODate, local time: the day of the screen. */
  date: string;
  info: WeaponInfo;
  /** People by id, with cadre members in an armed duty. */
  pm: Map<number, Person>;
  /** How many weapons are out now (the number in the first segment). */
  outN: number;
}

/**
 * Everything the tab reads and calls.
 * @returns the view (`view`: `open`, `day` or `all`), the search `q` / `dq`, the list `rows` (newest first), the reason
 *   chips `reasons`, the ticks `sel`, the dialogs' state (`edit`, `fix`, `inFor`, `bulkFix`) and the handlers
 */
export function useMovesList({ date, info, pm }: MovesProps) {
  const { state, today } = useStore();
  const nav = useNav();
  const view: string = nav.params.wmoves || 'open';
  const reasonF: string = view === 'open' ? nav.params.wmreason || '' : '';
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [edit, setEdit] = useState<WeaponMove | null>(null);
  const [fix, setFix] = useState<ArmRow | null>(null);
  const [inFor, setInFor] = useState<string[] | null>(null);
  const [bulkFix, setBulkFix] = useState<string[] | null>(null);
  const [sel, setSel] = useState(() => new Set<string>());
  const anchor = useRef<string | null>(null);
  const log = state.weaponLog || [];
  const lists = state.settings.lists;
  const all = useMemo(() => {
    if (view === 'open') return openMoveList(state, info);
    const auto: WeaponMove[] = view === 'day' ? armedRows(state, date).map((r: ArmRow) => dutyMove(state, r)) : [];
    return [...(view === 'day' ? movesOn(log, date) : log), ...auto];
  }, [log, view, date, info, state.people, state.guards, state.dutyLog, state.settings, state.rules, state.dutyFix]);
  const reasons = useMemo(() => (view === 'open' ? moveReasons(all) : []), [all, view]);
  const rows = useMemo(() => moveFilter(all, pm, reasonF, dq).sort(byOut).reverse(), [all, pm, reasonF, dq]);
  // The ticks are for what is shown; change view, chip or search and they start again (nothing hidden).
  useEffect(() => {
    setSel(new Set());
    anchor.current = null;
  }, [view, reasonF, dq]);
  return {
    nav,
    state,
    today,
    lists,
    log,
    view,
    reasonF,
    q,
    setQ,
    dq,
    edit,
    setEdit,
    fix,
    setFix,
    inFor,
    setInFor,
    bulkFix,
    setBulkFix,
    sel,
    setSel,
    anchor,
    reasons,
    rows,
  };
}

/** The list part of the tab: the view, the search, the dialogs' state, the ticks and the rows. */
export type MovesList = ReturnType<typeof useMovesList>;

/** The ticks, the handlers and the focus effects of the tab. */
export function useMoves(props: MovesProps) {
  const { date, outN, pm } = props;
  const list = useMovesList(props);
  const { nav, today, view, reasonF, setQ, setSel, sel, anchor, reasons, rows } = list;
  const ticks = useMemo(() => fixIds(rows), [rows]);
  const selRows = rows.filter((m) => sel.has(m.id));
  const selIn = inIds(selRows);
  const selFix = fixIds(selRows);
  const allSel = ticks.length > 0 && ticks.every((id) => sel.has(id));
  const toggle = useCallback(
    (id: string, shift?: boolean) => {
      const a = anchor.current;
      anchor.current = id;
      setSel((s) => {
        const on = !s.has(id);
        const r = shift && a != null ? idRange(ticks, a, id) : [];
        const ids = r.length ? r : [id];
        return on ? new Set([...s, ...ids]) : new Set([...s].filter((x) => !ids.includes(x)));
      });
    },
    [ticks],
  );
  const openP = useCallback(
    (id: number) =>
      nav.openPerson(
        id,
        rows.map((m) => m.pid),
      ),
    [nav.openPerson, rows],
  );
  const inAll = view === 'open' ? inIds(rows) : [];
  const dayLbl = date === today ? 'Σήμερα' : dm(date);
  const clear = () => {
    setQ('');
    nav.set({ wmreason: null });
  };
  // The last one of the reason came in: the chip goes away.
  useEffect(() => {
    if (reasonF && !reasons.some((r) => r[0] === reasonF)) nav.set({ wmreason: null });
  }, [reasons, reasonF]);
  const height = useViewportHeight(410 + (view === 'open' && reasons.length ? 40 : 0) + (selRows.length ? 48 : 0));
  // Ctrl+K «Είσοδος όλων…»: comes here and goes to the button.
  useEffect(() => {
    if (nav.params.wfocus === 'in') {
      (document.querySelector('[data-moves-in]') as HTMLElement | null)?.focus();
      nav.set({ wfocus: null });
    }
  }, [nav.params.wfocus, inAll.length]);
  return { ...list, outN, pm, ticks, selRows, selIn, selFix, allSel, toggle, openP, inAll, dayLbl, clear, height };
}

/** Everything `useMoves` returns. */
export type MovesApi = ReturnType<typeof useMoves>;
