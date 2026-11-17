// Random but repeatable app states for the ΗΚΑΙ/ΗΚΑΛ rule-engine tests: the duty/leave states of outs-gen (genState) with ranks and origins
// for every kind of row, attached people, a cadre list with absences, hand-written cells, the unit's own rows and leave kinds.
// Only made-up names.
import { genState, DAYS } from './outs-gen';
import type { AppState, CadreAbs, Cadre } from '../src/shared/domain';
import type { ISODate } from '../src/shared/dates';

const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const SOLDIER = ['ΣΤΡ', 'ΣΤΡ', 'ΣΤΡ', 'ΣΤΡ', 'ΔΝΕΑΣ', 'ΛΧΙΑΣ', 'ΕΠΙΛΧΙΑΣ', 'ΑΡΧΙΛΧΙΑΣ', 'ΥΠΟΔΝΕΑΣ'];
const ORIGIN = ['', '', '', 'ΕΠΟΠ', 'ΟΒΑ', 'ΕΦ', 'ΕΜΘ'];
const CADRE_RANK: [string, string][] = [['ΤΧΗΣ', 'Επίλαρχοι'], ['ΛΓΟΣ', 'Ίλαρχοι'], ['ΥΠΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΑΝΘΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι'], ['ΑΝΘΣΤΗΣ', 'Ανθυπασπιστές'], ['ΔΕΑ', 'ΔΕΑ'], ['ΑΛΧΙΑΣ', 'Αρχιλοχίες'], ['ΕΠΧΙΑΣ', 'Επιλοχίες'], ['ΛΧΙΑΣ', 'Λοχίες'], ['ΔΝΕΑΣ', 'Δεκανείς']];
const CADRE_ABS = ['ka', 'an', 'eid', 'nos', 'yp', 'ey', 'kin', 'mag', 'ekp', 'allh', 'fp'];

// nofixed: nothing that belongs to no person (no hand-written numbers on the rows, no cadre numbers from the settings); noSoldierOwn: no own rank
export interface HkGenOpts { own?: boolean; lochos?: boolean; cadre?: boolean; attached?: boolean; nofixed?: boolean; plainRanks?: boolean; adik?: boolean }   // adik: Άγνοια/Λιποταξία/Αδικ. απουσία (sweep 17/11), own random stream: other seeds unchanged
export function genHkState(seed: number, o: HkGenOpts = {}): AppState {
  const r = rng(seed * 31 + 7); const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  let s = genState(seed * 7919 + 3, r() < 0.5, 12 + Math.floor(r() * 14));
  const people = s.people.map((p, i) => ({ ...p, rank: o.plainRanks ? pick(SOLDIER.filter(x => x !== 'ΥΠΟΔΕΚΑΝΕΑΣ' && x !== 'ΥΠΟΔΝΕΑΣ')) : pick(SOLDIER), origin: pick(ORIGIN) || undefined, attached: o.attached !== false && r() < 0.15, active: i === 3 ? r() < 0.8 : true }));
  const lists: NonNullable<AppState['settings']['lists']> = {};
  if (o.own) {
    lists.hkRows = [{ name: 'Ειδικοί Οδηγοί', grp: 'nco', after: 'Δεκανείς', ranks: ['ΕΙΔ ΟΔΗΓΟΣ'] }];
    lists.leaveKinds = { add: [{ name: 'Φύλλο πορείας', col: 'fp' }, { name: 'Υπηρεσιακό', col: 'kin' }, { name: 'Εκτός', col: '-' }] };
    people.forEach((p, i) => { if (i % 7 === 2) p.rank = 'ΕΙΔ ΟΔΗΓΟΣ'; });
    lists.soldierRanks = { add: [{ name: 'ΕΙΔ ΟΔΗΓΟΣ', hk: 'Ειδικοί Οδηγοί' }] };
  }
  const cadreList: Cadre[] = []; const cadreAbs: CadreAbs[] = [];
  if (o.cadre !== false) {
    const n = 4 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const [rank, hk] = pick(CADRE_RANK);
      cadreList.push({ id: 'c' + i, rank, origin: r() < 0.25 ? pick(['ΕΠΟΠ', 'ΕΜΘ']) : undefined, hk: r() < 0.8 ? hk : '', last: 'ΣΤΕΛΕΧΟΣ' + i, first: 'ΟΝΟΜΑ', active: r() < 0.9 });
      if (r() < 0.6) { const from = pick(DAYS.slice(0, 10)); cadreAbs.push({ id: 'a' + i, cid: 'c' + i, kind: pick(CADRE_ABS), from, to: DAYS[Math.min(DAYS.length - 1, DAYS.indexOf(from) + Math.floor(r() * 5))] }); }
    }
  }
  const settings = { ...s.settings, lists: { ...(s.settings.lists || {}), ...lists }, ...(o.lochos ? { unitKind: 'lochos' as const } : {}), cadre: o.nofixed ? {} : { ...s.settings.cadre } };
  if (!cadreList.length && !o.nofixed) for (const k of ['Επίλαρχοι', 'Ίλαρχοι', 'Λοχίες']) settings.cadre[k] = Math.floor(r() * 3);
  const hkaiManual: AppState['hkaiManual'] = {};
  for (const d of DAYS) if (r() < 0.5 && !o.nofixed) hkaiManual[d] = { cells: { 'Στρατιώτες': { sid: Math.floor(r() * 3), ab: Math.floor(r() * 4), prat: Math.floor(r() * 2) }, ...(r() < 0.4 ? { 'Λοχίες': { allh: 1 } } : {}) } } as unknown as AppState['hkaiManual'][ISODate];
  s = { ...s, people, cadreList, cadreAbs, settings, hkaiManual };
  if (o.adik) {
    const q = rng(seed * 97 + 13); const types = ['AGN', 'LIP', 'ADK'] as const; const add: AppState['statuses'] = [];
    for (const p of people) if (q() < 0.2) {
      const i = Math.floor(q() * DAYS.length); const from = DAYS[i]; const to = DAYS[Math.min(DAYS.length - 1, i + Math.floor(q() * 4))];
      // it replaces what that person had on those days (one state at a time, as the declare dialog does)
      s = { ...s, statuses: s.statuses.filter(x => x.pid !== p.id || x.to < from || x.from > to) };
      add.push({ id: 'adk' + p.id, pid: p.id, type: types[Math.floor(q() * 3)], from, to, ...(q() < 0.3 ? { open: true } : {}), ...(q() < 0.4 ? { note: 'διότι δεν επέστρεψε' } : {}) } as AppState['statuses'][number]);
    }
    s = { ...s, statuses: [...s.statuses, ...add] };
  }
  return s;
}
export { DAYS };
