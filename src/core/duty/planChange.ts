// «Τι θα αλλάξει» for a declaration (dry-run): the plan of one status change.
//
// Purpose: `StatusCmd`, `StatusPlan`, `PlanFile`, `planStatusChange` and the helpers it needs.
// Does NOT: apply the change (commands.ts) or plan several at once (planBatch.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; imports core/outs through
//   presence.ts.
// Why: The screen shows the plan before the user confirms; the same function is used by the command, so they never
//   disagree.
// Covering tests: test/declare-many.test.ts, test/declare-own-med.test.ts, test/open-declare.test.ts,
//   test/status-fix.test.ts.
import { addDays, dm, type ISODate } from '../lib/dates';
import { outBlock } from './dutyCheck';
import { personMap } from './indexes';
import { dutyBlock } from './leaveHours';
import { allPosts } from './posts';
import { outMinOn } from './presence';
import { statusesOf } from './statuses';
import { postTxt } from '../model/blocks';
import { kolColName, kolColOf, kolHk } from '../model/kol';
import type { UserLists } from '../model/lists';
import { shortName } from '../model/person';
import type { AppState } from '../model/state';
import { type Status, type TypeKey, TYPES } from '../model/status';
import { HK } from '../model/unit';
import {
  isAway,
  LEAVE_AWAY_NO_COL,
  leaveCol,
  leaveMode,
  live,
  medNote,
  medNoteXl,
  medWarns,
  statusLbl,
} from '../people/kinds';
import { backBy, hasTimes } from '../statuses/hours';
import { statNoOut } from '../statuses/stat';

/**
 * A declaration of a status (what the user asks for), as the dry-run reads it. `unlockPast`: the user unlocked the past
 * days; duties that were done and are not allowed any more leave too. `force`: the user saw that someone does not go
 * out (penalty, duty…) and declared it anyway (Michael, 17/10).
 * @decision Michael 17/10: `force`.
 */
export interface StatusCmd {
  type: TypeKey;
  pids: number[];
  from: ISODate;
  to: ISODate;
  kind?: string;
  note?: string;
  by?: string;
  reason?: string;
  on?: ISODate;
  fromTime?: string;
  toTime?: string;
  unlockPast?: boolean;
  force?: boolean;
  open?: boolean;
  minus?: boolean;
  hkCol?: string;
  noOut?: boolean;
  dest?: string;
}

/**
 * «Χωρίς λήξη» in a declaration: medical, ΣΤΕΠ and hospital, not leaves, penalties, outs. It holds until «Σταμάτησε»
 * (endStatus); in the Excel the «έως» stays empty, like the X4 entries from Excel.
 * @decision Michael 19/10: «στα ΣΤΕΠ και καταστάσεις».
 */
export const canOpen = (type: TypeKey) => TYPES[type].cat === 'med' || TYPES[type].cat === 'other';

const OPEN_END: ISODate = '9999-12-31'; // for the plan: all the days from the «from» on

/** The command with an open end turned into one that ends on `OPEN_END`, for the plan; other commands unchanged. */
export const planTo = <T extends Pick<StatusCmd, 'type' | 'to' | 'toTime' | 'open'>>(cmd: T): T =>
  cmd.open && canOpen(cmd.type) ? { ...cmd, to: OPEN_END, toTime: undefined } : cmd;

/** One line of the plan: the file that changes and what changes in it; `warn` marks a warning. */
export interface PlanFile {
  fn: string;
  desc: string;
  warn?: boolean;
}

/**
 * What a declaration will change (dry-run): the files, the overlaps, the duties that empty, the past ones and the
 * warnings.
 */
export interface StatusPlan {
  files: PlanFile[];
  overlaps: { pid: number; status: Status }[];
  conflicts: { pid: number; date: ISODate; k: string }[];
  past: { pid: number; date: ISODate; k: string }[]; // duties before today: done, they stay
  blocked: { pid: number; date: ISODate; reason: string }[];
  cancels: Status[];
  alongside: { pid: number; status: Status }[]; // another medical status on the same days: both hold
}

const overlapsRange = (s: Status, from: ISODate, to: ISODate) => !(to < s.from || (!s.open && from > s.to));

/**
 * Medical statuses: one soldier can have e.g. ΕΑ and ΕΥ together. The same medical status = the same name (ΕΑ with ΕΑ,
 * «ΕΛ ΠΟΔ» with «ΕΛ ΠΟΔ»); different ones hold together and the stricter restriction counts.
 * @decision Michael 13/10: more medical statuses together.
 */
export const sameMed = (a: Pick<Status, 'type' | 'kind'>, b: Pick<Status, 'type' | 'kind'>, lists?: UserLists) =>
  TYPES[a.type].cat === 'med' &&
  TYPES[b.type].cat === 'med' &&
  a.type === b.type &&
  statusLbl(a, lists) === statusLbl(b, lists);

/**
 * A multi-day out/ΔΝ that is cancelled only for from-to: the days before and after stay. The first piece keeps the id
 * (same row in the Excel), the second gets a new one.
 */
export function splitOut(st: Status, from: ISODate, to: ISODate, newId: () => string): Status[] {
  const out: Status[] = [];
  if (st.from < from) out.push({ ...st, to: addDays(from, -1) });
  if (st.to > to) out.push({ ...st, id: out.length ? newId() : st.id, from: addDays(to, 1) });
  return out;
}

/** Until when a declaration cancels the outs: without the last day, if it ends with a time before the out time. */
export const outCutTo = (s: AppState, cmd: Pick<StatusCmd, 'type' | 'to' | 'toTime'>) =>
  backBy(cmd, cmd.to, outMinOn(s, cmd.to)) ? addDays(cmd.to, -1) : cmd.to;

/** One line per day: who goes out from which posts. */
export function conflictFiles(s: AppState, conflicts: StatusPlan['conflicts']): PlanFile[] {
  const pm = personMap(s.people),
    posts = allPosts(s.settings);
  return [...new Set(conflicts.map((x) => x.date))].sort().map((date) => {
    const cs = conflicts.filter((x) => x.date === date);
    return {
      fn: 'Υπηρεσίες ' + dm(date),
      warn: true,
      desc:
        cs
          .map((x) => shortName(pm.get(x.pid)!) + ' βγαίνει από ' + postTxt(posts.find((p) => p.k === x.k)!))
          .join(' · ') +
        '. ' +
        (cs.length > 1 ? 'Οι θέσεις μένουν' : 'Η θέση μένει') +
        ' ΚΕΝΗ.',
    };
  });
}

const rangeTxt = (from: ISODate, to: ISODate) => (from === to ? dm(from) : dm(from) + '–' + dm(to));

/**
 * The plan of one declaration (dry-run). `today`: the duties before today are not deleted (they were done), they are
 * only reported. A leave of the «absent in the app, in no column» kind says so in the ΗΚΑΙ line.
 * @decision Michael 3/11: absent in the app, in no ΗΚΑΙ column.
 */
export function planStatusChange(s: AppState, cmd0: StatusCmd, today?: ISODate): StatusPlan {
  const cmd = planTo(cmd0);
  const t = TYPES[cmd.type];
  const n = cmd.pids.length;
  const pm = personMap(s.people);
  const files: PlanFile[] = [];
  const overlaps: StatusPlan['overlaps'] = [],
    conflicts: StatusPlan['conflicts'] = [],
    past: StatusPlan['past'] = [],
    blocked: StatusPlan['blocked'] = [],
    cancels: Status[] = [],
    alongside: StatusPlan['alongside'] = [],
    warned: StatusPlan['conflicts'] = [];
  const lists = s.settings.lists;
  const isNote = medNote(cmd, lists); // «only a note» (Michael, 4/11): blocks nobody, only the same kind twice
  const clash = (x: Status) =>
    t.cat !== 'kol' &&
    ((t.cat === 'med' && TYPES[x.type].cat === 'med' ? sameMed(x, cmd, lists) : TYPES[x.type].cat === t.cat) ||
      (isAway(x, lists) && isAway(cmd, lists))); // κωλυόμενοι: several together are possible (other duty, other hours)
  // with a departure time the duty of the previous day counts too (it ends at noon of the first day of the leave)
  const first = cmd.fromTime && hasTimes(cmd.type) ? addDays(cmd.from, -1) : cmd.from;
  const dates = Object.keys(s.guards)
    .filter((d) => d >= first && d <= cmd.to)
    .sort();
  const posts = allPosts(s.settings);
  // an out/ΔΝ and a leave that ends with a return time before the out: they do not clash (Michael, 18/10)
  const meets = (x: Status) => {
    if (!overlapsRange(x, cmd.from, cmd.to)) return false;
    const xo = TYPES[x.type].cat === 'out';
    if (t.cat === 'out' && !xo && backBy(x, x.to, outMinOn(s, x.to)))
      return overlapsRange({ ...x, to: addDays(x.to, -1) }, cmd.from, cmd.to) && x.from < x.to;
    if (xo && t.cat !== 'out' && backBy({ ...cmd, open: false }, cmd.to, outMinOn(s, cmd.to)))
      return overlapsRange(x, cmd.from, addDays(cmd.to, -1)) && cmd.from < cmd.to;
    return true;
  };
  for (const pid of cmd.pids) {
    const mine = (
      isNote ? statusesOf(s.statuses, pid).filter((x) => medNote(x, lists)) : statusesOf(live(s), pid)
    ).filter(meets);
    const ov = mine.find(clash);
    if (ov) overlaps.push({ pid, status: ov });
    else if (t.cat === 'med' && !isNote)
      mine.filter((x) => TYPES[x.type].cat === 'med').forEach((x) => alongside.push({ pid, status: x }));
    if (isNote) continue;
    if (t.cat === 'out') {
      for (let d = cmd.from; d <= cmd.to; d = addDays(d, 1)) {
        const r = outBlock(s, d, pid);
        if (r) {
          blocked.push({ pid, date: d, reason: r });
          break;
        }
      }
    } else if (cmd.type !== 'PUN') {
      // the same rules as the duties (dutyBlock): no duty, not armed, ΕΟ/ΕΑ not in μαγειρεία; with the kind, so that
      // the user's own medical status has its own rules per duty
      const hyp: Status = {
        id: '',
        pid,
        type: cmd.type,
        from: cmd.from,
        to: cmd.to,
        ...(cmd.kind ? { kind: cmd.kind } : {}),
        ...(cmd.fromTime ? { fromTime: cmd.fromTime } : {}),
        ...(cmd.toTime ? { toTime: cmd.toTime } : {}),
      };
      dates.forEach((date) =>
        posts.forEach((x) => {
          if (s.guards[date][x.k] === pid && dutyBlock([hyp], date, pid, x, lists))
            (today && date < today && !cmd.unlockPast ? past : conflicts).push({ pid, date, k: x.k });
        }),
      );
    }
    // medical «warning only»: the duties stay, with a warning
    if (medWarns(cmd, lists) && !(today && cmd.to < today))
      dates.forEach((date) =>
        posts.forEach((x) => {
          if ((!today || date >= today) && s.guards[date][x.k] === pid) warned.push({ pid, date, k: x.k });
        }),
      );
    // and a penalty that is still pending keeps the soldier inside (outBlock)
    if (statNoOut(cmd, lists) && !isAway(cmd, lists))
      live(s).forEach((x) => {
        if (x.pid === pid && TYPES[x.type].cat === 'out' && meets(x)) cancels.push(x);
      });
  }
  const rows = (k: number) => '+' + k + (k > 1 ? ' γραμμές' : ' γραμμή');
  if (cmd.type === 'PUN')
    files.push({ fn: HK(), desc: 'Αιτείται στις Αποφάσεις Διοικητή (4. Ποινές)· ισχύει όταν εγκριθεί' });
  else if (isNote && !medNoteXl(cmd, lists)) {
    // note: nothing in the files
  } else if (t.cat === 'med' || t.cat === 'other')
    files.push({ fn: 'Ιατρικά', desc: rows(n) + ' · αφαιρείται μόνο του όταν λήξει' });
  else if (cmd.type === 'LEAVE' && leaveMode(cmd, lists) !== 'away') {
    if (leaveMode(cmd, lists) === 'kol')
      files.push({ fn: HK(), desc: 'Κωλυόμενοι: ' + kolColName(leaveCol(cmd.kind, lists)) + ' +' + n });
  } // «Πουθενά»: he does not enter the ΗΚΑΙ
  else if (cmd.type === 'LEAVE' && leaveCol(cmd.kind, lists) === LEAVE_AWAY_NO_COL)
    files.push({ fn: HK(), desc: 'Απών στην εφαρμογή, σε καμία στήλη της ' + HK() + ' (εκεί μετρά στους παρόντες)' }); // (Michael, 3/11)
  else if (t.cat === 'abs') files.push({ fn: HK(), desc: 'Απόντες: ' + t.long + ' ' + rows(n) });
  else if (cmd.type === 'KOL')
    files.push({
      fn: HK(),
      desc: cmd.minus
        ? kolHk(cmd)
          ? 'Κωλυόμενοι: ' + kolColName(kolColOf(cmd)) + ' +' + n
          : 'Κωλυόμενος στη Δύναμη, όχι στην ΗΚΑΙ'
        : 'Μένει στους παρόντες: δεν μπαίνει στους κωλυόμενους',
    });
  if (t.hkai && cmd.type !== 'PUN' && t.cat !== 'abs' && !isNote)
    files.push({ fn: HK(), desc: 'Κωλυόμενοι: ' + t.long + ' ' + rows(n) });
  const keep = (x: Status) =>
    splitOut(x, cmd.from, outCutTo(s, cmd), () => '')
      .map((y) => rangeTxt(y.from, y.to))
      .join(', ');
  if (cancels.length)
    files.push({
      fn: 'Εξοδούχοι',
      warn: true,
      desc:
        'Ακυρώνεται η έξοδος: ' +
        cancels
          .map(
            (x) =>
              shortName(pm.get(x.pid)!) + ' (' + rangeTxt(x.from, x.to) + (keep(x) ? ', μένει ' + keep(x) : '') + ')',
          )
          .join(', ') +
        '. ' +
        (cmd.type === 'PUN' ? 'Ο τιμωρημένος' : t.label) +
        ' δεν βγαίνει έξοδο.',
    });
  files.push(...conflictFiles(s, conflicts));
  [...new Set(warned.map((x) => x.date))].forEach((date) => {
    files.push({
      fn: 'Υπηρεσίες ' + dm(date),
      warn: true,
      desc:
        warned
          .filter((x) => x.date === date)
          .map((x) => shortName(pm.get(x.pid)!) + ' (' + postTxt(posts.find((p) => p.k === x.k)!) + ')')
          .join(' · ') + ': έχει υπηρεσία. Μένει· έλεγξε αν μπορεί να την κάνει.',
    });
  });
  [...new Set(past.map((x) => x.date))].forEach((date) => {
    files.push({
      fn: 'Υπηρεσίες ' + dm(date),
      desc:
        past
          .filter((x) => x.date === date)
          .map((x) => shortName(pm.get(x.pid)!) + ' (' + postTxt(posts.find((p) => p.k === x.k)!) + ')')
          .join(' · ') + ': υπηρεσία που έγινε, μένει.',
    });
  });
  return { files, overlaps, conflicts, past, blocked, cancels, alongside };
}
