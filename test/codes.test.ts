// Κωδικοί θέσεων στον έλεγχο υπηρεσιών (Θ1α, Μ2…): μετάβαση, λάθη, ανάγνωση, COUNTIF, υπηρεσίες χωρίς θέση
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command } from '../src/shared/commands';
import { DEFAULT_SETTINGS, migrateSettings, codeKey, type AppState } from '../src/shared/domain';
import { codeErrors, codeOf, exactCountif, readDuty } from '../src/shared/codes';
import { Workbook } from '../src/main/xlsx';
import { readBook } from '../src/main/sources';
import { Store } from '../src/main/db';
import { dutyCheck } from '../src/main/excel';
import { fakePeople, fakeState } from './fixtures';

const ctx = { today: '2026-10-12', newId: () => Math.random().toString(36).slice(2) };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const noCodes = (list: any[]) => list.map(b => ({ ...b, posts: b.posts.map(({ code, ...p }: any) => p) }));

describe('κωδικοί θέσεων', () => {
  it('παλιές ρυθμίσεις: κάθε θέση παίρνει κωδικό, και οι δικές σου υπηρεσίες γράμμα + αριθμό χωρίς διπλούς', () => {
    const mine = { id: 'c1', kind: 'other', name: 'Πύλη', armed: false, custom: true, posts: [{ k: 'c1a', label: 'Πύλη 1', short: '1' }, { k: 'c1b', label: 'Πύλη 2', short: '2' }] };
    const old = { ...DEFAULT_SETTINGS, rev: 2, blocks: [...noCodes(DEFAULT_SETTINGS.blocks), mine], blocksSpen: noCodes(DEFAULT_SETTINGS.blocksSpen) };
    const m = migrateSettings(old as any);
    expect(m.rev).toBe(5);
    const code = (k: string, list = m.blocks) => list.flatMap(b => b.posts).find(p => p.k === k)!.code;
    expect([code('th1'), code('th5'), code('mg2'), code('ly'), code('dy'), code('c1a'), code('c1b')]).toEqual(['Θ1α', 'Θ1β', 'Μ2', 'ΛΥ', 'ΔΥ', 'Υ1', 'Υ2']);
    expect([code('th1', m.blocksSpen), code('op3', m.blocksSpen), code('tae', m.blocksSpen)]).toEqual(['Θ1', 'ΟΠ3', 'ΤΑΕ']);
    expect(codeErrors(m)).toEqual([]);
    // κωδικός που έβαλες ήδη μένει
    const kept = migrateSettings({ ...old, blocks: old.blocks.map((b: any) => (b.id === 'mg' ? { ...b, posts: b.posts.map((p: any, i: number) => (i === 0 ? { ...p, code: 'ΜΑΓ1' } : p)) } : b)) } as any);
    expect(kept.blocks.find(b => b.id === 'mg')!.posts[0].code).toBe('ΜΑΓ1');
    expect(migrateSettings(m)).toBe(m);
  });
  it('λάθη στους κωδικούς: διπλός, σκέτο γράμμα, κωδικός απουσίας', () => {
    const set = (k: string, code: string) => ({ ...DEFAULT_SETTINGS, blocks: DEFAULT_SETTINGS.blocks.map(b => ({ ...b, posts: b.posts.map(p => (p.k === k ? { ...p, code } : p)) })) });
    expect(codeErrors(set('th2', 'θ1α')).join()).toMatch(/«θ1α» είναι και στο/);
    expect(codeErrors(set('th2', 'Θ')).join()).toMatch(/σκέτο γράμμα/);
    expect(codeErrors(set('mg1', 'Κ.Α')).join()).toMatch(/απουσίας/);
    expect(codeErrors(set('th1', 'Θ1')).length).toBe(0);   // ίδια θέση με τον κωδικό της ΣΠΕΝ: δεν είναι διπλός
    const s = fakeState(5);
    expect(() => run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {}, codes: { th2: 'Θ1α' } })).toThrow(/Θ1α/);
    const s2 = run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {}, codes: { th2: ' Θ2-Α ' } });
    expect(codeOf(s2.settings, 'th2', 'th')).toBe('Θ2-Α');
    expect(readDuty('θ2α', s2.settings)).toEqual({ k: 'th2', kind: 'th' });
  });
  it('ανάγνωση κελιού: κωδικός θέσης (και λατινικά, πεζά, κενά), σκέτο γράμμα, απουσία, άγνωστο', () => {
    const st = DEFAULT_SETTINGS;
    expect(codeKey('m 1')).toBe(codeKey('Μ1'));
    expect([readDuty('Θ1α', st), readDuty('m1', st), readDuty('Θ', st), readDuty('Λ', st), readDuty('ΔΥ', st)])
      .toEqual([{ k: 'th1', kind: 'th' }, { k: 'mg1', kind: 'mg' }, { kind: 'th' }, { k: 'ly', kind: 'ly' }, { k: 'dy', kind: 'ly' }]);
    expect([readDuty('ΟΠ2', st), readDuty('Σ3α', st)]).toEqual([{ k: 'op2', kind: 'op' }, { k: 'sk3a', kind: 'sk' }]);   // κωδικοί της ΣΠΕΝ στη ΣΒΕΝ
    expect([readDuty('Κ.Α', st), readDuty('ΕΑΡΒ', st), readDuty('Ζ9', st), readDuty('', st), readDuty('3', st)]).toEqual(['abs', 'abs', 'unknown', null, null]);
  });
  it('COUNTIF που μετρά σκέτο γράμμα', () => {
    expect(exactCountif('COUNTIF(M3:AO3, "Θ")')).toBe('Θ');
    expect(exactCountif('COUNTIF(M3:AO3,&quot;=Μ&quot;)')).toBe('Μ');
    expect(exactCountif('COUNTIF(M3:AO3, "Θ*")')).toBeNull();
    expect(exactCountif('COUNTIF(M3:AO3, "Κ.Α")')).toBeNull();
    expect(exactCountif('SUM(M3:AO3)')).toBeNull();
  });
  it('το αρχείο: βρίσκει και τους κοινόχρηστους τύπους (σύρσιμο στο Excel)', async () => {
    const wb = await Workbook.blank('ΕΛΕΓΧΟΣ'); const ws = await wb.sheet('ΕΛΕΓΧΟΣ');
    ws.set('A1', 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ'); ws.set('J3', 0); ws.set('K3', 0); ws.set('L3', 0); ws.set('M3', 'Θ');
    const zip = await JSZip.loadAsync(await wb.save()); const p = Object.keys(zip.files).find(f => /worksheets\/sheet\d+\.xml$/.test(f))!;
    let xml = await zip.file(p)!.async('string');
    const f = (ref: string, inner: string) => { xml = xml.replace(new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)'), '<c r="' + ref + '"$1>' + inner + '</c>'); };
    f('J3', '<f t="shared" ref="J3:K3" si="0">COUNTIF(M3:AO3,"Θ")</f><v>1</v>'); f('K3', '<f t="shared" si="0"/><v>0</v>'); f('L3', '<f>COUNTIF(M3:AO3,"Μ*")</f><v>0</v>');
    zip.file(p, xml);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-codes-')), 'e.xlsx'); fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
    const { sheets } = await readBook(file);
    expect(sheets[0].countif).toEqual(['J3', 'K3']);
  });
});

describe('υπηρεσίες χωρίς θέση και προηγούμενες υπηρεσίες', () => {
  it('ο έλεγχος των προηγούμενων: όλα μαζί με μία αναίρεση, και δεν ξαναβγαίνει', () => {
    const s = { ...fakeState(5), baseline: { 1: { th: 3, hol: 1 }, 2: { mg: 2 } } };
    const r = apply(s, { t: 'setBaselines', baselines: { 1: {}, 2: { mg: 2 } } }, ctx);
    expect(r.state.baseline).toEqual({ 2: { mg: 2 } }); expect(r.state.settings.baselineReviewed).toBe(true); expect(r.text).toMatch(/1 άτομο/);
    const keep = apply(s, { t: 'setBaselines', baselines: s.baseline }, ctx);
    expect(keep.state.baseline).toBe(s.baseline); expect(keep.state.settings.baselineReviewed).toBe(true);
  });
  it('αποθηκεύονται και αναιρούνται', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: fakePeople(5).map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state);
    st.commit(apply(st.state, { t: 'importDuties', days: { '2026-10-01': [{ pid: 2, kind: 'th', raw: 'Θ' }] }, source: 't' }, ctx).state);
    const patch = st.commit(apply(st.state, { t: 'importDuties', days: { '2026-10-02': [{ pid: 3, kind: 'mg', raw: 'Μ' }] }, source: 't' }, ctx).state);
    st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.dutyLog).toEqual({ '2026-10-01': [{ pid: 2, kind: 'th' }], '2026-10-02': [{ pid: 3, kind: 'mg' }] });
    st.revert(patch); expect(st.state.dutyLog).toEqual({ '2026-10-01': [{ pid: 2, kind: 'th' }] });
    st.close();
  });
  it('μηνιαίος έλεγχος υπηρεσιών: κωδικός θέσης, και σκέτο γράμμα για όσους δεν είχαν θέση', async () => {
    const s = { ...fakeState(5), guards: { '2026-10-05': { th6: 1, mg2: 3 } }, dutyLog: { '2026-10-05': [{ pid: 2, kind: 'th' as const }] } };
    const r = await dutyCheck(s, '2026-10');
    const wb = await Workbook.open(r.data); const rows = await wb.values(wb.sheetNames()[0]);
    const col = rows[2].indexOf('5'); const row = (pid: number) => rows.find(x => x[2] === s.people[pid - 1].last && x[3] === s.people[pid - 1].first)!;
    expect([row(1)[col], row(2)[col], row(3)[col]]).toEqual(['Θ2β', 'Θ', 'Μ2']);
    const th = rows[2].indexOf('Θ'); expect([row(1)[th], row(2)[th]]).toEqual([1, 1]);
  });
});
