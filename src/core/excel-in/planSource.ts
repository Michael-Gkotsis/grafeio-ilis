// The writing plan of any kind: one entry for the preview, the write and the browser test.
//
// Purpose: `planSource` (picks the writer for the kind and adds the header and the changes to the people),
//   `personSets` (a change to a person reaches every sheet that lists him), `kindsForPeople` and `SyncMeta`.
// Does NOT: contain the writers themselves (writePlan.ts, personnelBack.ts, postsBack.ts, dutyCheckBack.ts,
//   cadreWrite.ts do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in (every writer,
//   including the cadre writers).
// Why: the preview, the real write and the test in the browser must plan the same way, so they all call this one
//   function; being the top of the import graph, it is the only place that knows every writer.
// Covering tests: test/sources.test.ts, test/linked.test.ts, test/new-files.test.ts, test/write-group.test.ts.
import type { ISODate } from '../lib/dates';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { RawSheet } from './roster';
import { PKEYS, XKEYS } from '../people/personal';
import type { SourceBinding, ListKind } from '../model/bindings';
import { planCadreAbsWrite } from './cadreAbsWrite';
import { planCadresWrite } from './cadreWrite';
import { capExtras } from './capsIn';
import { cellText } from './cellText';
import { planDutiesWrite } from './dutyCheckBack';
import { isCadreKind, isStatusKind, canCreate } from './fields';
import { planPeopleNew } from './newRoster';
import { makeMatcher } from './peopleMatch';
import { type PersonSnap, personVals, type FullPlan, snapPeople } from './peopleSnap';
import { planPeopleWrite } from './personnelBack';
import { planPostsWrite, planOutsideWrite, planCapsWrite } from './postsBack';
import { snapFromSheet } from './rooms';
import { tableRows } from './tableRows';
import { type WVal, rankCell, num, same, nameCell, type SourcePlan } from './writeCells';
import { newHeader, planWrite } from './writePlan';

const LINKED = ['rank', 'origin', 'spec', 'last', 'first', 'father', 'asm', 'phone', 'room'];
/**
 * Details of a person (rank, room, phone…) that changed in the app since the last read or write of this table: they
 * are written here too, on the row of the same person, so that all the sheets say the same.
 */
export function personSets(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  psnap: Record<number, PersonSnap>,
  taken: Set<string> = new Set(),
): { sets: { r: number; c: number; v: WVal }[]; changed: number } {
  const out = { sets: [] as { r: number; c: number; v: WVal }[], changed: 0 };
  const fields = LINKED.filter((k) => b.cols[k] != null);
  const name = b.cols.name != null;
  if (!fields.length && !name) return out;
  const moved = s.people.filter((p) => {
    const o = psnap[p.id];
    if (!o) return false;
    const c = personVals(p);
    return LINKED.some((k) => (c[k] || '') !== (o[k] || ''));
  });
  if (!moved.length) return out;
  // matching with the old details (if the surname changed, the sheet still has the old one)
  const old = s.people.map((p) =>
    psnap[p.id]
      ? { ...p, last: psnap[p.id].last, first: psnap[p.id].first, father: psnap[p.id].father, asm: psnap[p.id].asm }
      : p,
  );
  const matchOld = makeMatcher(old),
    matchNew = makeMatcher(s.people);
  const ids = new Set(moved.map((p) => p.id));
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    const mo = matchOld(v),
      mn = matchNew(v);
    if (mo.alts || (mo.pid == null && mn.alts)) continue; // namesakes: not on the row of the other
    const pid = mo.pid ?? mn.pid;
    if (pid == null || !ids.has(pid)) continue;
    const p = s.people.find((x) => x.id === pid)!;
    const o = psnap[pid];
    const c = personVals(p);
    let ch = false;
    for (const k of fields) {
      if ((c[k] || '') === (o[k] || '') || taken.has(r + ':' + b.cols[k])) continue;
      const val: WVal =
        k === 'rank'
          ? rankCell(p, b)
          : c[k] === ''
            ? null
            : k === 'room'
              ? Number(c.room)
              : k === 'asm' || k === 'phone'
                ? num(c[k])
                : c[k];
      if (!same(v[k], val)) {
        out.sets.push({ r, c: b.cols[k], v: val });
        ch = true;
      }
    }
    if (name && (c.last !== o.last || c.first !== o.first) && !same(v.name, nameCell(p, b))) {
      out.sets.push({ r, c: b.cols.name, v: nameCell(p, b) });
      ch = true;
    }
    if (ch) out.changed++;
  }
  return out;
}

/**
 * What the app remembers of the last read or write of a table: the identities (`keys`), the values of the people
 * (`snap` of this table, `psnap` of all) and the `base` of the records.
 */
export interface SyncMeta {
  keys?: string[];
  snap?: Record<number, PersonSnap>;
  psnap?: Record<number, PersonSnap>;
  base?: Record<string, string>;
}
/**
 * One writing plan for any kind (used by the preview, the write and the browser test): picks the writer of the kind,
 * adds the header of a new table and the changes to the details of the people. `meta`: what the app saw at the last
 * read or write.
 */
export function planSource(
  kind: ListKind,
  sheet: RawSheet | null,
  b: SourceBinding,
  s: AppState,
  meta: SyncMeta | undefined,
  today: ISODate,
): FullPlan {
  const psnap = snapPeople(s.people);
  const sh = sheet || { name: b.sheet, rows: [] };
  if (kind === 'people' && !(sh.rows[b.header] || []).some((v) => cellText(v)))
    return { ...planPeopleNew(b, s), psnap };
  if (isCadreKind(kind)) {
    const plan = kind === 'cadres' ? planCadresWrite(sh, b, s, meta) : planCadreAbsWrite(sh, b, s, meta, today);
    plan.header = newHeader(kind, sh.rows, b);
    return { ...plan, psnap: {} };
  }
  if (kind === 'people') {
    const p = planPeopleWrite(sh, b, s, meta?.snap || snapFromSheet(sh, b, s.people), meta?.keys);
    return {
      sets: p.sets,
      insert: null,
      inserts: p.inserts,
      deletes: p.deletes,
      fresh: p.fresh,
      gone: p.gone,
      header: [],
      keys: p.keys,
      added: p.added,
      changed: p.changed,
      cleared: p.cleared,
      foreign: 0,
      notFound: p.notFound,
      snap: p.snap,
      psnap,
      grow: p.grow,
      ...(p.warn ? { warn: p.warn } : {}),
    };
  }
  const plan: SourcePlan = isStatusKind(kind)
    ? { ...planWrite(kind, sheet, b, s, meta?.keys || [], today), notFound: [] }
    : kind === 'posts'
      ? planPostsWrite(sh, b, s)
      : kind === 'outside'
        ? planOutsideWrite(sh, b, s)
        : kind === 'caps'
          ? planCapsWrite(sh, b, s)
          : planDutiesWrite(sh, b, s, today, meta?.keys);
  if (!isStatusKind(kind) && canCreate(kind)) {
    // the columns of the user's own duties (`capExtraCols`) by their name
    const own = new Map<string, string>(kind === 'caps' ? capExtras(s.settings).map((x) => [x.key, x.head]) : []);
    plan.header = newHeader(kind, sh.rows, b).map((h) => (own.has(h.v) ? { ...h, v: own.get(h.v)! } : h));
  }
  if (meta?.psnap && sheet) {
    const ps = personSets(sheet, b, s, meta.psnap, new Set(plan.sets.map((x) => x.r + ':' + x.c)));
    plan.sets.push(...ps.sets);
    plan.changed += ps.changed;
  }
  return { ...plan, psnap };
}

const KIND_PERSON: Partial<Record<ListKind, string[]>> = {
  // e-mail, relative's e-mail, blood group: written in the ΘΑΛΑΜΟΙ sheet together with the roster (roomExtra.ts)
  people: [
    'rank',
    'origin',
    'spec',
    'last',
    'first',
    'father',
    'asm',
    'phone',
    'room',
    'si',
    'role',
    'dn',
    'added',
    'active',
    ...PKEYS,
    ...XKEYS,
  ],
  posts: ['post', 'active'],
  outside: ['active', 'notes'],
  caps: ['active'],
};
/**
 * Which kinds a change to the people concerns (P2): only those with a column for some field that changed (and the
 * fields the kind itself reads: post, out of strength, Σ.Ι., role…). A new or a deleted person concerns all.
 */
export function kindsForPeople(
  prev: Person[],
  next: Person[],
  sources: Partial<Record<ListKind, SourceBinding>>,
): Set<ListKind> {
  const all = new Set((Object.keys(sources) as ListKind[]).filter((k) => sources[k] && !isCadreKind(k)));
  const was = new Map(prev.map((p) => [p.id, p]));
  if (prev.length !== next.length || next.some((p) => !was.has(p.id))) return all;
  const changed = new Set<string>();
  for (const p of next) {
    const o = was.get(p.id)!;
    if (o === p) continue;
    for (const k of new Set([...Object.keys(o), ...Object.keys(p)]))
      if (
        JSON.stringify((o as unknown as Record<string, unknown>)[k]) !==
        JSON.stringify((p as unknown as Record<string, unknown>)[k])
      )
        changed.add(k);
  }
  const out = new Set<ListKind>();
  for (const k of all) {
    const cols = new Set(Object.keys(sources[k]!.cols).filter((c) => LINKED.includes(c)));
    // full name in one cell, or name without father's name: «του <father's name>» for namesakes
    if (sources[k]!.cols.name != null) ['last', 'first', 'father'].forEach((c) => cols.add(c));
    if (sources[k]!.cols.first != null) cols.add('father');
    if (sources[k]!.cols.rank != null) cols.add('origin'); // the origin is written in front of the rank
    if ([...cols, ...(KIND_PERSON[k] || [])].some((c) => changed.has(c))) out.add(k);
  }
  return out;
}
