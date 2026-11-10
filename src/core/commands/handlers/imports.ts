// Handlers: the imports from Excel files (people, records, caps, duties) and the people fields.
//
// Purpose: The handlers of `importPeople`, `importRecords`, `setPeopleFields`, `importCaps`, `importDuties`. Each one
//   is the old `case` body of `run`, unchanged.
// Does NOT: import the cadre (cadre.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/roster-sync.test.ts, test/duties-import.test.ts, test/sources.test.ts,
//   test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { TYPES, type Status } from '../../model/status';
import type { Person } from '../../model/person';
import { CAP_ACC, KIND_NAME, type DutyKind } from '../../model/duty';
import type { AppState } from '../../model/state';
import { mergeDuties } from '../../excel-in/dutyCheckIn';
import { capCols } from '../../duty/whoDoes';
import { postBy } from '../../duty/posts';
import { isDeprivation, servedDays } from '../../statuses/punish';
import type { CommandOf, Result, Ctx, SeatMap } from '../types';
import { importPeople } from '../importPeople';

/** Handler of the command `importPeople`. */
export function handleImportPeople(s: AppState, c: CommandOf<'importPeople'>): Result {
  return importPeople(s, c.rows, c.source, c.deactivateMissing);
}
/** Handler of the command `importRecords`. */
export function handleImportRecords(s: AppState, c: CommandOf<'importRecords'>, ctx: Ctx, pm: SeatMap): Result {
  // From the Excel Files: new records and changes to existing ones (same person, same kind, same start)
  const byId = new Map(c.updates.map((u) => [u.id, u.patch]));
  const adds = c.adds.filter((a) => pm.has(a.pid) && TYPES[a.type] && a.from && a.to && a.to >= a.from);
  const del = new Set((c.deletes || []).filter((id) => s.statuses.some((x) => x.id === id)));
  if (!adds.length && !byId.size && !del.size) return { state: s, text: '', files: [] };
  // leave time deleted in the Excel: it comes empty and leaves the record
  const tidy = (x: Status) => {
    if (x.fromTime === '') delete x.fromTime;
    if (x.toTime === '') delete x.toTime;
    if (x.dest === '') delete x.dest;
    return x;
  };
  // penalty from Excel: the Excel end stays as it is, and moves only for the duties or night trainings added later
  // inside the period (the days = those that count now from «από» to «έως»)
  const days = (x: Status) => {
    if (!isDeprivation(x) || x.open) {
      delete x.days;
      return x;
    }
    const n = servedDays(s, x.pid, x.from, x.to);
    if (n > 0) x.days = n;
    else delete x.days;
    return x;
  };
  const moved = (x: Status, p: Partial<Status>) =>
    p.to !== undefined || p.from !== undefined || p.open !== undefined || p.kind !== undefined;
  const statuses = [
    ...s.statuses
      .filter((x) => !del.has(x.id))
      .map((x) =>
        byId.has(x.id)
          ? moved(x, byId.get(x.id)!)
            ? days(tidy({ ...x, ...byId.get(x.id) }))
            : tidy({ ...x, ...byId.get(x.id) })
          : x,
      ),
    ...adds.map((a) => days({ ...a, id: ctx.newId() })),
  ];
  const parts = [
    adds.length && adds.length + (adds.length === 1 ? ' νέα' : ' νέες'),
    byId.size && byId.size + (byId.size === 1 ? ' αλλαγή' : ' αλλαγές'),
    del.size && del.size + (del.size === 1 ? ' σβήστηκε' : ' σβήστηκαν'),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    state: { ...s, statuses },
    text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + parts,
    files: [],
    source: 'excel',
  };
}
/** Handler of the command `setPeopleFields`. */
export function handleSetPeopleFields(s: AppState, c: CommandOf<'setPeopleFields'>, _ctx: Ctx, pm: SeatMap): Result {
  // From the Excel Files (posts, out of strength): only these fields, only for people that exist
  const by = new Map<number, Partial<Person>>();
  for (const ch of c.changes) {
    if (!pm.has(ch.pid)) continue;
    const pt: Partial<Person> = {};
    if ('post' in ch.patch) pt.post = ch.patch.post ? String(ch.patch.post) : null;
    if ('active' in ch.patch) pt.active = !!ch.patch.active;
    if ('notes' in ch.patch) pt.notes = String(ch.patch.notes ?? '');
    by.set(ch.pid, { ...(by.get(ch.pid) || {}), ...pt });
  }
  if (!by.size) return { state: s, text: '', files: [] };
  const people = s.people.map((p) => (by.has(p.id) ? { ...p, ...by.get(p.id) } : p));
  return {
    state: { ...s, people },
    text: 'Από Excel (' + c.source + '), ' + c.what + ': ' + by.size + (by.size === 1 ? ' αλλαγή' : ' αλλαγές'),
    files: [],
    source: 'excel',
  };
}
/** Handler of the command `importCaps`. */
export function handleImportCaps(s: AppState, c: CommandOf<'importCaps'>, _ctx: Ctx, pm: SeatMap): Result {
  const caps = { ...s.caps };
  let n = 0;
  for (const ch of c.changes) {
    // basic kind, or your own service («b:» + id) that still exists in the Settings
    if (!pm.has(ch.pid) || !(CAP_ACC[ch.kind as DutyKind] || capCols(s.settings).some((x) => x.key === ch.kind)))
      continue;
    const cur = { ...(caps[ch.pid] || {}) };
    if (ch.reason) cur[ch.kind] = ch.reason;
    else delete cur[ch.kind];
    caps[ch.pid] = cur;
    n++;
  }
  for (const k of Object.keys(caps)) if (!Object.keys(caps[+k]).length) delete caps[+k];
  if (!n) return { state: s, text: '', files: [] };
  return {
    state: { ...s, caps },
    text: 'Από Excel (' + c.source + '), δυνατότητα υπηρεσιών: ' + n + (n === 1 ? ' αλλαγή' : ' αλλαγές'),
    files: [],
    source: 'excel',
  };
}
/** Handler of the command `importDuties`. */
export function handleImportDuties(s: AppState, c: CommandOf<'importDuties'>, ctx: Ctx, pm: SeatMap): Result {
  // From the duty check: whatever the app lacks is added (mergeDuties, as in the preview), for days up to today;
  // whatever differs stays as the app has it. A day with the same post code twice does not pass.
  const guards = { ...s.guards };
  const dutyLog = { ...s.dutyLog };
  let n = 0,
    days = 0;
  for (const [d, cells] of Object.entries(c.days || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > ctx.today || !Array.isArray(cells)) continue;
    const ok = cells
      .filter((e) => pm.has(e.pid) && KIND_NAME[e.kind])
      .map((e) => (e.k && !postBy(s, e.k) ? { ...e, k: undefined } : e));
    const r = mergeDuties(s, d, ok);
    if (r.dup || !r.adds.length) continue;
    n += r.adds.length;
    days++;
    if (Object.keys(r.day.seats).length) guards[d] = r.day.seats;
    else delete guards[d];
    if (r.day.seatless.length) dutyLog[d] = r.day.seatless;
    else delete dutyLog[d];
  }
  if (!n) return { state: s, text: '', files: [] };
  return {
    state: { ...s, guards, dutyLog },
    text:
      'Από Excel (' +
      c.source +
      '), έλεγχος υπηρεσιών: ' +
      n +
      (n === 1 ? ' υπηρεσία' : ' υπηρεσίες') +
      ' σε ' +
      days +
      (days === 1 ? ' μέρα' : ' μέρες'),
    files: ['Έλεγχος υπηρεσιών'],
    source: 'excel',
  };
}
