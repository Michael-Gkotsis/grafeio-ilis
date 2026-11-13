// The hooks that `useWhoDoes` is built from: the search and filters, the counters, the lists of units and rooms, and the
// callbacks of the memo rows.
// Purpose: keep `useWhoDoes` under the 80-line limit with the hooks called in the same order as before.
// Does NOT: read the store or decide what a click means beyond the commands (model/useWhoDoes.ts composes these).
// Owner layer: renderer/pages/guard. Why: split from the old screens/whodoes.ts hook during Phase 6; no logic changed.
// Covering test: test/screens-main.test.ts, test/perf.test.ts, test/guard-page-view.test.ts.
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { DOW_FULL } from '../../../../shared/dates';
import { platoonShort, platoonsOf, type Person, type Settings } from '../../../../shared/domain';
import type { CapCell, CapCol } from '../../../../shared/rules';
import { UNIT } from '../../../../shared/unit';
import { rkShort } from '../../../entities/person';
import type { useStore } from '../../../shared/model';
import type { useToast } from '../../../shared/ui';
import type { Filt } from './whoView';

type Store = ReturnType<typeof useStore>;

/** The kinds of a person's cells, as `kindsOf` gives them. */
type KindOf = (p: Person) => Record<Exclude<Filt, 'all'>, boolean>;

/**
 * The search, the filters and the way back to «all».
 * @param pid the soldier the tab opens with, or `null`/`undefined` for everybody
 * @returns the values with their setters, the deferred search `dq` and `clear`
 */
export function useWhoFilters(pid?: number | null) {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  // Came from a name (Θέσεις › Δεν μπαίνουν): only this one, until you search or clear the filter.
  const [only, setOnly] = useState<number | null>(pid ?? null);
  const [filter, setFilter] = useState<Filt>('all');
  const [colF, setColF] = useState<string | null>(null);
  const [unit, setUnit] = useState('all');
  const [room, setRoom] = useState<number | null>(null);
  const clear = () => {
    setQ('');
    setOnly(null);
    setFilter('all');
    setColF(null);
    setUnit('all');
    setRoom(null);
  };
  return { q, setQ, dq, only, setOnly, filter, setFilter, colF, setColF, unit, setUnit, room, setRoom, clear };
}

/**
 * The counters of the chips and of the column heads.
 * @param base the soldiers that pass the search, unit and room
 * @param cells the cells of every soldier by id
 * @param cols the columns
 * @param kindOf which chips a soldier belongs to
 */
export function useWhoCounts(base: Person[], cells: Map<number, CapCell[]>, cols: CapCol[], kindOf: KindOf) {
  const counts = useMemo(
    () =>
      base.reduce(
        (n, p) => {
          const k = kindOf(p);
          n.limited += +k.limited;
          n.manual += +k.manual;
          n.auto += +k.auto;
          return n;
        },
        { all: base.length, limited: 0, manual: 0, auto: 0 } as Record<string, number>,
      ),
    [base, cells],
  );
  const colN = useMemo(
    () => cols.map((_, i) => base.filter((p) => !cells.get(p.id)![i].on).length),
    [base, cells, cols],
  );
  return { counts, colN };
}

/** The choices of the unit select and the soldiers per room (rooms of active soldiers, ascending). */
export function useWhoLists(settings: Settings, people: Person[]) {
  const UNITS = useMemo(
    () => [
      { value: 'all', label: UNIT().all },
      ...platoonsOf(settings).map((u) => ({
        value: platoonShort(u.name),
        label: platoonShort(u.name),
        tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους',
      })),
    ],
    [settings.rooms],
  );
  const rooms = useMemo(
    () =>
      [
        ...people.reduce(
          (m, p) => (p.room != null ? m.set(p.room, (m.get(p.room) || 0) + 1) : m),
          new Map<number, number>(),
        ),
      ].sort((a, b) => a[0] - b[0]),
    [people],
  );
  return { UNITS, rooms };
}

/** The commands of the cells and the day buttons. */
interface WhoCommands {
  /** Calls `run` for a cell of one soldier and toasts the result with undo. */
  setCap: (p: Person, col: CapCol, v: 'on' | 'off' | 'clear', txt: string) => Promise<void>;
  /** Stable callbacks for the memo rows: they always call the current ones. */
  act: {
    cell: (p: Person, col: CapCol, c: CapCell) => unknown;
    day: (p: Person, d: number) => Promise<void>;
    reset: (p: Person) => Promise<void>;
  };
}

/**
 * What a click on a cell, a day or «Καθάρισε» does.
 * @param run the store command runner
 * @param toast the toast
 * @param undoMark the undo action of the toast
 * @param setAsk opens the question for an «auto» cell
 */
export function useWhoActions(
  run: Store['run'],
  toast: ReturnType<typeof useToast>,
  undoMark: Store['undoMark'],
  setAsk: (a: { p: Person; col: CapCol; why: string }) => void,
): WhoCommands {
  const done = (r: unknown, txt: string) => {
    if (r) toast({ text: txt + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.', actions: [undoMark()] });
  };
  const setCap = async (p: Person, col: CapCol, v: 'on' | 'off' | 'clear', txt: string) =>
    done(await run({ t: 'setCap', pid: p.id, key: col.key, v }, false), rkShort(p) + ': ' + txt);
  const onCell = (p: Person, col: CapCol, c: CapCell) => {
    const what = col.label.toLowerCase();
    if (c.src === 'force')
      return setCap(
        p,
        col,
        'clear',
        'ξανά όπως λέει ' + (c.why.startsWith('Πόστο') ? 'το πόστο' : 'η Σ.Ι.') + ', όχι ' + what,
      );
    if (c.on) return setCap(p, col, 'off', 'δεν κάνει ' + what);
    if (c.src === 'auto') {
      setAsk({ p, col, why: c.why });
      return;
    }
    // ✕ of the sergeant: it is erased; if the Σ.Ι./post below says «όχι», «—» stays.
    return setCap(p, col, 'clear', 'κάνει ξανά ' + what);
  };
  const onDay = async (p: Person, d: number) => {
    const cur = p.offDays || [];
    const on = cur.includes(d);
    done(
      await run({ t: 'setOffDays', pid: p.id, days: on ? cur.filter((x) => x !== d) : [...cur, d] }, false),
      rkShort(p) + (on ? ': κάνει ξανά υπηρεσία ' : ': όχι υπηρεσία ') + DOW_FULL[d],
    );
  };
  const onReset = async (p: Person) =>
    done(
      await run({ t: 'setDutyProfile', pid: p.id, reset: true, text: 'χωρίς εξαιρέσεις από τον λοχία' }, false),
      rkShort(p) + ': χωρίς εξαιρέσεις από τον λοχία',
    );
  const live = useRef({ onCell, onDay, onReset });
  live.current = { onCell, onDay, onReset };
  const act = useMemo(
    () => ({
      cell: (p: Person, col: CapCol, c: CapCell) => live.current.onCell(p, col, c),
      day: (p: Person, d: number) => live.current.onDay(p, d),
      reset: (p: Person) => live.current.onReset(p),
    }),
    [],
  );
  return { setCap, act };
}
