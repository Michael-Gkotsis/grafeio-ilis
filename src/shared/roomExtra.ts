// E-mail, e-mail συγγενή και ομάδα αίματος στο φύλλο ΘΑΛΑΜΟΙ του Δυναμολογίου (Michael, 3/11). Οι στήλες βρίσκονται από την
// επικεφαλίδα κάθε πίνακα θαλάμου (όχι από θέση)· αν δεν υπάρχει στήλη, δεν προστίθεται ούτε διαβάζεται τίποτα.
// Η στήλη «Νούμερο παραλλαγής» δεν ακουμπιέται ποτέ.
import { norm } from '../core/lib/text';
import type { ImportRow } from './commands';
import type { Person } from '../core/model/person';
import type { RawSheet } from './roster';
import { cellText, makeMatcher, roomBlocks, type TableRow, type WVal } from './sources';
import { XKEYS, normExtra, type XKey } from './personal';

// Ελληνικά γράμματα που μοιάζουν με λατινικά → λατινικά, ώστε το «Ε-mail» με ελληνικό Ε να βρίσκεται κι αυτό
const LAT: Record<string, string> = { Ε: 'E', Μ: 'M', Α: 'A', Ι: 'I', Ο: 'O', Τ: 'T' };
export function extraOf(head: unknown): XKey | null {
  const h = norm(head)
    .replace(/[^A-ZΑ-Ω]/g, '')
    .split('')
    .map((c) => LAT[c] || c)
    .join('');
  if (/^EMAIL/.test(h)) return /ΣΥΓΓ|ΠΡ.ΣΩΠ/.test(h) ? 'relEmail' : h === 'EMAIL' ? 'email' : null;
  return /AIMATO[ΣS]$/.test(h) ? 'blood' : null;
}
interface Blk {
  rows: TableRow[];
  cols: Partial<Record<XKey, number>>;
}
function blocks(sheet: RawSheet): Blk[] {
  return roomBlocks(sheet)
    .map((bl) => {
      const cols: Partial<Record<XKey, number>> = {};
      (sheet.rows[bl.header] || []).forEach((h, c) => {
        const k = extraOf(h);
        if (k && cols[k] == null) cols[k] = c;
      });
      return { rows: bl.rows, cols };
    })
    .filter((b) => XKEYS.some((k) => b.cols[k] != null));
}
export const isRoomSheet = (name: string, main: string) => name !== main && /ΘΑΛΑΜ/.test(norm(name));

type Snaps = Record<number, Record<string, string>> | undefined;
// Εισαγωγή: οι τιμές των στηλών του φύλλου ΘΑΛΑΜΟΙ μπαίνουν στις γραμμές του ΣΥΝΟΛΙΚΟ. Κανόνας (βάση = η τιμή στον τελευταίο συγχρονισμό):
// αν η εφαρμογή άλλαξε από τη βάση, μένει η τιμή της εφαρμογής· αλλιώς περνά η τιμή του Excel (κενό = χωρίς τιμή).
// Χωρίς βάση περνά μόνο μη κενή τιμή του Excel. Όποιος δεν είναι στο φύλλο ΘΑΛΑΜΟΙ, ή δεν έχει στήλη, μένει όπως είναι.
export function withRoomExtras(
  rows: ImportRow[],
  sheets: RawSheet[],
  main: string,
  app: Person[] = [],
  psnap?: Snaps,
): ImportRow[] {
  const sh = sheets.find((x) => isRoomSheet(x.name, main));
  if (!sh) return rows;
  const bl = blocks(sh);
  if (!bl.length) return rows;
  const fake = rows.map(
    (r, i) => ({ id: i + 1, active: true, post: null, attached: false, notes: '', ...r }) as unknown as Person,
  );
  const match = makeMatcher(fake);
  const mApp = makeMatcher(app);
  const got = new Map<number, Partial<Record<XKey, string>>>();
  for (const b of bl)
    for (const x of b.rows) {
      const m = match(x.v);
      if (m.pid == null) continue;
      const row = rows[m.pid - 1];
      const ap = mApp(row as unknown as Record<string, never>);
      const cur = app.find((p) => p.id === ap.pid);
      const out = got.get(m.pid) || {};
      for (const k of XKEYS) {
        const c = b.cols[k];
        if (c == null) continue;
        const xl = normExtra(k, cellText((sh.rows[x.r] || [])[c]));
        const base = cur ? psnap?.[cur.id]?.[k] : undefined;
        const mine = cur?.[k] || '';
        const take = !cur ? true : base !== undefined ? mine === base : !!xl;
        if (take) out[k] = xl;
      }
      got.set(m.pid, out);
    }
  return rows.map((r, i) => (got.has(i + 1) ? { ...r, ...got.get(i + 1) } : r));
}

// Εγγραφή: γράφεται κελί μόνο αν (α) είναι κενό και η εφαρμογή έχει τιμή, ή (β) η εφαρμογή άλλαξε από τη βάση (και κενό, αν η βάση είχε τιμή).
// Μη κενό κελί χωρίς βάση δεν πειράζεται ποτέ· αλλαγή στο Excel μετά τον συγχρονισμό δεν γράφεται πάνω (την παίρνει η εισαγωγή).
// Δεν γράφεται πάνω σε τύπο.
export function planRoomExtras(sheet: RawSheet, people: Person[], psnap?: Snaps): { r: number; c: number; v: WVal }[] {
  const out: { r: number; c: number; v: WVal }[] = [];
  const bl = blocks(sheet);
  if (!bl.length) return out;
  const match = makeMatcher(people.filter((p) => p.active));
  const pm = new Map(people.map((p) => [p.id, p]));
  for (const b of bl)
    for (const x of b.rows) {
      const m = match(x.v);
      const p = m.pid == null ? undefined : pm.get(m.pid);
      if (!p) continue;
      for (const k of XKEYS) {
        const c = b.cols[k];
        if (c == null || sheet.fx?.has(x.r + ':' + c)) continue;
        const want = p[k] || '';
        const cur = normExtra(k, cellText((sheet.rows[x.r] || [])[c]));
        if (cur === want) continue;
        const base = psnap?.[p.id]?.[k];
        if ((!cur && want) || (cur && base !== undefined && want !== base)) out.push({ r: x.r, c, v: want || null });
      }
    }
  return out;
}
