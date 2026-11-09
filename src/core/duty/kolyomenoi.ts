// Κωλυόμενοι (Michael, 24/10): soldiers with a duty that is not ours, and the ΣΤΕΠ admission.
//
// Purpose: `kolView`, `soldierCol` (the ΗΚΑΙ column of a soldier), `kolMinus`, `stepOn`, `kolStarted`.
// Does NOT: count the form (hkaiCount.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; imports core/outs through
//   presence.ts.
// Why: The same column rule feeds the ΗΚΑΙ count and the Κωλυόμενοι view, so they add up to the same numbers.
// Covering tests: test/kolyomenoi.test.ts, test/hkai.test.ts.
import type { ISODate } from '../lib/dates';
import { activePeople } from './indexes';
import { postBy } from './posts';
import { statusesAt } from './presence';
import { hkMin } from './statuses';
import type { DutyKind } from '../model/duty';
import { KOL_COLS, kolColOf, kolHk, STEP_COL } from '../model/kol';
import type { UserLists } from '../model/lists';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { type Status, TYPES } from '../model/status';
import { isAway, LEAVE_AWAY_NO_COL, LEAVE_NO_COL, leaveCol, leaveMode } from '../people/kinds';
import { mins } from '../statuses/hours';

// True when a status has started at moment `at` of `date` (a departure time after `at` has not).
const kolStarted = (x: Status, date: ISODate, at: number) => !(x.from === date && x.fromTime && mins(x.fromTime) > at);

// The declared κωλυόμενος (or a leave of the user's own kind with a κωλυόμενοι column) who is subtracted from the
// present at that moment.
const kolMinus = (ss: Status[], date: ISODate, at: number, lists?: UserLists) =>
  ss.find(
    (x) =>
      ((x.type === 'KOL' && x.minus) || (x.type === 'LEAVE' && leaveMode(x, lists) === 'kol')) &&
      kolStarted(x, date, at),
  );

// ΣΤΕΠ admission: an automatic κωλυόμενος who is subtracted from the present (col: STEP_COL, empty if it does not count
// in a column of the ΗΚΑΙ); with an admission time he counts from that time (like the κωλυόμενος). A declared
// κωλυόμενος with subtraction at the same moment wins: one person, once.
// @decision Michael 29/10: ΣΤΕΠ admission.
const stepOn = (ss: Status[], date: ISODate, at: number) =>
  ss.find((x) => TYPES[x.type].kolAuto && kolStarted(x, date, at));

/**
 * The ΗΚΑΙ column of a soldier (`ss`: his statuses at that moment): first absence, then the κωλυόμενος who is
 * subtracted from the present (in the column the user chose, if he chose one; Michael 29/10: optional), then ΣΤΕΠ
 * (STEP_COL, if it has a column; Michael 29/10), duty, ΕΥ, penalty; null = none. One column per person.
 * @decision Michael 29/10: the column of the κωλυόμενος is optional; ΣΤΕΠ has its own column.
 */
export function soldierCol(
  s: AppState,
  ss: Status[],
  duty: DutyKind | undefined,
  date: ISODate,
  at: number,
  noCol?: Status[],
): string | null {
  const lists = s.settings.lists;
  const abs = ss.find((x) => isAway(x, lists) && TYPES[x.type].hkai);
  if (abs) {
    const lc = abs.type === 'LEAVE' ? leaveCol(abs.kind, lists) : TYPES[abs.type].hkai!;
    if (lc === LEAVE_AWAY_NO_COL) noCol?.push(abs); // absent in the app, in no column (Michael, 3/11)
    return lc === LEAVE_NO_COL || lc === LEAVE_AWAY_NO_COL ? null : lc;
  }
  const kol = kolMinus(ss, date, at, lists),
    // a leave of the user's own kind with a column of the κωλυόμενοι: like a declared κωλυόμενος with subtraction
    // (Michael, 3/11); hkCol '-' (Michael, 29/10): as if the declaration did not exist as far as the column goes
    kc = kol && (kol.type === 'LEAVE' ? leaveCol(kol.kind, lists) : kolHk(kol));
  return kc
    ? kc
    : STEP_COL && stepOn(ss, date, at)
      ? STEP_COL
      : duty
        ? duty === 'mg'
          ? 'mag'
          : 'yp'
        : ss.find((x) => x.type === 'EY')
          ? 'ey'
          : ss.find((x) => x.type === 'PUN')
            ? 'tim'
            : null;
}

/**
 * A row of the κωλυόμενοι view: the person, his status, the ΗΚΑΙ column and whether he is subtracted from the present.
 */
export interface KolRow {
  p: Person;
  st: Status;
  col: string;
  minus: boolean;
}

/**
 * `cols`: all the κωλυόμενοι present soldiers per ΗΚΑΙ column (duty, ΕΥ, penalty, declared κωλυόμενος, ΣΤΕΠ…), the same
 * sum as the ΗΚΑΙ at the same moment; `n` = how many (whoever has hkCol '-' is in no column here nor in the ΗΚΑΙ, but
 * stays in `man` / `minus`). `man`: the declared κωλυόμενοι and the ΣΤΕΠ at that moment (`minus`: they enter their
 * column, `keep`: they just stay present).
 */
export interface KolView {
  cols: Record<string, Person[]>;
  n: number;
  man: KolRow[];
  minus: KolRow[];
  keep: KolRow[];
}

/**
 * Κωλυόμενοι (Michael, 24/10): a declaration of a soldier with a duty that is not ours (e.g. «Υπηρεσία ΣΤΕΠ»): from-to
 * days, optionally with hours (hours.ts: the end is cut by `statusesFrom`, the start time on the first day here). It
 * does not enter our duties (dutyBlock: the auto-fill, «Επόμενος» and the rotation skip him; by hand he enters with a
 * reason); the fairness order does not change. `minus`: subtracted from the present and put in the ΗΚΑΙ in column
 * `hkCol` (or in none, '-'); without `minus` he stays present and outside the ΗΚΑΙ. `noOut`: cuts the out (outBlock).
 * @decision Michael 24/10: κωλυόμενοι.
 */
export function kolView(s: AppState, date: ISODate, at = hkMin(s.rules)): KolView {
  const g = s.guards[date] || {};
  const onDuty = new Map<number, DutyKind>();
  for (const k in g) {
    const p = postBy(s, k);
    if (p) onDuty.set(g[k], p.kind);
  }
  const cols: Record<string, Person[]> = {};
  KOL_COLS.forEach(([k]) => (cols[k] = []));
  const man: KolRow[] = [];
  let n = 0;
  for (const p of activePeople(s)) {
    const ss = statusesAt(s, p.id, date, at);
    if (ss.some((x) => isAway(x, s.settings.lists))) continue; // absent: counts in the absent
    const col = soldierCol(s, ss, onDuty.get(p.id), date, at);
    if (col && cols[col]) {
      cols[col].push(p);
      n++;
    }
    const km = kolMinus(ss, date, at, s.settings.lists),
      sp = km ? undefined : stepOn(ss, date, at);
    const k = km || sp || ss.find((x) => x.type === 'KOL' && kolStarted(x, date, at));
    if (k)
      man.push({
        p,
        st: k,
        col: sp ? STEP_COL || '' : k.type === 'LEAVE' ? leaveCol(k.kind, s.settings.lists) : kolColOf(k),
        minus: !!(k.minus || sp || k.type === 'LEAVE'),
      });
  }
  return { cols, n, man, minus: man.filter((x) => x.minus), keep: man.filter((x) => !x.minus) };
}
