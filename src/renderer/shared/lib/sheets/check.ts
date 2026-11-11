// The «Έλεγχος υπηρεσιών» preview: the monthly grid as in sample 03.
// Purpose: `checkSheet` gives one row per person (and per cadre member who served) with the post code of each day.
// Does NOT: draw anything or write the Excel (main/exports.ts does, with the same rules).
// Owner layer: renderer/shared/lib. Why: moved verbatim from renderer/sheets.ts (Phase 5.3c part 2b).
// Covering test: test/cadre-duty.test.ts.
import { bareOf, codeOf } from '../../../../shared/codes';
import { fullName, type AppState, type DutyKind } from '../../../../shared/domain';
import { activePeople, cadreSeats, isHol, postBy } from '../../../../shared/rules';
import { rankTxt } from '../../../../shared/ranks';
import { MONTHS } from '../../../../shared/dates';
import { norm } from '../../../../shared/text';
import { byName } from '../../../../shared/hkaiText';
import { E, type Cell, type SheetModel } from './model';

// Έλεγχος υπηρεσιών: μηνιαίο πλέγμα όπως το δείγμα 03
// only: μόνο αυτά τα άτομα (αναζήτηση στο πλέγμα)
export function checkSheet(s: AppState, ym: string, only?: Set<number>): SheetModel {
  const [y, m] = ym.split('-').map(Number);
  const nd = new Date(y, m, 0).getDate();
  const days = Array.from({ length: nd }, (_, i) => ym + '-' + String(i + 1).padStart(2, '0'));
  const hol = days.map((d) => isHol(s.settings, d)); // μία φορά ανά μέρα, όχι ανά κελί
  const codes = new Map<string, { code: string; kind: DutyKind } | null>(); // κωδικός ανά θέση (Θ1α, Μ2, ΛΥ), όχι αναζήτηση σε κάθε ανάθεση
  const per = new Map<number, Map<string, { code: string; kind: DutyKind }>>();
  const set = (pid: number, d: string, v: { code: string; kind: DutyKind }) => {
    if (!per.has(pid)) per.set(pid, new Map());
    per.get(pid)!.set(d, v);
  };
  // όλες οι θέσεις που έχουν υπάρξει (και του άλλου εντύπου), και οι υπηρεσίες χωρίς θέση (σκέτο γράμμα): ίδια με την εξαγωγή
  for (const d of days) {
    for (const e of s.dutyLog?.[d] || []) set(e.pid, d, { code: bareOf(undefined, e.kind), kind: e.kind });
    const g = s.guards[d] || {};
    for (const k in g) {
      let v = codes.get(k);
      if (v === undefined) {
        const p = postBy(s, k);
        v = p ? { code: codeOf(s.settings, k, p.kind), kind: p.kind } : null;
        codes.set(k, v);
      }
      if (v) set(g[k], d, v);
    }
  }
  const W = 8 + nd;
  const rows: (Cell | null)[][] = [
    [E('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(MONTHS[m - 1]) + ' ' + y, 'ttl big', W)],
    [
      ...['Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΘΑΛ.', 'ΑΡΓ.', 'ΣΥΝ.', 'Θ', 'Μ', 'ΛΥ'].map((x) => E(x, 'b hdr sm')),
      ...days.map((_d, j) => E(j + 1, 'b hdr sm' + (hol[j] ? ' we' : ''))),
    ],
  ];
  // στελέχη που έκαναν υπηρεσία τον μήνα (Michael, 26/10): μετά τους στρατιώτες, με βαθμό
  const cad = cadreSeats(s).filter((c) => per.has(c.id) && (!only || only.has(c.id)));
  rows.push(
    ...[
      ...activePeople(s)
        .filter((p) => !only || only.has(p.id))
        .sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || byName(a, b)),
      ...cad,
    ].map((p, i) => {
      const x = per.get(p.id);
      let nh = 0;
      const c: Record<string, number> = {};
      const cells = days.map((d, j) => {
        const v = x?.get(d);
        if (v) {
          if (hol[j]) nh++;
          c[v.kind] = (c[v.kind] || 0) + 1;
        }
        return E(v ? v.code : '', hol[j] ? 'b code we' : 'b code');
      });
      return [
        E(i + 1, 'b c'),
        E(p.cid ? rankTxt(p) + ' ' + fullName(p) : fullName(p), 'b'),
        E(p.room ?? '', 'b c'),
        E(nh, 'b c'),
        E(x ? x.size : 0, 'b c bold'),
        E(c.th || '', 'b c'),
        E(c.mg || '', 'b c'),
        E(c.ly || '', 'b c'),
        ...cells,
      ];
    }),
  );
  return { cols: [30, 172, 34, 34, 34, 26, 26, 26, ...days.map(() => 24)], rows };
}
