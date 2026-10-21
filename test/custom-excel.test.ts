// Ό,τι προσθέτει ο χρήστης στην εφαρμογή (δικά του είδη άδειας, νέες υπηρεσίες, θάλαμοι) γράφεται σωστά και στη σωστή
// θέση στα Excel (Michael, 18/10). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura } from '../src/main/exports';
import { dutyCheck } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { absenceOf } from '../src/shared/froura';
import { leaveName } from '../src/shared/hkaiText';
import { rosterSheets } from '../src/shared/rosterLists';
import { bestFor, capExtras, defaultBinding, dutiesBinding, dutyCols, planCaps, roomBlocks } from '../src/shared/sources';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'q' + ++seq };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-custom-'));
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));

// Ίλη με «Πύλη» (δική σου υπηρεσία, είδος «άλλη», κωδικοί Π1/Π2) και τρίτο πίνακα θαλαμοφυλάκων
function withGate(n = 20): { s: AppState; gate: string } {
  let s = fakeState(n);
  s = apply(s, { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 2, hrs: '24ωρη' }, ctx).state;
  s = apply(s, { t: 'addBlock', phase: 'sven', name: 'Θαλαμοφύλακες γ΄', kind: 'th', armed: false, n: 1, hrs: '' }, ctx).state;
  const gate = s.settings.blocks.find(b => b.name === 'Πύλη')!;
  s.settings.blocks = s.settings.blocks.map(b => (b.id === gate.id ? { ...b, posts: b.posts.map((p, i) => ({ ...p, code: 'Π' + (i + 1) })) } : b));
  return { s, gate: gate.id };
}

describe('δικά σου είδη άδειας', () => {
  it('στη ΦΡΟΥΡΑ και στο Excel του Δυναμολογίου: «ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ», όχι «ΑΙΜΟΔΟΣΙΑΣ ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ»', async () => {
    expect(absenceOf({ type: 'LEAVE', kind: 'Αιμοδοσίας' })).toBe('ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ');
    expect(absenceOf({ type: 'LEAVE', kind: 'Ειδική' })).toBe('ΕΙΔΙΚΗ ΑΔΕΙΑ');
    expect(absenceOf({ type: 'LEAVE', kind: 'ΑΔΕΙΑ ΓΑΜΟΥ' })).toBe('ΑΔΕΙΑ ΓΑΜΟΥ');
    expect(absenceOf({ type: 'LEAVE' })).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ');
    expect(absenceOf({ type: 'NOS', kind: '401 ΓΣΝΑ' })).toBe('401 ΓΣΝΑ ΕΙΣΑΓΩΓΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ');   // όπως πριν
    expect(leaveName({ type: 'LEAVE', kind: 'ΑΔΕΙΑ ΓΑΜΟΥ' })).toBe('ΑΔΕΙΑ ΓΑΜΟΥ');
    let s = fakeState(10); s.settings.lists = { leaveKinds: { add: [{ name: 'Αιμοδοσίας', col: 'eid' }] } };
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: '2026-10-10', to: '2026-10-14', kind: 'Αιμοδοσίας' } }, ctx).state;
    const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, D)).data)).sheet(0);
    expect(ws.get('J36')).toBe('ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ');
    expect(rosterSheets(s, D).find(x => x.name === 'ΑΔΕΙΕΣ')!.rows[0]).toContain('Άδεια Αιμοδοσίας');
  });
});

describe('νέες υπηρεσίες', () => {
  it('ΦΡΟΥΡΑ: πίνακας η καθεμία, δύο δίπλα δίπλα, τίτλος το όνομά της, ώρες μόνο αν έχει (Michael, 20/10)', async () => {
    let { s } = withGate(); s = apply(s, { t: 'autofill', date: D }, ctx).state;
    const r = await fillFroura(T('froura.xlsx'), s, D);
    const ws = await (await Workbook.open(r.data)).sheet(0);
    // μία κενή γραμμή κάτω από τα Μαγειρεία (31), μετά οι επικεφαλίδες
    expect(['B32', 'C32', 'I32', 'J32'].map(c => ws.get(c))).toEqual([null, null, null, null]);
    expect(['B33', 'C33', 'D33', 'E33'].map(c => ws.get(c))).toEqual(['Α/Α', 'ΠΥΛΗ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ']);
    expect(['B34', 'D34', 'B35', 'D35'].map(c => ws.get(c))).toEqual(['1Ο', '24ΩΡΗ', '2Ο', '24ΩΡΗ']);
    expect(ws.get('C34')).toBeTruthy();
    // «ημέρα» = χωρίς ώρες: χωρίς στήλη ΩΡΕΣ, το όνομα πιάνει και τη στήλη τους
    expect(['I33', 'J33', 'K33', 'L33'].map(c => ws.get(c))).toEqual(['Α/Α', 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ Γ΄', null, 'ΠΑΡ/ΣΕΙΣ']);
    expect(ws.mergeAt('J33')).toEqual({ c1: 10, r1: 33, c2: 11, r2: 33 });
    expect(ws.mergeAt('J34')).toEqual({ c1: 10, r1: 34, c2: 11, r2: 34 });
    expect(ws.get('I34')).toBe('1Ο'); expect(ws.get('I35')).toBeNull();
    // ίδιο πλαίσιο με τους θαλαμοφύλακες· οι τιμωρημένοι κατέβηκαν 4 γραμμές (κενή + επικεφαλίδα + 2)
    expect(ws.style('B34')).toBe(ws.style('B13')); expect(ws.style('J33')).toBe(ws.style('C13'));
    expect(ws.get('A38')).toBe('ΤΙΜΩΡΗΜΕΝΟΙ'); expect(ws.get('A40')).toBe('1');
  });

  it('Έλεγχος υπηρεσιών (νέος μήνας): στήλη ΠΥΛΗ μετά το Λ/Υ-Δ/Υ, και τα σύνολα μετρούν και τους κωδικούς Π1/Π2', async () => {
    const { s } = withGate(); s.guards = { '2026-10-05': { [s.settings.blocks.find(b => b.name === 'Πύλη')!.posts[0].k]: 1, th1: 2 } };
    expect(dutyCols().head.length).toBe(14);
    const dc = dutyCols(s.settings);
    expect(dc.head.slice(13)).toEqual(['Λ/Υ-Δ/Υ', 'ΠΥΛΗ']);
    expect(dc.any).toContain('Π1');
    expect(dc.count.find(([c]) => c === 11)![1]).toEqual(['Θ*']);   // ο γ΄ πίνακας (Θ…) μετρά ήδη στους θαλαμοφύλακες
    const file = path.join(tmp(), 'ΕΛΕΓΧΟΣ.xlsx'); const b = dutiesBinding(file, '2026-10', undefined, s.settings);
    expect(b.cols.d1).toBe(15);
    const w = await writeSource('duties', b, s, undefined, D, { create: true }); expect(w.ok, JSON.stringify(w)).toBe(true);
    const ws = await (await Workbook.open(fs.readFileSync(file))).sheet(0);
    expect([ws.get('N2'), ws.get('O2'), ws.get('P2')]).toEqual(['Λ/Υ-Δ/Υ', 'ΠΥΛΗ', '1']);
    expect(ws.formula('O3')?.replace(/&quot;/g, '"')).toBe('COUNTIF(P3:AT3,"Π1")+COUNTIF(P3:AT3,"Π2")');
    expect(ws.formula('I3')?.replace(/&quot;/g, '"')).toContain('"Π1","Π2"');
    expect(ws.get('T3')).toBe('Π1');   // 5 Οκτ = 5η στήλη ημέρας
    // ξαναδιαβάζεται ως έλεγχος υπηρεσιών, με την 1η του μήνα στη στήλη P
    const { sheets } = await readBook(file);
    expect(bestFor('duties', sheets)!.cols.d1).toBe(15);
    // χωρίς τις Ρυθμίσεις στην αντιστοίχιση (παλιό φύλλο): όπως το δείγμα, χωρίς στήλη ΠΥΛΗ
    const f2 = path.join(tmp(), 'Ε2.xlsx'); await writeSource('duties', dutiesBinding(f2, '2026-10'), s, undefined, D, { create: true });
    const w2 = await (await Workbook.open(fs.readFileSync(f2))).sheet(0);
    expect([w2.get('N2'), w2.get('O2')]).toEqual(['Λ/Υ-Δ/Υ', '1']);
  });

  it('Έλεγχος υπηρεσιών (εξαγωγή): στήλη ΠΥΛΗ στο τέλος', async () => {
    const { s } = withGate(); const k = s.settings.blocks.find(b => b.name === 'Πύλη')!.posts[1].k;
    s.guards = { '2026-10-05': { [k]: 1 }, '2026-10-07': { [k]: 1 } };
    const rows = (await readBook(await (async () => { const f = path.join(tmp(), 'x.xlsx'); fs.writeFileSync(f, (await dutyCheck(s, '2026-10')).data); return f; })())).sheets[0].rows;
    const head = rows[2]; const c = head.indexOf('ΠΥΛΗ');
    expect(c).toBe(head.length - 1);
    const r = rows.find(x => x[2] === s.people[0].last)!;
    expect([r[c], r[head.indexOf('ΣΥΝ.')]]).toEqual([2, 2]);
  });

  it('Δυνατότητα υπηρεσιών: στήλη για τη δική σου υπηρεσία όταν κάποιος δεν την κάνει, και ξαναδιαβάζεται', async () => {
    const { s, gate } = withGate();
    expect(capExtras(s.settings).map(x => x.head)).toEqual(['ΠΥΛΗ', 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ Γ΄']);   // όπως οι στήλες του «Ποιος κάνει τι»
    s.caps = { 4: { ['b:' + gate]: 'ΠΟΝΟΣ ΓΟΝΑΤΟΥ' } as never };
    const file = path.join(tmp(), 'caps.xlsx'); const b = { ...defaultBinding('caps', file), write: true };
    const w = await writeSource('caps', b, s, undefined, D, { create: true }); expect(w.ok, JSON.stringify(w)).toBe(true);
    const sh = (await readBook(file)).sheets[0];
    const head = sh.rows[1]; expect(head.slice(9)).toEqual(['ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΕΙΑ', 'ΣΚΟΠΙΑ', 'ΤΑΕ', 'ΠΥΛΗ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']);
    expect([sh.rows[2][14], sh.rows[2][15]]).toEqual(['-', 'ΠΟΝΟΣ ΓΟΝΑΤΟΥ']);
    const found = bestFor('caps', [sh])!; const fb = { ...b, header: found.header, cols: found.cols };
    expect(planCaps(sh, fb, s).changes).toEqual([]);
    // στο Excel έβαλε «-» και σε άλλον: περνά στην εφαρμογή ως «δεν κάνει Πύλη»
    const s2 = { ...s, caps: {} };
    expect(planCaps(sh, fb, s2).changes).toEqual([{ pid: 4, kind: 'b:' + gate, reason: 'Από Excel: ΠΟΝΟΣ ΓΟΝΑΤΟΥ', who: expect.any(String) }]);
    expect(apply(s2, { t: 'importCaps', changes: planCaps(sh, fb, s2).changes, source: 'x' }, ctx).state.caps[4]).toEqual({ ['b:' + gate]: 'Από Excel: ΠΟΝΟΣ ΓΟΝΑΤΟΥ' });
  });

  it('Δυνατότητα υπηρεσιών σε υπάρχον φύλλο χωρίς τη στήλη: μπαίνει στο τέλος του πίνακα, οι δικές σου στήλες μένουν', async () => {
    const { s, gate } = withGate();
    const file = path.join(tmp(), 'caps.xlsx'); const b = { ...defaultBinding('caps', file), write: true };
    s.caps = { 2: { th: 'ΠΟΝΟΣ' } };
    expect((await writeSource('caps', b, s, undefined, D, { create: true })).ok).toBe(true);
    const s2 = { ...s, caps: { 2: { th: 'ΠΟΝΟΣ' }, 5: { ['b:' + gate]: 'ΑΛΛΕΡΓΙΑ' } } as AppState['caps'] };
    const w = await writeSource('caps', b, s2, undefined, D); expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) return;
    expect(w.binding?.cols['b:' + gate]).toBe(15);
    const sh = (await readBook(file)).sheets[0];
    expect(sh.rows[1].slice(9)).toEqual(['ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΕΙΑ', 'ΣΚΟΠΙΑ', 'ΤΑΕ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 'ΠΥΛΗ']);
    const row = sh.rows.find(r => r[6] === 900004)!; expect([row[14], row[15]]).toEqual(['ΑΛΛΕΡΓΙΑ', '-']);
  });
});

describe('θάλαμοι των Ρυθμίσεων στο νέο Δυναμολόγιο', () => {
  it('σύνολα και ΘΑΛΑΜΟΙ για όλους τους θαλάμους, και ο νέος σε άδειο θάλαμο μπαίνει στον πίνακά του', async () => {
    const s = fakeState(16); s.settings.rooms = { n: 10, per: 5 };   // 16 άτομα στους θαλάμους 1–8, οι 9 και 10 άδειοι
    const file = path.join(tmp(), 'ΔΥΝ.xlsx'); const b = { ...defaultBinding('people', file, 'ΣΥΝΟΛΙΚΟ'), write: true };
    const w = await writeSource('people', b, s, undefined, D, { create: true }); expect(w.ok, JSON.stringify(w)).toBe(true);
    if (!w.ok) return;
    let { sheets } = await readBook(file);
    const labels = sheets[0].rows.map(r => r[b.cols.last]).filter(v => typeof v === 'string' && /^\d+ΟΣ$/.test(v));
    expect(labels).toEqual(['1ΟΣ', '2ΟΣ', '3ΟΣ', '4ΟΣ', '5ΟΣ', '6ΟΣ', '7ΟΣ', '8ΟΣ', '9ΟΣ', '10ΟΣ']);
    expect(roomBlocks(sheets[1]).map(x => [x.room, x.rows.length])).toEqual([[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 0], [10, 0]]);
    const s2 = apply(s, { t: 'addPerson', person: { rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΝΕΟΦΕΡΤΟΣ', first: 'ΑΛΦΑΣ', father: 'Χ', asm: '999', phone: '6999', room: 9, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '' } as never }, ctx).state;
    const w2 = await writeSource('people', b, s2, { keys: w.meta.keys, snap: w.meta.snap } as never, D); expect(w2.ok, JSON.stringify(w2)).toBe(true);
    ({ sheets } = await readBook(file));
    const blocks = roomBlocks(sheets[1]);
    expect(blocks.find(x => x.room === 9)!.rows.map(x => [x.v.aa, x.v.last])).toEqual([[1, 'ΝΕΟΦΕΡΤΟΣ']]);
    expect(blocks.find(x => x.room === 10)!.rows).toEqual([]);
    // η νέα γραμμή έχει τη μορφή γραμμής ατόμου, όχι των επικεφαλίδων
    const ws = await (await Workbook.open(fs.readFileSync(file))).sheet('ΘΑΛΑΜΟΙ'); const r9 = blocks.find(x => x.room === 9)!.rows[0].r + 1;
    expect(ws.style('D' + r9)).toBe(ws.style('D3'));
  });
});

describe('προεπισκόπηση ΦΡΟΥΡΑΣ', () => {
  it('οι πίνακες των νέων υπηρεσιών όπως στο Excel: δύο δίπλα δίπλα, κάθε γραμμή 13 στήλες', async () => {
    const { frouraSheet } = await import('../src/renderer/sheets');
    let { s } = withGate(); s = apply(s, { t: 'autofill', date: D }, ctx).state;
    const m = frouraSheet(s, D);
    const at = m.rows.findIndex(r => r.some(c => c?.v === 'ΠΥΛΗ'));
    expect(m.rows[at].map(c => c?.v).filter(Boolean)).toEqual(['Α/Α', 'ΠΥΛΗ', 'ΩΡΕΣ', 'ΠΑΡ/ΣΕΙΣ', 'Α/Α', 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ Γ΄', 'ΠΑΡ/ΣΕΙΣ']);
    expect(m.rows[at - 1].map(c => c?.v).join('')).toBe('');
    expect(m.rows[at + 1].some(c => c?.v === '24ΩΡΗ')).toBe(true);
    for (const r of m.rows.slice(at - 1, at + 3)) expect(r.reduce((a, c) => a + (c ? c.cs : 0), 0)).toBe(13);
  });
});
