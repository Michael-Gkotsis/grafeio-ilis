// 4 επιλογές για λίστες ΑΛΛΗΣ μονάδας (26/11, φάση 4). Συνθετικά δεδομένα μόνο.
//  1. αδειούχοι: άδεια και τιμητική, όχι εκκρεμείς, όχι όποιος γυρίζει πριν αρχίσουν οι υπηρεσίες
//  2. ανενεργή υπηρεσία χωρίς «Να μένει στο έντυπο»: το μπλοκ της βγαίνει από το έντυπο της μονάδας
//  3. μορφή ονόματος «ΕΠΩΝΥΜΟ Α.» (προαιρετική, lst.name)
//  4. η στήλη που διάλεξε ο χρήστης ξαναβρίσκεται από την επικεφαλίδα της (lst.heads) όταν το αρχείο αλλάξει
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { fullName, type AppState, type Status } from '../src/shared/domain';
import { upper } from '../src/shared/text';
import { sanitizeProfiles, type TplProfile } from '../src/shared/tplStore';
import { listProfileFrom } from '../src/shared/listMap';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill } from '../src/main/tplLists';
import { outsRowsOf, svcKeyOf, detectSvc, nameOf } from '../src/shared/unitLists';
import { fakeState } from './fixtures';

const D = '2026-11-16';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'e' + ++seq };
const prof = (kind: TplProfile['kind'], lst: TplProfile['lst']): TplProfile => ({ v: 1, id: kind + '-1', kind, fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst });
const txt = (v: unknown) => (v == null ? '' : String(v));
const save = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());
const st = (id: string, pid: number, type: Status['type'], extra: Partial<Status> = {}): Status => ({ id, pid, type, from: D, to: D, ...extra } as Status);
const short = (p: { last: string; first: string }) => upper(p.last + ' ' + p.first.charAt(0) + '.');

describe('1. αδειούχοι: άδεια + τιμητική', () => {
  it('μπαίνουν LEAVE και HON, όχι εκκρεμείς, όχι όποιος γυρίζει πριν τις υπηρεσίες· μία γραμμή το άτομο, με τη σειρά του Δυναμολογίου', () => {
    let s = fakeState(20);
    s = { ...s, statuses: [
      st('a', 3, 'LEAVE'), st('b', 1, 'HON'), st('c', 5, 'LEAVE', { pending: true }),
      st('d', 7, 'LEAVE', { fromTime: '08:00', toTime: '05:00' }),          // γυρίζει πριν αρχίσουν οι υπηρεσίες
      st('e', 9, 'LEAVE', { toTime: '23:00' }),                              // γυρίζει το βράδυ: είναι ακόμα σε άδεια
      st('f', 3, 'HON')                                                      // ίδιο άτομο δεύτερη φορά
    ] };
    const r = outsRowsOf(s, D, []);
    expect(r.leaves.map(x => x.p.id)).toEqual([1, 3, 9]);
  });
});

async function svcBook(extraCol = 0): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ΥΠΗΡΕΣΙΕΣ');
  ws.getCell('A1').value = 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ';
  ws.getCell('B3').value = 'Α/Α'; ws.getCell('C3').value = 'ΒΑΘΜΟΣ'; ws.getCell(3, 4 + extraCol).value = 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ';
  const block = (r0: number, label: string, n: number) => { ws.getCell(r0 + 1, 1).value = label; for (let i = 1; i <= n; i++) { ws.getCell(r0 + i, 2).value = i + 'ο'; ws.getCell(r0 + i, 3).value = 'ΣΤΡ'; } };
  block(4, 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 4); block(9, 'ΜΑΓΕΙΡΕΙΑ', 5); block(15, 'ΚΑΜΙΝΟΣ', 3);
  ws.getCell('A22').value = 'Ο'; ws.getCell('A23').value = 'ΑΛΧΙΑΣ ΙΛΗΣ';
  return save(wb);
}
const withBlocks = (ids: string[]) => { let s = fakeState(60); s = { ...s, settings: { ...s.settings, blocks: (s.settings.blocks || []).filter(b => ids.includes(b.id)) } as never }; return apply(s, { t: 'autofill', date: D }, ctx).state; };
const hide = (s: AppState, id: string, patch: object): AppState => apply(s, { t: 'setBlock', phase: s.settings.phase, id, patch } as never, ctx).state;
const labels = async (data: Buffer) => (await modelOfBuffer(data))[0].rows.map(r => txt(r?.[0]));

describe('2. ανενεργή υπηρεσία: το μπλοκ βγαίνει από το έντυπο της μονάδας', () => {
  it('ανενεργή χωρίς «Να μένει»: βγαίνει (με όνομα και με επιλογή του χρήστη)', async () => {
    const buf = await svcBook();
    const s = hide(withBlocks(['ly', 'th', 'mg']), 'mg', { hidden: true });
    const out = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ' }) });
    const ls = await labels(out!.data);
    expect(ls).not.toContain('ΜΑΓΕΙΡΕΙΑ'); expect(ls).toContain('ΘΑΛΑΜΟΦΥΛΑΚΕΣ');
    const keys = detectSvc((await modelOfBuffer(buf))[0])!.blocks.map(svcKeyOf);
    const mgKey = keys.find(k => k.startsWith('ΜΑΓΕΙΡΕΙΑ'))!;
    const out2 = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts: { [mgKey]: 'blk:mg' } }) });
    expect(await labels(out2!.data)).not.toContain('ΜΑΓΕΙΡΕΙΑ');
  });
  it('ανενεργή με «Να μένει», ενεργή, ή μπλοκ με show keep: μένει', async () => {
    const buf = await svcBook();
    const keep = hide(withBlocks(['ly', 'th', 'mg']), 'mg', { hidden: true, keep: true });
    expect(await labels((await listsFill(buf, keep, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ' }) }))!.data)).toContain('ΜΑΓΕΙΡΕΙΑ');
    const active = withBlocks(['ly', 'th', 'mg']);
    expect(await labels((await listsFill(buf, active, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ' }) }))!.data)).toContain('ΜΑΓΕΙΡΕΙΑ');
    const hid = hide(active, 'mg', { hidden: true });
    const mgKey = detectSvc((await modelOfBuffer(buf))[0])!.blocks.map(svcKeyOf).find(k => k.startsWith('ΜΑΓΕΙΡΕΙΑ'))!;
    const o = await listsFill(buf, hid, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', show: { [mgKey]: 'keep' } }) });
    expect(await labels(o!.data)).toContain('ΜΑΓΕΙΡΕΙΑ');
  });
});

async function outsBook(extraCol = 0): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ΕΞΟΔΟΥΧΟΙ');
  ws.getCell('A1').value = 'ΚΑΤΑΣΤΑΣΗ ΕΞΟΔΟΥΧΩΝ ΤΗΣ'; ws.getCell('A3').value = 'ΕΞΟΔΟΥΧΟΙ';
  ws.getCell('A4').value = 'Α/Α'; ws.getCell('B4').value = 'ΒΑΘΜΟΣ'; ws.getCell(4, 3 + extraCol).value = 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ';
  for (let r = 5; r <= 12; r++) ws.getCell(r, 1).value = r - 4;
  ws.getCell('A20').value = 'Ο'; ws.getCell('A21').value = 'ΑΛΧΙΑΣ ΙΛΗΣ';
  return save(wb);
}
const outsState = () => { let s = fakeState(20); s = apply(s, { t: 'outs', date: D, changes: [1, 2, 3].map(pid => ({ pid, from: null, to: 'OUT' })) } as never, ctx).state; return s; };

describe('3. μορφή ονόματος «ΕΠΩΝΥΜΟ Α.»', () => {
  it('nameOf: χωρίς πεδίο = πλήρες, short = επώνυμο και αρχικό χωρίς πατρώνυμο', () => {
    const p = fakeState(3).people[1];
    expect(nameOf(p)).toBe(fullName(p)); expect(nameOf(p, 'short')).toBe(p.last + ' ' + p.first.charAt(0) + '.');
  });
  it('υπηρεσίες: short γράφεται στη στήλη ονόματος, χωρίς πεδίο το πλήρες', async () => {
    const buf = await svcBook(); const s = withBlocks(['ly', 'th', 'mg']);
    const run = async (name?: 'short') => { const o = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', ...(name ? { name } : {}) }) }); return (await modelOfBuffer(o!.data))[0].rows.map(r => txt(r?.[3])).filter(Boolean); };
    const sh = await run('short'); const full = await run();
    expect(sh.length).toBeGreaterThan(2);
    const shorts = new Set(s.people.map(short)); const fulls = new Set(s.people.map(p => upper(fullName(p))));
    expect(sh.filter(v => v !== 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').every(v => shorts.has(v))).toBe(true);
    expect(full.filter(v => v !== 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').every(v => fulls.has(v))).toBe(true);
  });
  it('εξοδούχοι: short στη στήλη ονόματος', async () => {
    const buf = await outsBook(); const s = outsState();
    const o = await listsFill(buf, s, D, { kind: 'outs', profile: prof('outs', { sheet: 'ΕΞΟΔΟΥΧΟΙ', name: 'short' }) });
    const names = (await modelOfBuffer(o!.data))[0].rows.map(r => txt(r?.[2])).slice(4, 12).filter(Boolean);
    expect(names).toEqual([1, 2, 3].map(id => short(s.people.find(p => p.id === id)!)));
  });
});

describe('4. η επικεφαλίδα της στήλης που διάλεξε ο χρήστης', () => {
  it('υπηρεσίες: μπήκε κενή στήλη πριν το όνομα: τα ονόματα μένουν κάτω από την ίδια επικεφαλίδα', async () => {
    const buf = await svcBook(1); const s = withBlocks(['ly', 'th', 'mg']);
    const col = async (p: TplProfile['lst']) => { const o = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', p) }); const sh = (await modelOfBuffer(o!.data))[0]; return { d: sh.rows.filter((r, i) => i > 3 && txt(r?.[3])).length, e: sh.rows.filter((r, i) => i > 3 && txt(r?.[4])).length, w: o!.warnings }; };
    const withHead = await col({ sheet: 'ΥΠΗΡΕΣΙΕΣ', cols: { name: 3 }, heads: { name: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' } });
    expect(withHead.e).toBeGreaterThan(2); expect(withHead.d).toBe(0);
    const old = await col({ sheet: 'ΥΠΗΡΕΣΙΕΣ', cols: { name: 3 } });             // παλιό προφίλ: όπως πριν
    expect(old.d).toBeGreaterThan(2); expect(old.e).toBe(0);
  });
  it('υπηρεσίες: η επικεφαλίδα δεν βρίσκεται πουθενά: μένει η στήλη και βγαίνει προειδοποίηση', async () => {
    const buf = await svcBook(); const s = withBlocks(['ly', 'th', 'mg']);
    const o = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', cols: { name: 3 }, heads: { name: 'ΑΛΛΟ ΟΝΟΜΑ' } }) });
    expect(o!.warnings.some(w => /μετακινήθηκε/.test(w))).toBe(true);
    expect((await modelOfBuffer(o!.data))[0].rows.some((r, i) => i > 3 && txt(r?.[3]))).toBe(true);
  });
  it('εξοδούχοι: το ίδιο με το κλειδί o.name', async () => {
    const buf = await outsBook(1); const s = outsState();
    const o = await listsFill(buf, s, D, { kind: 'outs', profile: prof('outs', { sheet: 'ΕΞΟΔΟΥΧΟΙ', cols: { 'o.name': 2 }, heads: { 'o.name': 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' } }) });
    const rows = (await modelOfBuffer(o!.data))[0].rows;
    expect(rows.slice(4, 12).filter(r => txt(r?.[3])).length).toBe(3); expect(rows.slice(4, 12).filter(r => txt(r?.[2])).length).toBe(0);
  });
});

describe('cleanLst: τα νέα πεδία', () => {
  it('κρατιούνται, με έλεγχο τύπων· χωρίς αυτά το προφίλ μένει όπως ήταν', () => {
    const p = listProfileFrom('services', { prev: null, sheet: 'Φ', cols: { name: 3 }, name: 'short', heads: { name: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' } });
    const back = sanitizeProfiles(JSON.parse(JSON.stringify([p])))[0];
    expect(back.lst).toEqual({ sheet: 'Φ', cols: { name: 3 }, name: 'short', heads: { name: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' } });
    const bad = sanitizeProfiles([{ ...p, lst: { sheet: 'Φ', name: 'long', heads: { a: 1, b: 'Χ' } } }])[0];
    expect(bad.lst).toEqual({ sheet: 'Φ', heads: { b: 'Χ' } });
    const old = sanitizeProfiles([prof('services', { sheet: 'Φ', cols: { name: 3 } })])[0];
    expect(old.lst).toEqual({ sheet: 'Φ', cols: { name: 3 } });
  });
});
