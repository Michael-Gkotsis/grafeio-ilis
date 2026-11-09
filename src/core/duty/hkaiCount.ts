// ΗΚΑΙ count (Κ-17): every person in exactly one column of the form.
//
// Purpose: `hkaiCounts`, `HkaiRow`, `Hkai`, `HK_MANUAL` (columns written by hand). Re-exports the ΗΚΑΙ columns and rows
//   that rules.ts used to export.
// Does NOT: read the form from Excel or write it (exports.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Absent first, then duty, ΕΥ, penalty; the posts do not count in the ΗΚΑΙ (Michael, 13/10).
// Covering tests: test/hkai.test.ts, test/hkai-auto.test.ts, test/golden-outputs.test.ts.
import type { ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import { activePeople, cadreAbsOn, hkRankOf } from './indexes';
import { soldierCol } from './kolyomenoi';
import { postBy } from './posts';
import { hkMin, notLeftYet, statusesFrom } from './statuses';
import type { Cadre } from '../model/cadreRecord';
import type { DutyKind } from '../model/duty';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Status } from '../model/status';
import { guessHk, HK_A, HK_K, hkRowList } from '../people/hkRows';
import { cadreAbsOf, live } from '../people/kinds';
export { HK_K, HK_A, HK_OFFICERS, HK_NCO } from '../people/hkRows';

/** One ΗΚΑΙ row: `n` people, `attached` of them attached, `c` the people per column. */
export interface HkaiRow {
  n: number;
  attached: number;
  c: Record<string, number>;
} // c.ab = μισθοτροφοδοτηθέντες (by hand only)

/** The ΗΚΑΙ columns that do not come from the app and are written by hand. */
export const HK_MANUAL: [string, string][] = [
  ['os', 'Ο/Σ'],
  ['sid', 'Σιδ.'],
  ['kin', 'Κίν.'],
  ['eid', 'Ειδ.άδ.'],
  ['prat', 'Πρατ.'],
  ['adik', 'Αδικ.'],
  ['fp', 'Φ.Πορ.'],
  ['fyl', 'Φυλ.'],
  ['apal', 'Απαλ.'],
  ['ekp', 'Εκπ.'],
  ['allh', 'Άλλη Μ.'],
  ['ab', 'Μισθοτρ.'],
];

/**
 * The ΗΚΑΙ count of a day. `cadre`: the cadre members per column (Στελέχη tab), so that they appear by name like the
 * soldiers.
 */
export interface Hkai {
  cols: Record<string, Person[]>;
  cadre: Record<string, Cadre[]>;
  rank: Record<string, HkaiRow>;
  noCol: { p: Person; kind: string }[];
  kol: number;
  apo: number;
  total: number;
  avail: number;
  guardsN: number;
  soldiers: number;
  cadreN: number;
}

/**
 * The ΗΚΑΙ count of a day (Κ-17): every person is counted in ONE column: first absence, then duty, ΕΥ, penalty. The
 * posts do not count in the ΗΚΑΙ; the Ο/Σ column is written by hand.
 * @decision Michael 13/10: the posts do not count in the ΗΚΑΙ.
 */
export function hkaiCounts(s: AppState, date: ISODate): Hkai {
  const g = s.guards[date] || {};
  const onDuty = new Map<number, DutyKind>();
  for (const k in g) {
    const p = postBy(s, k);
    if (p) onDuty.set(g[k], p.kind);
  }
  const cols: Record<string, Person[]> = {};
  [...HK_K, ...HK_A].forEach(([k]) => (cols[k] = []));
  const rank: Record<string, HkaiRow> = {};
  // cadre: from the list with names if there is one, otherwise the numbers of the Ρυθμίσεις
  const cl = (s.cadreList || []).filter((c) => c.active);
  const lists = s.settings.lists;
  hkRowList(lists).forEach((r) => (rank[r] = { n: cl.length ? 0 : s.settings.cadre[r] || 0, attached: 0, c: {} }));
  // status of a cadre member = a ΗΚΑΙ column: in the κωλυόμενοι (duty, ΕΥ…) or in the absent (leaves…)
  let cadreKol = 0,
    cadreAway = 0;
  const cadreCols: Record<string, Cadre[]> = {};
  for (const c of cl) {
    const hk = rank[c.hk] ? c.hk : guessHk(c.rank, lists, c.origin);
    const r = rank[hk] ? hk : 'Λοχίες';
    rank[r].n++;
    const a = cadreAbsOn(s, c.id, date);
    // ΕΠΟΠ/ΟΒΑ with duties: his written status, else the post of the day in Υπηρεσίες (exemption only by hand)
    const dk = c.pid != null ? onDuty.get(c.pid) : undefined;
    const col = (a && cadreAbsOf(a.kind, s.settings.lists)?.[2]) || (dk ? (dk === 'mg' ? 'mag' : 'yp') : undefined);
    if (col) {
      rank[r].c[col] = (rank[r].c[col] || 0) + 1;
      (cadreCols[col] ||= []).push(c);
      if (HK_K.some((x) => x[0] === col)) cadreKol++;
      else cadreAway++;
    }
  }
  let soldiers = 0;
  const at = hkMin(s.rules);
  const noCol: { p: Person; kind: string }[] = [],
    nc: Status[] = [];
  for (const p of activePeople(s)) {
    soldiers++;
    const r = hkRankOf(p.rank, s.settings.lists, p.origin);
    rank[r].n++;
    if (p.attached) rank[r].attached++;
    // returned by the ΗΚΑΙ time: present (Michael, 18/10); leaves after it: present until he leaves (Michael, 1/11)
    nc.length = 0;
    const col = soldierCol(
      s,
      notLeftYet(statusesFrom(live(s), p.id, date, at), date, at),
      onDuty.get(p.id),
      date,
      at,
      nc,
    );
    if (nc.length) noCol.push({ p, kind: upper(nc[0].kind || '') });
    if (col) {
      cols[col].push(p);
      rank[r].c[col] = (rank[r].c[col] || 0) + 1;
    }
  }
  let kol = HK_K.reduce((a, [k]) => a + cols[k].length, 0) + cadreKol,
    apo = HK_A.reduce((a, [k]) => a + cols[k].length, 0) + cadreAway;
  // whatever the user writes by hand (σιδηρουργείο, πρατήριο, φυλάκια, αποσπασμένοι…, μισθοτροφοδοτηθέντες «ab»)
  const man = s.hkaiManual?.[date]?.cells || {};
  for (const r of Object.keys(man)) {
    if (!rank[r]) continue;
    for (const [k, v] of Object.entries(man[r])) {
      if (!v) continue;
      rank[r].c[k] = (rank[r].c[k] || 0) + v;
      if (HK_K.some((x) => x[0] === k)) kol += v;
      else if (HK_A.some((x) => x[0] === k)) apo += v;
    }
  }
  const cadre = cl.length || hkRowList(lists).reduce((a, r) => a + (s.settings.cadre[r] || 0), 0);
  return {
    cols,
    cadre: cadreCols,
    rank,
    noCol,
    kol,
    apo,
    total: soldiers + cadre,
    avail: soldiers + cadre - apo,
    guardsN: Object.keys(g).length,
    soldiers,
    cadreN: cadre,
  };
}
