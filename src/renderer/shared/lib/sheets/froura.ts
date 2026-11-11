// The ΦΡΟΥΡΑ (Υπηρεσίες) preview.
// Purpose: `frouraSheet` builds the sheet of the day: ΣΒΕΝ (sample 01) or ΣΠΕΝ (the clerk's photo), and the user's own forms
//   with the layout of one of them: the same layout as the template that will be written. `frouraEmpty` counts empty posts.
// Does NOT: draw anything or write the Excel (main/exports.ts does, with the same rules).
// Owner layer: renderer/shared/lib. Why: moved from renderer/sheets.ts (Phase 5.3c part 2b); the sections are plain functions
//   that push into the same `rows`, in the order the one big function pushed them.
// Covering test: test/cadre-duty.test.ts, test/custom-excel.test.ts, test/shifts.test.ts, test/epop.test.ts.
import {
  absenceOf,
  frouraForm,
  dutyName,
  frouraLayout,
  frouraTables,
  lyLine,
  phaseOf,
  rows3,
  tableRowSpan,
  frouraPer,
  type FrouraTable,
} from '../../../../shared/froura';
import { TYPES, coversDay, phaseBase, type AppState, type Status } from '../../../../shared/domain';
import { dutyMin, seatMap, postBy, postsOf } from '../../../../shared/rules';
import { isAway } from '../../../../shared/ranks';
import { formText } from '../../../../shared/unit';
import { MON_SHORT, dm, parseD, type ISODate } from '../../../../shared/dates';
import { norm } from '../../../../shared/text';
import { backBy } from '../../../../shared/hours';
import { byName } from '../../../../shared/hkaiText';
import { E, type Cell, type SheetModel } from './model';
import { sigRows } from './sigRows';

/** What the sections of the ΦΡΟΥΡΑ preview share (computed once per sheet). */
interface FrouraCtx {
  s: AppState;
  date: ISODate;
  pm: ReturnType<typeof seatMap>;
  phase: ReturnType<typeof phaseOf>;
  spen: boolean;
  lay: ReturnType<typeof frouraLayout>;
  P: (k: string) => ReturnType<ReturnType<typeof seatMap>['get']>;
  nm: (k: string, rs?: number, cs?: number) => Cell;
  hdr: (...a: string[]) => Cell[];
  W: number;
}

/** The unit heading, the title, and the Λ/Υ and Δ/Υ lines. */
function frouraHead({ s, P, W }: FrouraCtx, d: Date): (Cell | null)[][] {
  const rows: (Cell | null)[][] = [
    [E('', '', 11), E(s.settings.unit[0], 'u', 2)],
    [E('', '', 11), E(s.settings.unit[1], 'u', 2)],
    [E('', '', 11), E(s.settings.unit[2], 'u', 2)],
    [
      E(
        'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ ' +
          String(d.getDate()).padStart(2, '0') +
          ' ' +
          MON_SHORT[d.getMonth()] +
          ' ' +
          d.getFullYear(),
        'ttl big',
        W,
      ),
    ],
    [E('', '', W)],
  ];
  for (const [k, l] of [
    ['ly', 'Λ/Υ'],
    ['dy', 'Δ/Υ'],
  ]) {
    const p = P(k);
    rows.push([p ? E(l + ': ' + lyLine(p), '', 8) : E(l + ': ΚΕΝΗ', 'kenh', 8), E('', '', 5)]);
  }
  rows.push([E('', '', W)]);
  return rows;
}

/** The Θαλαμοφύλακες / Οπλοφύλακες block: one row per shift of each number, as in the Excel. */
function frouraPosts({ s, phase, spen, nm, hdr, W }: FrouraCtx, rows: (Cell | null)[][]) {
  const right = spen ? 'op' : 'th',
    off = spen ? 1 : 5;
  rows.push([
    E(''),
    ...hdr('Α/Α', 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'),
    E('', '', 3),
    ...hdr('Α/Α', spen ? 'ΟΠΛΟΦΥΛΑΚΕΣ' : 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'),
    E(''),
  ]);
  // κάθε νούμερο πιάνει όσες γραμμές έχει βάρδιες (frouraPer), όπως στο Excel
  const per = frouraPer(s, phase);
  const sl = (k: string) => postBy(s, k)?.slots || [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < per[i]; j++) {
      const k = per[i];
      const h = () => E(sl('th' + (i + 1))[j] || '', 'b c');
      const h2 = () => E(sl(right + (i + off))[j] || '', 'b c');
      rows.push(
        j === 0
          ? [
              E(''),
              E(i + 1 + 'ο', 'b c', 1, k),
              nm('th' + (i + 1), k),
              h(),
              E('', 'b', 1, k),
              E('', '', 3),
              E(i + 1 + 'ο', 'b c', 1, k),
              nm(right + (i + off), k),
              h2(),
              E('', 'b', 1, k),
              E(''),
            ]
          : [E(''), null, null, h(), null, E('', '', 3), null, null, h2(), null, E('')],
      );
    }
  rows.push([E('', '', W)]);
}

/** The Μαγειρεία block (ΣΒΕΝ) or Μαγειρεία + Σκοποί + ΤΑΕ (ΣΠΕΝ). */
function frouraMess({ s, spen, nm, hdr }: FrouraCtx, rows: (Cell | null)[][]) {
  if (!spen) {
    rows.push([E('', '', 4), E('Α/Α', 'b hdr'), E('ΜΑΓΕΙΡΕΙΑ', 'b hdr', 3), E('ΠΑΡ/ΣΕΙΣ', 'b hdr'), E('', '', 4)]);
    for (let r = 1; r <= 5; r++)
      rows.push([E('', '', 4), E(r + 'ο', 'b c'), nm('mg' + r, 1, 3), E('', 'b'), E('', '', 4)]);
  } else {
    rows.push([
      E(''),
      E('Α/Α', 'b hdr'),
      E('ΜΑΓΕΙΡΕΙΑ', 'b hdr', 2),
      E('ΠΑΡ/ΣΕΙΣ', 'b hdr'),
      E('', '', 3),
      ...hdr('Α/Α', 'ΣΚΟΠΟΙ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ'),
      E(''),
    ]);
    for (let r = 0; r < 7; r++) {
      const left =
        r < 5
          ? [E(r + 1 + 'ο', 'b c'), nm('mg' + (r + 1), 1, 2), E('', 'b')]
          : r === 6
            ? [E('ΤΑΕ', 'b c'), nm('tae', 1, 2), E('', 'b')]
            : [E('', '', 4)];
      const sk = r < 6 ? Math.floor(r / 3) : -1,
        j = r % 3;
      const rt =
        sk < 0
          ? [E('', '', 4)]
          : j === 0
            ? [
                E(sk + 3 + 'η', 'b c', 1, 3),
                nm('sk' + (sk + 3) + 'a'),
                E(rows3(postBy(s, 'sk' + (sk + 3) + 'a')?.slots)[0], 'b c'),
                E('', 'b', 1, 3),
              ]
            : [null, null, E(rows3(postBy(s, 'sk' + (sk + 3) + 'a')?.slots)[j], 'b c'), null];
      rows.push([E(''), ...left, E('', '', 3), ...rt, E('')]);
    }
  }
}

/** The custom duties: one table each, two side by side, with an empty row before (as in the Excel). */
function frouraOwn({ s, lay, phase, W }: FrouraCtx, rows: (Cell | null)[][]) {
  // δικές σου υπηρεσίες: πίνακας η καθεμία, ανά δύο δίπλα δίπλα, με μία κενή γραμμή πριν (όπως στο Excel)
  const tabs = frouraTables(s, lay, phase);
  // γραμμές κάθε πίνακα: κεφαλίδα και μετά κάθε νούμερο, με μία γραμμή για κάθε βάρδια του (Α/Α και όνομα ενωμένα)
  const lines = (t: FrouraTable) => [
    null,
    ...t.rows.flatMap((x) => Array.from({ length: tableRowSpan(x) }, (_, j) => ({ x, j }))),
  ];
  const half = (t: FrouraTable | undefined, i: number): (Cell | null)[] => {
    const L = t ? lines(t) : [];
    if (!t || i >= L.length) return [E('', '', 4)];
    const span = t.hours ? 1 : 2;
    if (i === 0)
      return [
        E('Α/Α', 'b hdr'),
        E(t.title, 'b hdr', span),
        ...(t.hours ? [E('ΩΡΕΣ', 'b hdr')] : []),
        E('ΠΑΡ/ΣΕΙΣ', 'b hdr'),
      ];
    const { x, j } = L[i]!;
    const rs = tableRowSpan(x);
    const hr = x.shifts ? x.shifts[j] : x.hours;
    if (j > 0) return [null, null, ...(t.hours ? [E(hr, 'b c')] : []), null];
    return [
      E(x.n, 'b c', 1, rs),
      x.name ? E(x.name, 'b c', span, rs) : E('ΚΕΝΗ', 'b c kenh', span, rs),
      ...(t.hours ? [E(hr, 'b c')] : []),
      E('', 'b', 1, rs),
    ];
  };
  for (let j = 0; j < tabs.length; j += 2) {
    const a = tabs[j],
      b = tabs[j + 1];
    rows.push([E('', '', W)]);
    for (let i = 0; i < Math.max(lines(a).length, b ? lines(b).length : 0); i++)
      rows.push([E(''), ...half(a, i), E('', '', 3), ...half(b, i), E('')]);
  }
  rows.push([E('', '', W)]);
}

/** The punished and the absent, side by side. */
function frouraPunAbs({ s, date, pm, hdr }: FrouraCtx, rows: (Cell | null)[][]) {
  const on = (x: Status) => coversDay(x, date);
  const away = (x: Status) => on(x) && !backBy(x, date, dutyMin(s.settings)); // όποιος γυρίζει ως την αρχή της υπηρεσίας (π.χ. 14:00) δεν είναι απών της υπηρεσίας
  const pun = s.statuses
    .filter((x) => x.type === 'PUN' && !x.pending && on(x) && pm.has(x.pid))
    .sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!));
  const abs = s.statuses
    .filter((x) => isAway(x, s.settings.lists) && TYPES[x.type].cat !== 'out' && away(x) && pm.has(x.pid))
    .sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!));
  rows.push([E('ΤΙΜΩΡΗΜΕΝΟΙ', 'b hdr', 6), E(''), E('ΑΠΟΝΤΕΣ', 'b hdr', 6)]);
  rows.push([
    ...hdr('Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡ/ΣΕΙΣ'),
    E(''),
    ...hdr('Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΕΙΔΟΣ ΑΠΟΥΣΙΑΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡ/ΣΕΙΣ'),
  ]);
  for (let i = 0; i < Math.max(6, pun.length, abs.length); i++) {
    const a = pun[i],
      b = abs[i];
    rows.push([
      E(i + 1, 'b c'),
      E(a ? dutyName(pm.get(a.pid)!) : '', 'b'),
      E(a ? norm(a.kind || 'Ποινή') : '', 'b c'),
      E(a ? dm(a.from) : '', 'b c'),
      E(a && !a.open ? dm(a.to) : '', 'b c'),
      E(a?.note || '', 'b'),
      E(''),
      E(i + 1, 'b c'),
      E(b ? dutyName(pm.get(b.pid)!) : '', 'b'),
      E(b ? absenceOf(b) : '', 'b c'),
      E(b ? dm(b.from) : '', 'b c'),
      E(b && !b.open ? dm(b.to) : '', 'b c'),
      E(b?.note || '', 'b'),
    ]);
  }
}

// ΦΡΟΥΡΑ ΣΒΕΝ (δείγμα 01) ή ΣΠΕΝ (φωτογραφία γραφέα), και τα δικά σου έντυπα με τη διάταξη ενός από τα δύο: ίδια διάταξη με το template που θα βγει
export function frouraSheet(s: AppState, date: ISODate): SheetModel {
  const g = s.guards[date] || {};
  const pm = seatMap(s);
  const phase = phaseOf(s);
  const spen = phaseBase(s.settings, phase) === 'spen';
  const lay = frouraLayout(s, date, phase);
  const pos = frouraForm(s, phase).pos;
  const P = (k: string) => (g[k] ? pm.get(g[k]) : undefined);
  const names = (k: string) => lay.cells.get(pos[k]) || [];
  const nm = (k: string, rs = 3, cs = 1): Cell => {
    const n = names(k);
    return n.length ? E(n.join('\n'), 'b c w pl', cs, rs) : E('ΚΕΝΗ', 'b c kenh', cs, rs);
  };
  const hdr = (...a: string[]) => a.map((t) => E(t, 'b hdr'));
  const d = parseD(date);
  const W = 13;
  const c: FrouraCtx = { s, date, pm, phase, spen, lay, P, nm, hdr, W };
  const rows = frouraHead(c, d);
  frouraPosts(c, rows);
  frouraMess(c, rows);
  frouraOwn(c, rows);
  frouraPunAbs(c, rows);
  rows.push(
    [E('', '', W)],
    ...sigRows(s, 'froura', W, false, [
      [E(''), E('-Ο-', 'c', 2), E('-Ο-', 'c', 2), E('', '', 2), E('ΤΟ', 'c', 3), E('-Ο-', 'c', 3)],
      [
        E(''),
        E(formText(s.settings, 'ΑΛΧΙΑΣ ΙΛΗΣ'), 'ttl', 2),
        E(formText(s.settings, 'ΔΚΤΗΣ ΙΛΗΣ'), 'ttl', 2),
        E('', '', 2),
        E('2ο ΓΡΑΦΕΙΟ', 'ttl', 3),
        E(formText(s.settings, 'ΔΚΤΗΣ ΕΠΧΙΑΣ'), 'ttl', 3),
      ],
    ]),
  );
  return { cols: [30, 34, 150, 78, 54, 8, 8, 8, 34, 150, 78, 54, 30], rows };
}
export const frouraEmpty = (s: AppState, date: ISODate) =>
  postsOf(s.settings).filter((x) => !s.guards[date]?.[x.k]).length;
