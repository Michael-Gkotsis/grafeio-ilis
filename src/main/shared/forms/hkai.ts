// Fills the ΗΚΑΙ (daily report of the unit, specimen 15).
//
// Purpose: `fillHkai` (front page numbers and back page texts) and the private `HK_KEYS` (the columns per kind of
//   impeded/absent).
// Does NOT: change the shape of the rows (hkaiRows.ts) or sign the sheets (sign.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: the ΗΚΑΙ has two pages with their own maps; it moved verbatim from src/main/exports.ts (Phase 4.9a). `fillHkai`
//   is longer than 80 lines and stays one function in this PR.
// Covering test: test/hkai.test.ts, test/hkai-auto.test.ts, test/print-layout.test.ts and the golden hashes of `npm run
//   bench:golden`.
import { dmyy, hkDate, type ISODate } from '../../../shared/dates';
import { norm } from '../../../shared/text';
import {
  hkOrgans,
  hkaiDiaLines,
  hkaiEgrLines,
  hkaiLeaveLines,
  hkaiPunLines,
  hkaiReqLines,
} from '../../../shared/hkaiText';
import { hkOn, type AppState } from '../../../shared/domain';
import { hkRowsOf } from '../../../shared/ranks';
import { reportOf } from '../../../shared/unit';
import { seatMap, hkaiCounts, postBy } from '../../../shared/rules';
import { Workbook } from '../excel/xlsx';
import { HK_COLS, detectHkai, type HkaiMap } from '../../../shared/sources';
import { hkOffText } from '../../../shared/cadre';
import { mapHkBack, textCells } from '../../tplmap';
import type { Sig } from '../../../shared/sigs';
import { blockOf } from '../../layout';
import type { ExportResult, SheetPart } from './types';
import { who, unitWords } from './common';
import { signSheets } from './sign';
import { TemplateError } from './templateError';
import { addHkRows, hkRowLabels, hkHead } from './hkaiRows';

/** Columns per kind of impeded/absent (the keys of hkaiCounts). */
const HK_KEYS = [
  'yp',
  'ey',
  'tim',
  'bl',
  'os',
  'mag',
  'sid',
  'kin',
  'ka',
  'an',
  'eid',
  'nos',
  'prat',
  'adik',
  'fp',
  'fyl',
  'apal',
  'ekp',
  'allh',
];

/**
 * Fills the ΗΚΑΙ (specimen 15) for day `d`. `front`/`back`: the sheets of the front and the back page (empty: the ones
 * that look most like them). `map`: where each number goes; without it, it is found from the texts of the form
 * (detectHkai), and on top of that what the user corrected (`cells`, Αρχεία Excel > ΗΚΑΙ). The back page from its
 * labels (tplmap.ts): "1. ΕΓΓΡΑΦΕΣ:" ... "6. ΛΟΙΠΑ:", "Υπαξιωματικοί:", guards, vehicles. Throws TemplateError when the
 * totals are not formulas.
 */
export async function fillHkai(
  tpl: Buffer,
  s: AppState,
  d: ISODate,
  opts: { front?: string; back?: string; map?: HkaiMap; cells?: Partial<HkaiMap>; sigs?: Sig[] | null } = {},
): Promise<ExportResult> {
  const wb = await Workbook.open(tpl);
  await unitWords(wb, s);
  const names = wb.sheetNames();
  const place = s.settings.place;
  const own = [...hkRowsOf(s.settings.lists).own],
    hkNames = s.settings.lists?.hkNames;
  const det = new Map<string, ReturnType<typeof detectHkai>>();
  for (const n of names) det.set(n, detectHkai({ name: n, rows: await wb.values(n, 120, 40) }, place, own, hkNames));
  const frName =
    opts.front && wb.hasSheet(opts.front)
      ? opts.front
      : [...names].sort((a, b) => det.get(b)!.found - det.get(a)!.found)[0];
  const backRe = /^\d\s*\.?\s*ΕΓΓΡΑΦΕΣ|^ΧΟΡΗΓΟΥΜΕΝΕΣ ΦΡΟΥΡΕΣ|^ΟΡΓΑΝΑ ΥΠΗΡΕΣΙΑΣ|^ΑΠΟΦΑΣΕΙΣ/;
  let bkName = opts.back && wb.hasSheet(opts.back) ? opts.back : undefined;
  if (!bkName)
    for (const n of names)
      if (textCells(await wb.values(n, 120, 40)).some((x) => backRe.test(x.t))) {
        bkName = n;
        break;
      }
  if (!bkName) bkName = names.find((n) => n !== frName && det.get(n)!.found === 0) || frName;
  const fr = await wb.sheet(frName);
  const bk = await wb.sheet(bkName);
  const c = opts.cells;
  const m0 = opts.map || det.get(frName)!.map;
  const m: HkaiMap = {
    title: c?.title || m0.title,
    date: c?.date || m0.date,
    rows: { ...m0.rows, ...(c?.rows || {}) },
    cols: { ...m0.cols, ...(c?.cols || {}) },
  };
  const pm = seatMap(s);
  const warnings: string[] = [];
  const hk = hkaiCounts(s, d);
  const R = hkRowsOf(s.settings.lists);
  const ALL = [...R.off, ...R.nco];
  const prov = hkOn(s.settings, 'prov') ? s.settings.hkai?.prov || {} : {};
  addHkRows(wb, fr, m, R, warnings, (k) => hk.rank[k]?.n > 0 || prov[k] > 0);
  hkRowLabels(fr, m, ALL, s);
  hkHead(fr, m, s);
  if (m.title) fr.set(m.title, 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ' + s.settings.unitName + ' ΤΗΣ ' + hkDate(d));
  else warnings.push('Το template δεν έχει τίτλο «ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ…»: η ημερομηνία δεν γράφτηκε');
  if (m.date) fr.set(m.date, place + ', ' + hkDate(d));
  const rowsOf: [string, number][] = ALL.map((r) => [r, m.rows[r]] as [string, number]).filter(([, r]) => r > 0);
  // pre-check of the template (research §3.6): the totals must be formulas, not typed numbers
  const lost = rowsOf
    .flatMap(([, r]) => [m.cols.sum, m.cols.sumK, m.cols.sumA, m.cols.avail].filter(Boolean).map((c) => c + r))
    .filter((ref) => !fr.hasFormula(ref));
  if (lost.length)
    throw new TemplateError(
      'Το template της ' +
        reportOf(s.settings) +
        ' έχει χάσει τύπους στα κελιά ' +
        lost.slice(0, 6).join(', ') +
        (lost.length > 6 ? ' κ.ά.' : '') +
        '. Τα αθροίσματα δεν θα ήταν σωστά. Βάλε ξανά τους τύπους ή σβήσε το δικό σου hkai.xlsx από τον φάκελο templates (ή διάλεξε άλλο template στα Αρχεία Excel).',
    );
  // columns that the form does not have: what would go there is not written, and it says so
  const miss = new Map<string, number>();
  for (const [rank, r] of rowsOf) {
    const x = hk.rank[rank];
    if (prov[rank] > 0) {
      if (m.cols.prov) fr.set(m.cols.prov + r, prov[rank]);
      else miss.set('prov', (miss.get('prov') || 0) + prov[rank]);
    }
    if (m.cols.placed) fr.set(m.cols.placed + r, x.n - x.attached);
    if (m.cols.attached) fr.set(m.cols.attached + r, x.attached);
    for (const k of HK_KEYS) {
      if (m.cols[k]) fr.set(m.cols[k] + r, x.c[k] || null);
      else if (x.c[k]) miss.set(k, (miss.get(k) || 0) + x.c[k]);
    }
    if (m.cols.ab && !fr.hasFormula(m.cols.ab + r)) fr.set(m.cols.ab + r, x.c.ab || null);
  }
  for (const [k, n] of miss)
    warnings.push(
      'Το template δεν έχει στήλη «' +
        (HK_COLS.find((x) => x[0] === k)?.[1] || 'Προβλέπονται') +
        '»: ' +
        n +
        ' δεν γράφτηκαν',
    );
  // "Προβλέπονται" in the rows of the totals: the form has no formula there, so the sum is written
  if (m.cols.prov && Object.values(prov).some((n) => n > 0)) {
    const pc = m.cols.prov;
    const sumOf = (list: string[]) => list.reduce((a, r) => a + (prov[r] || 0), 0);
    const vals = await wb.values(fr.name, 200, 8);
    const last = (list: string[]) => Math.max(...list.map((r) => m.rows[r] || 0));
    const tot = (r: number, n: number) => {
      if (r > 0 && (vals[r - 1] || []).slice(0, 4).some((v) => /ΣΥΝΟΛΟ/.test(norm(v ?? ''))) && !fr.hasFormula(pc + r))
        fr.set(pc + r, n || null);
    };
    tot(last(R.off) + 1, sumOf(R.off));
    tot(last(R.nco) + 1, sumOf(R.nco));
    tot(last(R.nco) + 2, sumOf(ALL));
  }
  // back side: each text at the place of its label
  const B = mapHkBack(await wb.values(bk.name, 400, 40), bk.merges(), place);
  const put = (ref: string | undefined, v: string | number | null, what: string) => {
    if (ref) bk.set(ref, v);
    else if (v != null && v !== '') warnings.push('Το template δεν έχει «' + what + '»: δεν γράφτηκε');
  };
  const tx = s.hkaiManual?.[d]?.text || {};
  if (tx.loi) put(B.loi, tx.loi, '6. ΛΟΙΠΑ');
  const off = hkOffText(s, d);
  if (off) put(B.off, off, 'Αξιωματικοί:');
  // guards of the day, decisions of the Commander, service organs
  const g = s.guards[d] || {};
  let night = 0,
    day24 = 0;
  for (const k in g) {
    const p = postBy(s, k);
    if (!p) continue;
    if (p.kind === 'th' || p.kind === 'sk' || p.kind === 'op') night++;
    else day24++;
  }
  if (hkOn(s.settings, 'grd')) {
    put(B.night, night || null, 'Νυκτοφρουρές');
    put(B.day24, day24 || null, '24ώρες');
  }
  // state of the vehicles (one row in the form) and accidents, when the squadron uses them
  const v = s.settings.hkai?.veh;
  if (hkOn(s.settings, 'veh') && v) {
    if (v.type) put(B.vType, v.type, 'Είδη οχημάτων');
    for (const [ref, x, w] of [
      [B.vProv, v.prov, 'Προβλέπονται'],
      [B.vKin, v.kin, 'Σε κίνηση'],
      [B.vMaint, v.maint, 'Για συντήρηση'],
      [B.vDmg, v.dmg, 'Λόγω βλάβης'],
    ] as const)
      put(ref, x ?? null, w + ' (οχήματα)');
  }
  if (hkOn(s.settings, 'acc'))
    for (const [k, ref, w] of [
      ['accT', B.accT, 'Ολικές'],
      ['accP', B.accP, 'Μερικές'],
      ['accM', B.accM, 'Σε άνδρες'],
    ] as const)
      if (tx[k]?.trim()) put(ref, tx[k].trim(), w + ' (ατυχήματα)');
  // 1. ΕΓΓΡΑΦΕΣ ... 5. ΑΙΤΗΣΕΙΣ: numbered ("1."), one per line, the duration of the penalty underlined
  const lines: [string | undefined, ReturnType<typeof hkaiEgrLines>, string][] = [
    [B.egr, hkaiEgrLines(s, d), '1. ΕΓΓΡΑΦΕΣ'],
    [B.dia, hkaiDiaLines(s, d), '2. ΔΙΑΓΡΑΦΕΣ'],
    [B.leaves, hkaiLeaveLines(s, d), '3. ΑΔΕΙΕΣ'],
    [B.puns, hkaiPunLines(s, d), '4. ΠΟΙΝΕΣ'],
    [B.reqs, hkaiReqLines(s, d), '5. ΑΙΤΗΣΕΙΣ'],
  ];
  for (const [ref, ls, w] of lines)
    if (ls.length) {
      if (ref) await wb.setRich(bk, ref, ls);
      else warnings.push('Το template δεν έχει «' + w + ':»: ' + ls.length + ' δεν γράφτηκαν');
    }
  const og = hkOrgans(s, d);
  const ly = og.ly && pm.get(og.ly),
    dy = og.dy && pm.get(og.dy);
  if (ly) put(B.ly, 'Λ/Υ: ' + who(ly), 'Υπαξιωματικοί:');
  if (dy) put(B.dy, 'Δ/Υ: ' + who(dy), 'Υπαξιωματικοί:');
  if (B.date && (bk !== fr || B.date !== m.date)) bk.set(B.date, place + ', ' + hkDate(d));
  const t = /^([A-Z]+)(\d+)$/.exec(m.title);
  const hr = t && Number(t[2]) >= 3 ? [t[1] + (Number(t[2]) - 3), t[1] + (Number(t[2]) - 2)] : [];
  const front: SheetPart = {
    ws: fr,
    key: 'front',
    more: [blockOf(fr, 'head', hr), blockOf(fr, 'date', m.date ? [m.date] : [])],
  };
  const layout = await signSheets(
    wb,
    fr === bk ? [front] : [front, { ws: bk, key: 'back', more: [blockOf(bk, 'date', B.date ? [B.date] : [])] }],
    s,
    'hkai',
    opts.sigs,
    warnings,
  );
  return {
    name: reportOf(s.settings) + ' ' + dmyy(d).replace(/\//g, '.') + '.xlsx',
    data: await wb.save(),
    warnings,
    layout,
    sheet: frName,
  };
}
