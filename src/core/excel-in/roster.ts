// Reading the roster «Δυναμολόγιο» (sample 12): finds the columns from the headers, not from cell positions, so it
// keeps working when the sergeant adds or moves a column.
//
// Purpose: `parseRoster` (sheets -> `ImportRow`s + warnings), `RawSheet`, `RosterResult`, the user's column choice
//   (`RosterOverride`) and `isDnSheet`. The column rules (`HEADERS`, `DN_HEAD`, `isPersonRow`, `essosOf`…) live in
//   rosterColumns.ts and are re-exported here.
// Does NOT: open any file (src/main/excel.ts hands over the sheets), save the people (the `importPeople` command in
//   src/shared/commands.ts does) or write the Excel back (core/excel-in/totals.ts only plans the numbers).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model, core/people.
// Why: the sergeant's file is the source of truth for names, ranks, rooms, posts and the ΔΝ right; one reader keeps
//   the import, the sync with the file and the preview on the same rules. `OV` is module state (set and reset inside
//   `parseRoster`) because `headerOf` is called from deep inside the readers.
// Covering tests: test/roster-sync.test.ts, test/column-heads.test.ts, test/origin.test.ts, test/esso.test.ts,
//   test/personal-excel.test.ts.
import { norm, normGreek } from '../lib/text';
import { OUT_NOTE } from '../model/person';
import type { ImportRow } from '../model/importRow';
import { withOrigin, type UserLists } from '../people/ranks';
import { PKEYS, personalFromCell, type PKey } from '../people/personal';
import type { CellValue } from '../model/cells';
import { DN_WORD, HEADERS, essosOf, isDnYes, isPersonRow, stripDn, type Field } from './rosterColumns';

export type { CellValue };
export { DN_HEAD, DN_WORD, HEADERS, essosOf, isDnYes, isPersonRow, stripDn } from './rosterColumns';
export type { Field } from './rosterColumns';
/**
 * One sheet as the Excel reader hands it over. `fx`: cells with a formula («row:column», counted from 0);
 * `countif`: cells with a COUNTIF of a bare letter (e.g. «L3»).
 */
export interface RawSheet {
  name: string;
  rows: CellValue[][];
  fx?: Set<string>;
  countif?: string[];
}
/** What `parseRoster` found: the rows to import and everything the office should be told before importing. */
export interface RosterResult {
  rows: ImportRow[];
  warnings: string[];
  main: string;
  essos: string;
  skipped: string[]; // lines ignored because they are not people (ΣΥΝΟΛΟ, 1ΟΣ…)
  declared: number | null; // the «ΣΥΝΟΛΟ» that the sheet itself states
  found: number; // people found in the main sheet
  suspicious: string[]; // passed, but have no ΑΣΜ, no phone and no room
}

const txt = (v: CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
};
const up = (v: CellValue) => norm(txt(v));

/** The mapping the user chose (Αρχεία Excel): sheet, header row and columns, instead of the automatic one. */
export interface RosterOverride {
  sheet: string;
  header: number;
  cols: Partial<Record<Field, number>>;
}
/** The user's choice for the three sheets. */
export interface RosterOverrides {
  main?: RosterOverride;
  posts?: RosterOverride;
  outside?: RosterOverride;
}
let OV: RosterOverride[] = [];
function headerOf(sheet: RawSheet): { row: number; cols: Partial<Record<Field, number>> } | null {
  const ov = OV.find((o) => o.sheet === sheet.name);
  if (ov) return { row: ov.header, cols: ov.cols };
  for (let r = 0; r < Math.min(sheet.rows.length, 12); r++) {
    const cols: Partial<Record<Field, number>> = {};
    (sheet.rows[r] || []).forEach((v, c) => {
      const h = up(v);
      if (!h) return;
      const f = HEADERS.find(([, re]) => re.test(h));
      if (f && cols[f[0]] == null) cols[f[0]] = c;
    });
    if (cols.last != null && cols.first != null) return { row: r, cols };
  }
  return null;
}

type Rec = {
  rank: string;
  origin: string | null;
  spec: string;
  last: string;
  first: string;
  father: string;
  asm: string;
  phone: string;
  room: number | null;
  si: string;
  remarks: string;
  post: string;
  dn: boolean | null;
} & { [K in PKey]: string | null };
function records(sheet: RawSheet, skipped: string[] = []): Rec[] {
  const h = headerOf(sheet);
  if (!h) return [];
  const get = (row: CellValue[], f: Field) => (h.cols[f] == null ? '' : txt(row[h.cols[f]!]));
  const pv = (row: CellValue[], k: PKey) => (h.cols[k] == null ? null : personalFromCell(k, get(row, k))); // null = the table has no such column
  const out: Rec[] = [];
  for (const row of sheet.rows.slice(h.row + 1)) {
    if (!row) continue;
    const last = get(row, 'last'),
      first = get(row, 'first');
    if (!last && !first) continue;
    if (!last || !first || !isPersonRow(last, first, get(row, 'father'))) {
      skipped.push(norm(last || first));
      continue;
    }
    const roomN = parseInt(get(row, 'room'), 10);
    out.push({
      // rank, Ο/Σ and Σ.Ι. with look-alike Latin letters (I4, AOΠΛΟ) are written in Greek; the names stay as they were
      // so that they match the existing people
      rank: normGreek(get(row, 'rank')),
      origin: h.cols.origin == null ? null : normGreek(get(row, 'origin')),
      spec: normGreek(get(row, 'spec')),
      last: norm(last),
      first: norm(first),
      father: norm(get(row, 'father')),
      asm: get(row, 'asm').replace(/\s/g, ''),
      phone: get(row, 'phone').replace(/\s/g, ''),
      room: Number.isFinite(roomN) && roomN > 0 ? roomN : null,
      si: normGreek(get(row, 'si')),
      remarks: get(row, 'remarks'),
      post: norm(get(row, 'post')),
      dn: h.cols.dn == null ? null : isDnYes(get(row, 'dn')),
      iban: pv(row, 'iban'),
      amka: pv(row, 'amka'),
      afm: pv(row, 'afm'),
    });
  }
  return out;
}
const keyOf = (r: { last: string; first: string; father: string }) => r.last + '|' + r.first + '|' + r.father;
const key2 = (r: { last: string; first: string }) => r.last + '|' + r.first;
// The post of each person from the sheet ΠΟΣΤΑ: by ΑΣΜ, else by full name + father's name, else by full name if it is
// unique in both sheets (ΠΟΣΤΑ often has no father's-name column)
function postJoin(list: Rec[]): (r: Rec, all: Rec[]) => string | null {
  const byAsm = new Map<string, Rec>(),
    byKey = new Map<string, Rec>(),
    by2 = new Map<string, Rec[]>();
  for (const x of list) {
    if (x.asm && !byAsm.has(x.asm)) byAsm.set(x.asm, x);
    if (x.father && !byKey.has(keyOf(x))) byKey.set(keyOf(x), x);
    by2.set(key2(x), [...(by2.get(key2(x)) || []), x]);
  }
  let count: Map<string, number> | null = null;
  // a different ΑΣΜ in the two sheets = a different person, whatever the name says
  const ok = (x: Rec | undefined, r: Rec) => !!x && !(x.asm && r.asm && x.asm !== r.asm);
  return (r, all) => {
    if (r.asm && byAsm.has(r.asm)) return byAsm.get(r.asm)!.post;
    const k = byKey.get(keyOf(r));
    if (ok(k, r)) return k!.post;
    const l = by2.get(key2(r));
    if (!l || l.length !== 1 || !ok(l[0], r) || (l[0].father && r.father)) return null;
    if (!count) {
      count = new Map();
      for (const x of all) count.set(key2(x), (count.get(key2(x)) || 0) + 1);
    }
    return count.get(key2(r)) === 1 ? l[0].post : null;
  };
}

/**
 * Reads the roster sheets into import rows.
 * `lists`: the Λίστες of the Ρυθμίσεις, so that the user's own origins are produced from the rank too.
 * `OV` is set for the duration of the call and always reset, also when parsing throws.
 * @see test/roster-sync.test.ts
 */
export function parseRoster(sheets: RawSheet[], ov: RosterOverrides = {}, lists?: UserLists): RosterResult {
  OV = [ov.main, ov.posts, ov.outside].filter(
    (o): o is RosterOverride => !!o && sheets.some((s) => s.name === o.sheet),
  );
  try {
    return parse(sheets, ov, lists);
  } finally {
    OV = [];
  }
}
function parse(sheets: RawSheet[], ov: RosterOverrides, lists?: UserLists): RosterResult {
  const warnings: string[] = [];
  const named = (o?: RosterOverride) => (o ? sheets.find((s) => s.name === o.sheet) : undefined);
  const byName = (re: RegExp) => sheets.find((s) => re.test(norm(s.name)));
  const main =
    named(ov.main) ||
    byName(/^ΣΥΝΟΛΙΚΟ/) ||
    sheets.find((s) => headerOf(s) && !/ΠΟΣΤΑ|ΕΚΤΟΣ|ΑΔΕΙΕΣ|ΤΙΜΩΡ|IATR|ΙΑΤΡ/.test(norm(s.name)));
  if (!main)
    return {
      rows: [],
      warnings: ['Δεν βρέθηκε φύλλο με στήλες «Επώνυμο» και «Όνομα».'],
      main: '',
      essos: '',
      skipped: [],
      declared: null,
      found: 0,
      suspicious: [],
    };
  const essos = essosOf(txt((main.rows[0] || [])[0]));
  const postSheet = named(ov.posts) || byName(/^ΠΟΣΤΑ/);
  const postOf = postSheet ? postJoin(records(postSheet).filter((r) => r.post)) : null;
  const out = new Map<string, Rec>();
  const skipped: string[] = [];
  let recs = records(main, skipped);
  // If almost everyone has a rank, those without one are note lines, not people
  const withRank = recs.filter((r) => r.rank).length;
  // (those with an ΑΣΜ, phone or room are people whose rank was just not written: they pass as ΣΤΡ)
  if (withRank >= recs.length * 0.8) {
    const note = (r: Rec) => !r.rank && !r.asm && !r.phone && r.room == null;
    const drop = recs.filter(note),
      kept = recs.length - withRank - drop.length;
    if (drop.length) warnings.push(drop.length + ' γραμμές χωρίς βαθμό αγνοήθηκαν (δεν μοιάζουν με άτομα)');
    if (kept) warnings.push(kept + ' άτομα χωρίς βαθμό πέρασαν ως ΣΤΡ (έχουν ΑΣΜ, τηλέφωνο ή θάλαμο).');
    drop.forEach((r) => skipped.push(r.last + ' ' + r.first));
    recs = recs.filter((r) => !note(r));
  }
  for (const r of recs) {
    const k = r.asm ? '#' + r.asm : keyOf(r);
    if (out.has(k)) {
      warnings.push('Διπλή εγγραφή: ' + r.last + ' ' + r.first + ' (κρατήθηκε η πρώτη)');
      continue;
    }
    out.set(k, r);
  }
  // A sheet «ΔΝ» / «ΔΙΚΑΙΟΥΧΟΙ ΔΝ» without dates: those listed there have the ΔΝ right, the others do not.
  // (With «ΑΠΟ/ΕΩΣ» they are overnight stays and are read by the Αρχεία Excel as the kind «ΔΝ».)
  const dnSheet = sheets.find((sh) => sh !== main && isDnSheet(sh));
  const dnList = new Set<string>();
  if (dnSheet)
    for (const r of records(dnSheet)) {
      dnList.add(keyOf(r));
      if (r.asm) dnList.add('#' + r.asm);
    }
  const dnCol = recs.some((r) => r.dn != null);
  const outside = named(ov.outside) || byName(/^ΕΚΤΟΣ/);
  const inactive = new Map<string, string>();
  if (outside)
    for (const r of records(outside)) {
      inactive.set(r.asm ? '#' + r.asm : keyOf(r), r.remarks);
      if (!out.has(r.asm ? '#' + r.asm : keyOf(r))) out.set(r.asm ? '#' + r.asm : keyOf(r), r);
    }
  const all = [...out.values()];
  const rows: ImportRow[] = [...out.entries()].map(([k, r]) => {
    const off = inactive.has(k);
    // In the ΣΥΝΟΛΙΚΟ the «ΠΑΡΑΤΗΡΗΣΕΙΣ» are roles (ΘΑΛΑΜΑΡΧΗΣ, ΓΡΑΦΕΑΣ…); the word ΔΝ there means the ΔΝ right.
    // The reason for those out of strength is the remarks of the sheet «ΕΚΤΟΣ ΔΥΝΑΜΗΣ», not the role of the ΣΥΝΟΛΙΚΟ
    const dnWord = !off && DN_WORD.test(norm(r.remarks));
    const role = !off && r.remarks ? stripDn(r.remarks) || null : null;
    // origin: from the column «ΠΡΟΕΛΕΥΣΗ» if there is one (empty = none), else from the rank («ΕΠΟΠ ΛΧΙΑΣ»); if the
    // file says nothing, whatever you set in the app stays
    const ro = withOrigin({ rank: r.rank || 'ΣΤΡ', origin: r.origin || undefined }, lists);
    const row: ImportRow = {
      rank: ro.rank || 'ΣΤΡ',
      ...(ro.origin || r.origin != null ? { origin: ro.origin || '' } : {}),
      spec: r.spec,
      last: r.last,
      first: r.first,
      father: r.father,
      asm: r.asm,
      phone: r.phone,
      room: r.room,
      si: r.si,
      role,
      essos,
    };
    // Post, attached and notes only when the file writes them: otherwise whatever the app has stays (e.g. posts from
    // another file). Those missing from the sheet ΠΟΣΤΑ lose their post.
    // IBAN, ΑΜΚΑ, ΑΦΜ: only those with a column in the file (empty cell = none)
    for (const k of PKEYS) if (r[k] != null) row[k] = r[k]!;
    if (postOf) row.post = postOf(r, all);
    if (off) row.notes = OUT_NOTE + (inactive.get(k) ? ': ' + inactive.get(k) : '');
    // with a sheet ΕΚΤΟΣ in the file we know who is in strength; without it the import decides (commands.ts)
    if (outside) row.active = !off;
    // only when the file says something about ΔΝ; otherwise whatever is set in the app stays
    if (dnSheet || dnCol) row.dn = !!r.dn || dnWord || dnList.has('#' + r.asm) || dnList.has(keyOf(r));
    else if (dnWord) row.dn = true;
    return row;
  });
  const nDn = rows.filter((r) => r.active !== false && r.dn).length;
  if (nDn)
    warnings.push(
      nDn +
        ' άτομα με δικαίωμα ΔΝ' +
        (dnSheet ? ' (φύλλο «' + dnSheet.name + '»)' : dnCol ? ' (στήλη ΔΝ)' : ' (παρατηρήσεις)') +
        '.',
    );
  const noRoom = rows.filter((r) => r.active !== false && r.room == null).length;
  if (noRoom) warnings.push(noRoom + ' άτομα χωρίς θάλαμο: δεν θα μπαίνουν στην πρόταση εξόδου ανά θάλαμο.');
  const noAsm = rows.filter((r) => !r.asm).length;
  if (noAsm) warnings.push(noAsm + ' άτομα χωρίς ΑΣΜ: ταιριάζουν μόνο με ονοματεπώνυμο και πατρώνυμο.');
  // Second safety net: the sheet writes its own «ΣΥΝΟΛΟ». If it does not agree with what we found, say so before the import.
  const declared = declaredTotal(main);
  const found = recs.length;
  if (declared != null && declared !== found)
    warnings.unshift(
      'Το Δυναμολόγιο γράφει ΣΥΝΟΛΟ ' +
        declared +
        ', αλλά βρέθηκαν ' +
        found +
        ' άτομα στο φύλλο ' +
        main.name +
        '. Έλεγξε τη λίστα πριν την εισαγωγή.',
    );
  const suspicious = rows
    .filter((r) => r.active !== false && !r.asm && !r.phone && r.room == null)
    .map((r) => r.last + ' ' + r.first);
  return { rows, warnings, main: main.name, essos, skipped, declared, found, suspicious };
}
/**
 * Is this sheet a list of people with the ΔΝ right? A sheet with the columns ΑΠΟ/ΕΩΣ/ΗΜΕΡΟΜΗΝΙΑ is not: its dates are
 * overnight stays, read by the Αρχεία Excel.
 */
export function isDnSheet(sh: RawSheet): boolean {
  if (!/^Δ\s?\.?\s?[ΝN](?![Α-ΩA-Z])|ΔΙΚΑΙΟΥΧΟΙ\s*Δ\s?\.?\s?[ΝN]|ΔΙΑΝΥΚΤΕΡΕΥΣ/.test(norm(sh.name))) return false;
  const h = headerOf(sh);
  if (!h) return false;
  return !(sh.rows[h.row] || []).some((v) => /^(ΑΠΟ|ΕΩΣ|ΗΜΕΡΟΜΗΝΙΑ|ΗΜΕΡ\/ΝΙΑ)$/.test(up(v)));
}
function declaredTotal(sheet: RawSheet): number | null {
  for (const row of sheet.rows) {
    if (!row) continue;
    const i = row.findIndex((v) => /^ΣΥΝΟΛΟ( ΑΤΟΜΩΝ| ΔΥΝΑΜΗΣ)?:?$/.test(up(v)));
    if (i < 0) continue;
    for (const v of row.slice(i + 1)) {
      const t = txt(v);
      if (/^\d+$/.test(t)) return Number(t);
    }
  }
  return null;
}
