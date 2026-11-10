// Handlers: weapons: numbers, out/in movements from the armory and the time of an armed duty.
//
// Purpose: The handlers of `setWeapons`, `weaponOut`, `weaponIn`, `editWeaponMove`, `editWeaponMoves`,
//   `deleteWeaponMove`, `fixDutyWeapon`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: handle the armed duty posts (duties.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/weapons.test.ts, test/armed.test.ts, test/golden-outputs.test.ts, test/rules.test.ts,
//   test/duty-fuzz.test.ts.
import { dm } from '../../lib/dates';
import { shortName, type Person } from '../../model/person';
import type { AppState } from '../../model/state';
import type { DutyFix, WeaponMove } from '../../model/records';
import { personMap } from '../../duty/indexes';
import { weaponBack } from '../../people/ranks';
import { normPos, normRack, normWeapon } from '../../weapons/weaponKeys';
import { armedRows, calDay, hmOf, okStamp, stampMin } from '../../weapons/armed';
import type { CommandOf, Ctx, SeatMap, Result } from '../types';
import { wReason, wTime, editedMove } from '../weaponMoves';
import { whoNames } from '../who';

/** Handler of the command `setWeapons`. */
export function handleSetWeapons(s: AppState, c: CommandOf<'setWeapons'>, _ctx: Ctx, pm: SeatMap): Result {
  const F = {
    weapon: normWeapon,
    wtype: (v: unknown) =>
      String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase(),
    rack: normRack,
    wpos: normPos,
  } as const;
  const by = new Map<number, Person>();
  for (const ch of c.changes) {
    const p0 = pm.get(ch.pid);
    if (!p0) throw new Error('Δεν βρέθηκε το άτομο');
    const q: Person = { ...(by.get(p0.id) || p0) };
    for (const f of ['weapon', 'wtype', 'rack', 'wpos'] as const) {
      if (ch[f] === undefined) continue;
      const v = F[f](ch[f]);
      if (v) q[f] = v;
      else delete q[f];
    }
    if (q.weapon !== p0.weapon || q.wtype !== p0.wtype || q.rack !== p0.rack || q.wpos !== p0.wpos) by.set(p0.id, q);
    else by.delete(p0.id);
  }
  if (!by.size) return { state: s, text: '', files: [] };
  const people = s.people.map((p) => by.get(p.id) || p);
  const [pid, q] = [...by][0];
  const p = pm.get(pid)!;
  const one = [
    q.weapon !== p.weapon &&
      (q.weapon ? 'όπλο ' + q.weapon : 'χωρίς όπλο' + (p.weapon ? ' (ήταν ' + p.weapon + ')' : '')),
    q.wtype !== p.wtype && 'τύπος ' + (q.wtype || '—'),
    q.rack !== p.rack && 'οπλοβαστός ' + (q.rack || '—'),
    q.wpos !== p.wpos && 'θέση ' + (q.wpos || '—'),
  ]
    .filter(Boolean)
    .join(', ');
  const onlyNum = q.wtype === p.wtype && q.rack === p.rack && q.wpos === p.wpos;
  const text =
    by.size === 1
      ? onlyNum
        ? 'Όπλο ' + shortName(p) + ': ' + (q.weapon || 'χωρίς όπλο' + (p.weapon ? ' (ήταν ' + p.weapon + ')' : ''))
        : 'Οπλισμός ' + shortName(p) + ': ' + one
      : 'Οπλισμός' + (c.what ? ', ' + c.what : '') + ': άλλαξε σε ' + by.size + ' άτομα';
  return { state: { ...s, people }, text, files: [] };
}
/** Handler of the command `weaponOut`. */
export function handleWeaponOut(s: AppState, c: CommandOf<'weaponOut'>, ctx: Ctx, pm: SeatMap): Result {
  const reason = wReason(c.reason);
  if (!reason) throw new Error('Διάλεξε τον λόγο εξόδου');
  const time = wTime(c.time, 'εξόδου');
  const log = s.weaponLog || [];
  const open = new Set(log.filter((m) => !m.inDay).map((m) => m.pid));
  const add: WeaponMove[] = [];
  const noW: string[] = [];
  const already: string[] = [];
  for (const pid of [...new Set(c.pids)]) {
    const p = pm.get(pid);
    if (!p) throw new Error('Δεν βρέθηκε το άτομο');
    if (!p.weapon) noW.push(shortName(p));
    else if (open.has(pid)) already.push(shortName(p));
    else
      add.push({
        id: ctx.newId(),
        pid,
        weapon: p.weapon,
        reason,
        outDay: c.day,
        outTime: time,
        ...(c.note?.trim() ? { note: c.note.trim() } : {}),
      });
  }
  if (!add.length)
    throw new Error(
      noW.length && !already.length
        ? 'Δεν έχει αριθμό όπλου: ' + noW.join(', ')
        : 'Είναι ήδη εκτός: ' + already.join(', ') + (noW.length ? ' · χωρίς αριθμό όπλου: ' + noW.join(', ') : ''),
    );
  const skip = [
    noW.length && 'χωρίς αριθμό όπλου: ' + noW.join(', '),
    already.length && 'ήδη εκτός: ' + already.join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    state: { ...s, weaponLog: [...log, ...add] },
    text:
      'Έξοδος όπλων (' +
      reason +
      ') ' +
      dm(c.day) +
      ' ' +
      time +
      ': ' +
      whoNames(
        s,
        add.map((m) => m.pid),
      ) +
      (skip ? ' (δεν βγήκαν, ' + skip + ')' : ''),
    files: [],
  };
}
/** Handler of the command `weaponIn`. */
export function handleWeaponIn(s: AppState, c: CommandOf<'weaponIn'>, _ctx: Ctx, pm: SeatMap): Result {
  const time = wTime(c.time, 'εισόδου');
  const ids = new Set(c.ids);
  const lists = s.settings.lists;
  const done: WeaponMove[] = [];
  const weaponLog = (s.weaponLog || []).map((m) => {
    if (!ids.has(m.id) || m.inDay) return m;
    if (c.day + ' ' + time < m.outDay + ' ' + m.outTime)
      throw new Error(
        'Η είσοδος (' +
          dm(c.day) +
          ' ' +
          time +
          ') είναι πριν την έξοδο (' +
          dm(m.outDay) +
          ' ' +
          m.outTime +
          ') για ' +
          shortName(pm.get(m.pid) || ({ last: '?', first: '' } as Person)),
      );
    const x: WeaponMove = {
      ...m,
      inDay: c.day,
      inTime: time,
      inReason: wReason(c.reason) || weaponBack(m.reason, lists),
    };
    done.push(x);
    return x;
  });
  if (!done.length) return { state: s, text: '', files: [] };
  const rs = [...new Set(done.map((m) => m.inReason))];
  return {
    state: { ...s, weaponLog },
    text:
      'Είσοδος όπλων (' +
      rs.join(', ') +
      ') ' +
      dm(c.day) +
      ' ' +
      time +
      ': ' +
      whoNames(
        s,
        done.map((m) => m.pid),
      ),
    files: [],
  };
}
/** Handler of the command `editWeaponMove`. */
export function handleEditWeaponMove(s: AppState, c: CommandOf<'editWeaponMove'>, _ctx: Ctx, pm: SeatMap): Result {
  const log = s.weaponLog || [];
  const m = log.find((x) => x.id === c.id);
  if (!m) throw new Error('Δεν βρέθηκε η κίνηση');
  const x = editedMove(s, m, c.patch);
  if (JSON.stringify(x) === JSON.stringify(m)) return { state: s, text: '', files: [] };
  const p = pm.get(m.pid);
  return {
    state: { ...s, weaponLog: log.map((y) => (y.id === x.id ? x : y)) },
    text:
      'Διόρθωση κίνησης όπλου' +
      (p ? ' ' + shortName(p) : '') +
      ': ' +
      x.reason +
      ' ' +
      dm(x.outDay) +
      ' ' +
      x.outTime +
      (x.inDay ? ' → ' + (x.inReason || '') + ' ' + dm(x.inDay) + ' ' + x.inTime : ' (εκτός)'),
    files: [],
  };
}
/** Handler of the command `editWeaponMoves`. */
export function handleEditWeaponMoves(s: AppState, c: CommandOf<'editWeaponMoves'>, _ctx: Ctx, pm: SeatMap): Result {
  // All together or none: if one does not work (e.g. the new time is after its entry), the message says which
  const log = s.weaponLog || [];
  const pt = c.patch;
  const ids = [...new Set(c.ids)];
  if (!ids.length) throw new Error('Διάλεξε κινήσεις');
  if (pt.reason === undefined && pt.outDay === undefined && pt.outTime === undefined)
    throw new Error('Άλλαξε τον λόγο ή την ώρα εξόδου');
  const by = new Map<string, WeaponMove>();
  for (const id of ids) {
    const m = log.find((y) => y.id === id);
    if (!m) throw new Error('Δεν βρέθηκε η κίνηση');
    try {
      const x = editedMove(s, m, pt);
      if (JSON.stringify(x) !== JSON.stringify(m)) by.set(id, x);
    } catch (e: any) {
      throw new Error((pm.get(m.pid) ? shortName(pm.get(m.pid)!) + ': ' : '') + e.message);
    }
  }
  if (!by.size) return { state: s, text: '', files: [] };
  const part = [
    pt.reason !== undefined && 'λόγος ' + wReason(pt.reason),
    (pt.outDay || pt.outTime !== undefined) &&
      'έξοδος ' +
        [pt.outDay && dm(pt.outDay), pt.outTime !== undefined && wTime(pt.outTime, 'εξόδου')].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    state: { ...s, weaponLog: log.map((y) => by.get(y.id) || y) },
    text:
      'Διόρθωση κινήσεων όπλων (' +
      part +
      '): ' +
      whoNames(
        s,
        [...by.values()].map((m) => m.pid),
      ),
    files: [],
  };
}
/** Handler of the command `deleteWeaponMove`. */
export function handleDeleteWeaponMove(s: AppState, c: CommandOf<'deleteWeaponMove'>, _ctx: Ctx, pm: SeatMap): Result {
  const log = s.weaponLog || [];
  const m = log.find((x) => x.id === c.id);
  if (!m) throw new Error('Δεν βρέθηκε η κίνηση');
  const p = pm.get(m.pid);
  return {
    state: { ...s, weaponLog: log.filter((x) => x.id !== c.id) },
    text:
      'Σβήστηκε κίνηση όπλου' + (p ? ' ' + shortName(p) : '') + ': ' + m.reason + ' ' + dm(m.outDay) + ' ' + m.outTime,
    files: [],
  };
}
/** Handler of the command `fixDutyWeapon`. */
export function handleFixDutyWeapon(s: AppState, c: CommandOf<'fixDutyWeapon'>): Result {
  const row = armedRows(s, c.day).find((r) => r.post === c.post && r.n === c.n);
  if (!row) throw new Error('Δεν υπάρχει αυτό το νούμερο ένοπλης υπηρεσίας (άλλαξαν οι υπηρεσίες;)');
  const fixes = s.dutyFix || [];
  const old = fixes.find((x) => x.id === row.id);
  const pm = personMap(s.people);
  const who = pm.get(row.who);
  const lbl = row.reason + ' ' + dm(c.day) + (who ? ' (' + shortName(who) + ')' : '');
  if (c.reset) {
    if (!old) return { state: s, text: '', files: [] };
    return {
      state: { ...s, dutyFix: fixes.filter((x) => x.id !== row.id) },
      text: 'Ώρες ένοπλης υπηρεσίας ' + lbl + ': πίσω στο αυτόματο',
      files: [],
    };
  }
  const why = String(c.why ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!why) throw new Error('Γράψε τον λόγο της διόρθωσης');
  for (const v of [c.out, c.in]) if (v != null && !okStamp(v)) throw new Error('Η ώρα δεν είναι σωστή');
  // whatever is the same as the automatic is not written
  const out = c.out != null && stampMin(c.day, c.out) !== row.autoOut ? c.out : undefined,
    inn = c.in != null && stampMin(c.day, c.in) !== row.autoIn ? c.in : undefined;
  if (!out && !inn) throw new Error('Άλλαξε την ώρα εξόδου ή εισόδου (ή πάτα «Πίσω στο αυτόματο»)');
  if ((inn ? stampMin(c.day, inn) : row.autoIn) < (out ? stampMin(c.day, out) : row.autoOut))
    throw new Error('Η είσοδος είναι πριν την έξοδο');
  const fix: DutyFix = {
    id: row.id,
    day: c.day,
    post: row.post,
    n: row.n,
    ...(out ? { out } : {}),
    ...(inn ? { in: inn } : {}),
    why,
  };
  if (old && JSON.stringify(old) === JSON.stringify(fix)) return { state: s, text: '', files: [] };
  const t = (st: string | undefined, m: number) =>
    dm(calDay(c.day, st ? stampMin(c.day, st) : m)) + ' ' + (st ? st.slice(11) : hmOf(m));
  return {
    state: { ...s, dutyFix: [...fixes.filter((x) => x.id !== row.id), fix] },
    text:
      'Διόρθωση ωρών ένοπλης υπηρεσίας ' +
      lbl +
      ': έξοδος ' +
      t(out, row.autoOut) +
      ', είσοδος ' +
      t(inn, row.autoIn) +
      ' · λόγος: ' +
      why,
    files: [],
  };
}
