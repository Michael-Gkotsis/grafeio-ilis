// The ΗΚΑΙ preview: front (sample 15) and back.
// Purpose: `hkaiFront` builds the daily report with the counts per rank row; `hkaiBack` the back page with the guards, the
//   vehicles, the accidents, the duty organs and the commander's decisions, with the same rules as the export.
// Does NOT: draw anything or write the Excel (main/exports.ts does).
// Owner layer: renderer/shared/lib. Why: moved from renderer/sheets.ts (Phase 5.3c part 2b); `hkaiBack` is split into plain
//   sections that return their rows in the order the one literal had them.
// Covering test: test/unit.test.ts.
import { hkOn, fullName, type AppState } from '../../../../shared/domain';
import { HK_K, HK_A, seatMap, postsOf, type Hkai } from '../../../../shared/rules';
import { hkRowsOf, rankTxt } from '../../../../shared/ranks';
import { formText, hkHeadOf, hkRowLabel } from '../../../../shared/unit';
import { hkDate, type ISODate } from '../../../../shared/dates';
import {
  hkOrgans,
  hkaiDiaLines,
  hkaiEgrLines,
  hkaiLeaveLines,
  hkaiPunLines,
  hkaiReqLines,
  linesText,
  type Line,
} from '../../../../shared/hkaiText';
import { hkOffText } from '../../../../shared/cadre';
import { E, type Cell, type SheetModel } from './model';
import { sigRows } from './sigRows';

/** The counts block of ΗΚΑΙ front: one line per rank row, then the three totals (ΑΞΚΩΝ, ΟΠΛΙΤΩΝ, ΓΕΝΙΚΟ). */
function hkaiFrontCounts(s: AppState, h: Hkai, rows: (Cell | null)[][]) {
  const pv = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  const pvOf = (list: string[]) => list.reduce((a, r) => a + (pv[r] || 0), 0);
  const line = (label: string, n: number, att: number, c: Record<string, number>, bold: boolean, prov = 0) => {
    const k = HK_K.map(([x]) => c[x] || 0),
      a = HK_A.map(([x]) => c[x] || 0);
    const sk = k.reduce((p, q) => p + q, 0),
      sa = a.reduce((p, q) => p + q, 0);
    const st = bold ? 'b c bold' : 'b c';
    return [
      E(label, 'b' + (bold ? ' bold' : '')),
      E(prov || '', st),
      E(n - att, st),
      E(att, st),
      E(n, st),
      ...k.map((v) => E(v || '', st)),
      E(sk, st),
      ...a.map((v) => E(v || '', st)),
      E(sa, st),
      E(n - sa, st),
      E(c.ab || '', st),
    ];
  };
  const sum = (list: string[]) => {
    const c: Record<string, number> = {};
    let n = 0,
      att = 0;
    for (const r of list) {
      const x = h.rank[r];
      n += x.n;
      att += x.attached;
      for (const k in x.c) c[k] = (c[k] || 0) + x.c[k];
    }
    return { n, att, c };
  };
  const R = hkRowsOf(s.settings.lists);
  rows.push(
    ...R.off.map((r) => line(hkRowLabel(r, s.settings), h.rank[r].n, h.rank[r].attached, h.rank[r].c, false, pv[r])),
  );
  let x = sum(R.off);
  rows.push(line('ΣΥΝΟΛΟ ΑΞΚΩΝ', x.n, x.att, x.c, true, pvOf(R.off)));
  rows.push(
    ...R.nco.map((r) => line(hkRowLabel(r, s.settings), h.rank[r].n, h.rank[r].attached, h.rank[r].c, false, pv[r])),
  );
  x = sum(R.nco);
  rows.push(line('ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ', x.n, x.att, x.c, true, pvOf(R.nco)));
  x = sum([...R.off, ...R.nco]);
  rows.push(line('ΓΕΝΙΚΟ ΣΥΝΟΛΟ', x.n, x.att, x.c, true, pvOf([...R.off, ...R.nco])));
}

// ΗΚΑΙ μπροστινό (δείγμα 15)
export function hkaiFront(s: AppState, date: ISODate, h: Hkai): SheetModel {
  const nK = HK_K.length,
    nA = HK_A.length,
    W = 8 + nK + nA;
  const hd = hkHeadOf(s.settings);
  const rows: (Cell | null)[][] = [
    [E(hd[0], 'u', 4), E('', '', W - 4)],
    [E(hd[1], 'u', 4), E('', '', W - 4)],
    [E('ΚΑΤΑΣΤΑΣΗ', 'ttl big', W)],
    [E('ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(date), 'ttl', W)],
    [E('', '', W)],
  ];
  const H = (v: string, cs?: number, rs?: number) => E(v, 'b hdr sm', cs, rs);
  rows.push([
    H('ΒΑΘΜΟΙ', 1, 2),
    H('Προβλ.', 1, 2),
    H('ΔΥΝΑΜΗ', 2),
    H('Σύν.', 1, 2),
    H('ΚΩΛΥΟΜΕΝΟΙ', nK),
    H('Σύν. κωλ.', 1, 2),
    H('ΑΠΟΝΤΕΣ', nA),
    H('Σύν. απ.', 1, 2),
    H('Διαθ. εκπ.', 1, 2),
    H('Μισθοτρ.', 1, 2),
  ]);
  rows.push([
    null,
    null,
    H('Τοπ.'),
    H('Προσκ.'),
    null,
    ...HK_K.map((x) => H(x[1])),
    null,
    ...HK_A.map((x) => H(x[1])),
    null,
    null,
    null,
  ]);
  hkaiFrontCounts(s, h, rows);
  rows.push(
    [E('', '', W)],
    [E('', '', W - 8), E(s.settings.place + ', ' + hkDate(date), 'c', 8)],
    [E('', '', W)],
    ...sigRows(s, 'hkai', W, true, [
      [E('', '', 2), E('-Ο-', 'c', 6), E('', '', W - 16), E('-Ο-', 'c', 8)],
      [
        E('', '', 2),
        E(formText(s.settings, 'ΑΛΧΙΑΣ ΙΛΗΣ'), 'ttl', 6),
        E('', '', W - 16),
        E(formText(s.settings, 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ'), 'ttl', 8),
      ],
    ]),
  );
  return { cols: [132, 40, 34, 34, 34, ...HK_K.map(() => 32), 36, ...HK_A.map(() => 32), 36, 36, 40], rows };
}
/** What the sections of ΗΚΑΙ back share (computed once per sheet). */
interface BackCtx {
  s: AppState;
  date: ISODate;
  night: number;
  day24: number;
  v: NonNullable<AppState['settings']['hkai']>['veh'];
  N: (v: number) => Cell;
  A: (k: string) => Cell;
  L: (n: number, lbl: string, v: string | Line[]) => (Cell | null)[];
  name: (pid: number) => string;
  og: ReturnType<typeof hkOrgans>;
  tx: Record<string, string>;
  egr: Line[];
  dia: Line[];
  leaves: Line[];
  puns: Line[];
  reqs: Line[];
}

/** The guards, vehicles and accidents block of ΗΚΑΙ back. */
function hkaiBackStats({ v, N, A, night, day24 }: BackCtx): (Cell | null)[][] {
  return [
    [
      E('ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ', 'b hdr', 5),
      E(''),
      E('ΚΑΤΑΣΤΑΣΗ ΟΧΗΜΑΤΩΝ', 'b hdr', 4),
      E(''),
      E('ΑΤΥΧΗΜΑΤΑ', 'b hdr', 3),
    ],
    [
      ...['Είδος', 'Αξκοί', 'Υπξκοι', 'Στρατιώτες', 'Σύνολο'].map((x) => E(x, 'b hdr sm')),
      E(''),
      ...['Είδος', 'Προβλ.', 'Σε κίνηση', 'Επισκευή'].map((x) => E(x, 'b hdr sm')),
      E(''),
      ...['Οχήματα', 'Ζημιές', 'Άνδρες'].map((x) => E(x, 'b hdr sm')),
    ],
    [
      E('Νυκτοφρουρές', 'b'),
      N(0),
      N(0),
      N(night),
      N(night),
      E(''),
      E(v?.type || '1/4 τόνων', 'b'),
      N(v?.prov || 0),
      N(v?.kin || 0),
      N((v?.maint || 0) + (v?.dmg || 0)),
      E(''),
      A('accT'),
      A('accP'),
      A('accM'),
    ],
    [E('24ωρες', 'b'), N(0), N(0), N(day24), N(day24), E('', '', 9)],
    [E('Πέραν 24ώρου', 'b'), N(0), N(0), N(0), N(0), E('', '', 9)],
    [E('Σύνολο', 'b bold'), N(0), N(0), N(night + day24), N(night + day24), E('', '', 9)],
    [E('', '', 14)],
  ];
}

/** The duty organs on the left, the commander's decisions on the right. */
function hkaiBackOrgans({ s, date, L, name, og, tx, egr, dia, leaves, puns, reqs }: BackCtx): (Cell | null)[][] {
  return [
    [E('Όργανα υπηρεσίας', 'bold', 6), E('Αποφάσεις Διοικητή', 'ttl', 8)],
    [E('Αξιωματικοί:', '', 6), ...L(1, 'ΕΓΓΡΑΦΕΣ', egr)],
    [E(hkOffText(s, date), 'w', 6), ...L(2, 'ΔΙΑΓΡΑΦΕΣ', dia)],
    [E('Υπαξιωματικοί:', '', 6), ...L(3, 'ΑΔΕΙΕΣ', leaves)],
    [E(og.ly ? 'Λ/Υ: ' + name(og.ly) : '', 'w', 6), ...L(4, 'ΠΟΙΝΕΣ', puns)],
    [E(og.dy ? 'Δ/Υ: ' + name(og.dy) : '', 'w', 6), ...L(5, 'ΑΙΤΗΣΕΙΣ', reqs)],
    [E('', '', 6), ...L(6, 'ΛΟΙΠΑ', tx.loi || '')],
  ];
}

// ΗΚΑΙ πίσω: ίδιοι κανόνες με την εξαγωγή (main/exports.ts)
export function hkaiBack(s: AppState, date: ISODate): SheetModel {
  const g = s.guards[date] || {};
  const pm = seatMap(s);
  const posts = postsOf(s.settings);
  let night = 0,
    day24 = 0;
  for (const k in g) {
    const p = posts.find((x) => x.k === k);
    if (!p) continue;
    if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++;
    else day24++;
  }
  const name = (pid: number) => {
    const p = pm.get(pid);
    return p ? [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', fullName(p)].filter(Boolean).join(' ') : '?';
  };
  const egr = hkaiEgrLines(s, date),
    dia = hkaiDiaLines(s, date),
    leaves = hkaiLeaveLines(s, date),
    puns = hkaiPunLines(s, date),
    reqs = hkaiReqLines(s, date);
  // ενότητες που η Ίλη έκλεισε: κενές, όπως στο έντυπο
  const grd = hkOn(s.settings, 'grd'),
    v = hkOn(s.settings, 'veh') ? s.settings.hkai?.veh : undefined,
    acc = hkOn(s.settings, 'acc');
  if (!grd) {
    night = 0;
    day24 = 0;
  }
  const A = (k: string) => E(acc && tx[k]?.trim() ? tx[k].trim() : 'Ø', 'b c');
  const N = (v: number) => E(v || '', 'b c');
  const tx = s.hkaiManual?.[date]?.text || {};
  const og = hkOrgans(s, date);
  // όργανα υπηρεσίας (6 στήλες) αριστερά, απόφαση δεξιά: τίτλος 2 στήλες, κείμενο 6
  const L = (n: number, lbl: string, v: string | Line[]) => [
    E(n + '. ' + lbl + ':', 'bold', 2),
    typeof v === 'string' ? E(v || '', 'w', 6) : { ...E(linesText(v), 'w', 6), rich: v },
  ];
  const c: BackCtx = { s, date, night, day24, v, N, A, L, name, og, tx, egr, dia, leaves, puns, reqs };
  const rows: (Cell | null)[][] = [
    ...hkaiBackStats(c),
    ...hkaiBackOrgans(c),
    [E('', '', 14)],
    [E('', '', 6), E('ΑΝΑΦΕΡΕΤΑΙ ΠΛΗΡΟΤΗΤΑ ΟΠΛΙΣΜΟΥ ΚΑΙ ΛΟΙΠΩΝ ΕΛΚΥΣΤΙΚΩΝ ΥΛΙΚΩΝ', 'bold', 8)],
    [E('', '', 9), E(s.settings.place + ', ' + hkDate(date), 'c', 5)],
    ...sigRows(s, 'hkai', 14, true, [
      [E('', '', 2), E('-Ο-', 'c', 4), E('', '', 3), E('-Ο-', 'c', 5)],
      [
        E('', '', 2),
        E(formText(s.settings, 'ΑΛΧΙΑΣ ΙΛΗΣ'), 'ttl', 4),
        E('', '', 3),
        E(formText(s.settings, 'ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ'), 'ttl', 5),
      ],
    ]),
  ];
  return { cols: [96, 46, 46, 60, 50, 10, 70, 46, 56, 56, 10, 60, 50, 50], rows };
}
