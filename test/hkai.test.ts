// ΗΚΑΙ πίσω σελίδα: αριθμημένες ποινές με υπογραμμισμένη διάρκεια, αιτήσεις, εκτύπωση, και η βάση (πίνακας αιτήσεων,
// αναίρεση που κρατά μόνο τη μέρα που άλλαξε). Μόνο ψεύτικα ονόματα.
import { upper } from '../src/shared/text';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillHkai } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { renderBook } from '../src/main/print';
import { Store } from '../src/main/db';
import { hkaiPunLines, hkaiReqLines, linesText } from '../src/shared/hkaiText';
import { punText } from '../src/shared/punish';
import { preflight } from '../src/shared/preflight';
import type { AppState } from '../src/shared/domain';
import { fakePeople, fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const D = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'h' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const pun = (s: AppState, pid: number, from: string, to: string, extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type: 'PUN', pids: [pid], from, to, kind: 'Κράτηση', ...extra } as any });
const backXml = async (data: Buffer) => (await JSZip.loadAsync(data)).file('xl/worksheets/sheet2.xml')!.async('string');
const cellXml = (xml: string, ref: string) => new RegExp('<c r="' + ref + '"[^>]*>[\\s\\S]*?</c>').exec(xml)![0];

// Δύο ποινές στις 12/10, μία στις 11/10, και μία που ξεκινά 13/10 αλλά επιβλήθηκε 12/10
function punState() {
  let s = fakeState(20);
  s = pun(s, 3, D, '2026-10-13', { by: 'ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ', reason: 'απουσίασε από το προσκλητήριο.' });
  s = pun(s, 2, D, D, { kind: 'Στέρηση εξόδου' });
  s = pun(s, 4, '2026-10-11', '2026-10-12');
  s = pun(s, 5, '2026-10-13', '2026-10-14', { on: D });
  return s;
}

describe('ΗΚΑΙ: 4. ΠΟΙΝΕΣ', () => {
  it('όσες επιβλήθηκαν τη μέρα, αριθμημένες «1.» ανά όνομα', () => {
    const s = punState();
    const lines = hkaiPunLines(s, D).map(l => l.map(r => r.t).join(''));
    expect(lines).toHaveLength(3);
    expect(lines.map(l => l.slice(0, 3))).toEqual(['1. ', '2. ', '3. ']);
    // ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ (2), ΠΛΑΣΜΑΤΙΚΟΣ (5), ΥΠΟΘΕΤΙΔΗΣ (3) με αλφαβητική σειρά
    expect(lines[0]).toMatch(/^1\. Ο ΣΤΡ \(ΠΖ\) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ .* ΜΕ ΜΙΑ \(01\) ΗΜΕΡΑ ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ, ΔΙΟΤΙ ……\.$/);
    expect(lines[2]).toBe('3. Ο ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ ΤΙΜΩΡΗΘΗΚΕ ΤΗΝ 12 ΟΚΤ 26 ΑΠΟ ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ ΜΕ ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ, ΔΙΟΤΙ ΑΠΟΥΣΙΑΣΕ ΑΠΟ ΤΟ ΠΡΟΣΚΛΗΤΗΡΙΟ.');
    expect(hkaiPunLines(s, '2026-10-11')).toHaveLength(1);
  });
  it('στο Excel: μία γραμμή ανά ποινή, υπογραμμισμένη μόνο η διάρκεια, με τη γραμματοσειρά του κελιού', async () => {
    const s = punState();
    const r = await fillHkai(T('hkai.xlsx'), s, D);
    const bk = await (await Workbook.open(r.data)).sheet(1);
    expect(bk.get('G11')).toBe(linesText(hkaiPunLines(s, D)));
    expect(bk.get('G11')!.split('\n')).toHaveLength(3);
    const c = cellXml(await backXml(r.data), 'G11');
    expect(c).toMatch(/^<c r="G11" s="142" t="inlineStr">/);   // ίδιο στυλ: είχε ήδη αναδίπλωση
    const runs = [...c.matchAll(/<r><rPr>([\s\S]*?)<\/rPr><t xml:space="preserve">([\s\S]*?)<\/t><\/r>/g)];
    const under = runs.filter(m => m[1].includes('<u/>')).map(m => m[2]);
    const pm = new Map(s.people.map(p => [p.id, p]));
    expect(under).toEqual(['ΜΙΑ (01) ΗΜΕΡΑ ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ', 'ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ', punText(pm.get(5)!, s.statuses.find(x => x.pid === 5)!).dur]);
    for (const m of runs) { expect(m[1]).toContain('<rFont val="Arial"/>'); expect(m[1]).toContain('<sz val="12"/>'); }
  });
  it('η γραμμή ψηλώνει για να χωρέσουν όλες, ποτέ δεν μικραίνει', async () => {
    const ht = async (s: AppState) => Number(/<row r="11" ht="([\d.]+)"[^>]*customHeight="1"/.exec(await backXml((await fillHkai(T('hkai.xlsx'), s, D)).data))![1]);
    expect(await ht(fakeState(20))).toBe(35.1);
    let s = fakeState(20);
    for (let pid = 1; pid <= 6; pid++) s = pun(s, pid, D, D, { reason: 'δεν ήταν στη θέση του κατά τον έλεγχο ' + pid + ' του αξιωματικού υπηρεσίας και δεν ενημέρωσε κανέναν' });
    expect(await ht(s)).toBeGreaterThanOrEqual(6 * 12 * 1.35);
    expect(await ht(pun(fakeState(20), 1, D, D))).toBe(35.1);
  });
  it('η εκτύπωση από την εφαρμογή δείχνει την υπογράμμιση', async () => {
    const s = punState();
    const doc = await renderBook((await fillHkai(T('hkai.xlsx'), s, D)).data, { file: 'ΗΚΑΙ.xlsx' });
    const back = doc.sheets.find(x => x.name === 'πισω')!.html;
    expect(back).toContain('<u>ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ</u>');
    expect(back).toContain('1. Ο ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ');
  });
});

describe('ΗΚΑΙ: 5. ΑΙΤΗΣΕΙΣ', () => {
  it('αριθμημένες αιτήσεις της μέρας και μετά το ελεύθερο κείμενο', async () => {
    let s = fakeState(20);
    s = run(s, { t: 'addRequest', req: { pid: 3, date: D, text: 'Αιτείται μετάθεση στην 2η ΕΠΧΙΑ.' } });
    s = run(s, { t: 'addRequest', req: { pid: 2, date: D, text: 'ολιγοήμερη άδεια' } });
    s = run(s, { t: 'addRequest', req: { pid: 4, date: '2026-10-13', text: 'αλλαγή θαλάμου' } });
    s = run(s, { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { ait: 'ΕΛΕΥΘΕΡΟ ΚΕΙΜΕΝΟ' } } });
    expect(linesText(hkaiReqLines(s, D))).toBe('1. ΣΤΡ (ΠΖ) ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ ΒΗΤΑΣ: ΑΙΤΕΙΤΑΙ ΟΛΙΓΟΗΜΕΡΗ ΑΔΕΙΑ.\n2. ΣΤΡ (ΠΖ) ΥΠΟΘΕΤΙΔΗΣ ΓΑΜΜΑΣ: ΑΙΤΕΙΤΑΙ ΜΕΤΑΘΕΣΗ ΣΤΗΝ 2Η ΕΠΧΙΑ.\nΕΛΕΥΘΕΡΟ ΚΕΙΜΕΝΟ');
    const bk = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(1);
    expect(bk.get('G12')).toBe(upper(linesText(hkaiReqLines(s, D))));
    // μόνο ελεύθερο κείμενο, όπως πριν
    const only = run(fakeState(5), { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { ait: 'ΜΟΝΟ ΑΥΤΟ' } } });
    expect((await (await Workbook.open((await fillHkai(T('hkai.xlsx'), only, D)).data)).sheet(1)).get('G12')).toBe('ΜΟΝΟ ΑΥΤΟ');
  });
  it('αλλαγή, διαγραφή, και όχι διπλή ή κενή', () => {
    let s = run(fakeState(10), { t: 'addRequest', req: { pid: 2, date: D, text: 'άδεια' } });
    const id = s.requests[0].id;
    expect(() => run(s, { t: 'addRequest', req: { pid: 2, date: D, text: 'άδεια.' } })).toThrow(/έχει ήδη/);
    expect(() => run(s, { t: 'addRequest', req: { pid: 2, date: D, text: ' . ' } })).toThrow(/Γράψε/);
    expect(() => run(s, { t: 'addRequest', req: { pid: 99, date: D, text: 'άδεια' } })).toThrow(/άτομο/);
    s = run(s, { t: 'updateRequest', req: { id, pid: 2, date: D, text: 'μετάθεση' } });
    expect(s.requests).toEqual([{ id, pid: 2, date: D, text: 'μετάθεση' }]);
    expect(apply(s, { t: 'deleteRequest', id }, ctx).text).toMatch(/Διαγράφηκε αίτηση/);
    expect(run(s, { t: 'deleteRequest', id }).requests).toEqual([]);
  });
  it('προέλεγχος: πάνω από 10 γραμμές στην πίσω σελίδα ⚠', () => {
    let s = fakeState(20);
    for (let pid = 1; pid <= 11; pid++) s = run(s, { t: 'addRequest', req: { pid, date: D, text: 'άδεια' } });
    expect(preflight('hkai', s, D).some(c => c.level === 'warn' && /5\. Αιτήσεις: περίπου 11 γραμμές/.test(c.text))).toBe(true);
  });
});

describe('Excel: κείμενο με υπογράμμιση σε κελί χωρίς αναδίπλωση', () => {
  it('φτιάχνει ένα στυλ με αναδίπλωση και το ξαναχρησιμοποιεί', async () => {
    const xfCount = async (data: Buffer) => Number(/<cellXfs count="(\d+)"/.exec(await (await JSZip.loadAsync(data)).file('xl/styles.xml')!.async('string'))![1]);
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet(0);
    ws.setStyle('A1', 2).setStyle('A2', 2);
    await wb.setRich(ws, 'A1', [[{ t: 'α ' }, { t: 'β', u: true }], [{ t: 'γ' }]]);
    await wb.setRich(ws, 'A2', [[{ t: 'δ', u: true }]]);
    const data = await wb.save();
    expect(await xfCount(data)).toBe(5);
    const x = await (await JSZip.loadAsync(data)).file('xl/styles.xml')!.async('string');
    expect(x).toContain('<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>');
    const again = await Workbook.open(data); const w2 = await again.sheet(0);
    w2.setStyle('A3', 2); await again.setRich(w2, 'A3', [[{ t: 'ε', u: true }]]);
    expect(await xfCount(await again.save())).toBe(5);
    expect(w2.get('A1')).toBe('Α Β\nΓ');
    await again.setRich(w2, 'A1', []); expect(w2.get('A1')).toBeNull();
  });
});

describe('βάση: αιτήσεις και αναίρεση', () => {
  const people = fakePeople(5).map(({ id, active, ...p }) => p);
  it('οι αιτήσεις μένουν μετά το κλείσιμο και αναιρούνται', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gihk-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: people, source: 't', deactivateMissing: false }, ctx).state);
    const p1 = st.commit(run(st.state, { t: 'addRequest', req: { pid: 2, date: D, text: 'άδεια' } }));
    const id = st.state.requests[0].id;
    const p2 = st.commit(run(st.state, { t: 'updateRequest', req: { id, pid: 2, date: D, text: 'μετάθεση' } }));
    st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.requests).toEqual([{ id, pid: 2, date: D, text: 'μετάθεση' }]);
    st.revert(p2); expect(st.state.requests[0].text).toBe('άδεια');
    st.revert(p1); expect(st.state.requests).toEqual([]);
    st.close();
  });
  it('ΗΚΑΙ, εκτυπώσεις, απουσίες στελεχών: η αναίρεση κρατά μόνο ό,τι άλλαξε, όχι όλες τις μέρες', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gihk-'));
    const st = new Store(dir, WASM); await st.open();
    const big = 'Χ'.repeat(2000);
    let s = st.state;
    for (let i = 1; i <= 60; i++) s = run(s, { t: 'setHkaiManual', date: '2026-08-' + String(i % 30 + 1).padStart(2, '0'), manual: { cells: {}, text: { loi: big + i } } });
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'ka', from: '2026-10-01', to: '2026-10-05' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'an', from: '2026-10-10', to: '2026-10-11' } });
    st.commit(s);
    const p = st.commit(run(st.state, { t: 'setHkaiManual', date: '2026-08-05', manual: { cells: {}, text: { loi: 'ΝΕΟ' } } }));
    expect(JSON.stringify(p).length).toBeLessThan(big.length * 1.5);
    expect(p.kvd).toEqual([{ key: 'hkaiManual', put: [['2026-08-05', { cells: {}, text: { loi: big + 34 } }]], del: [] }]);
    const added = st.commit(run(st.state, { t: 'setHkaiManual', date: '2026-10-12', manual: { cells: {}, text: { loi: 'Α' } } }));
    const printed = st.commit(run(st.state, { t: 'printed', date: D, at: '10:00', files: ['ΗΚΑΙ'] }));
    const abs = st.state.cadreAbs[0];
    const del = st.commit(run(st.state, { t: 'deleteCadreAbs', id: abs.id }));
    st.revert(del); expect(st.state.cadreAbs.map(a => a.id).sort()).toEqual(s.cadreAbs.map(a => a.id).sort());
    st.revert(printed); expect(st.state.printed).toEqual({});
    st.revert(added); expect(st.state.hkaiManual['2026-10-12']).toBeUndefined();
    st.revert(p); expect(st.state.hkaiManual['2026-08-05'].text.loi).toBe(big + 34);
    expect(Object.keys(st.state.hkaiManual)).toHaveLength(30);
    st.close();
  });
  it('παλιά βάση (έκδοση 1): αναβαθμίζεται με αντίγραφο, και η αναίρεση ενέργειας από πριν δουλεύει', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gihk-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: people, source: 't', deactivateMissing: false }, ctx).state);
    st.close();
    // όπως θα ήταν με την προηγούμενη έκδοση: χωρίς πίνακα αιτήσεων, έκδοση σχήματος 1, και patch χωρίς request/kvd
    const SQL = await initSqlJs({ locateFile: () => WASM }); const db = new SQL.Database(fs.readFileSync(path.join(dir, 'ilh.db')));
    db.run('DROP TABLE request'); db.run("UPDATE meta SET value = '1' WHERE key = 'schema'");
    const old = JSON.stringify({ person: { put: [], del: [] }, status: { put: [], del: [] }, guard: { put: [], del: ['2026-10-12'] }, cap: { put: [], del: [] }, kv: { put: [['hkaiManual', {}]], del: [] } });
    db.run("INSERT INTO kv VALUES ('hkaiManual', ?)", [JSON.stringify({ [D]: { cells: {}, text: { loi: 'Χ' } } })]);
    db.run("INSERT INTO guard VALUES ('2026-10-12', ?)", [JSON.stringify({ mg1: 2 })]);
    db.run("INSERT INTO audit (at, day, text, files, source, patch, undoable) VALUES ('09:00', ?, 'παλιά', '[]', 'app', ?, 1)", [D, old]);
    fs.writeFileSync(path.join(dir, 'ilh.db'), Buffer.from(db.export()));
    st = new Store(dir, WASM); await st.open();
    expect(fs.readdirSync(path.join(dir, 'backups')).some(f => f.includes('πριν-αναβάθμιση'))).toBe(true);
    expect(st.state.requests).toEqual([]);
    const last = st.lastUndoable()!; st.revert(last.patch);
    expect(st.state.hkaiManual).toEqual({}); expect(st.state.guards[D]).toBeUndefined();
    st.commit(run(st.state, { t: 'addRequest', req: { pid: 1, date: D, text: 'άδεια' } })); st.close();
    st = new Store(dir, WASM); await st.open(); expect(st.state.requests).toHaveLength(1); st.close();
  });
});

// Πόστα (Michael, 13/10): δεν μετρούν στη στήλη Ο/Σ της ΗΚΑΙ· η στήλη γράφεται με το χέρι
describe('ΗΚΑΙ χωρίς πόστα', () => {
  it('όποιος έχει πόστο δεν μπαίνει στο Ο/Σ, ούτε στους κωλυόμενους', async () => {
    const { hkaiCounts } = await import('../src/shared/rules');
    const s = fakeState(20);
    const p = s.people.find(x => x.post)!;
    expect(p.post).toBe('ΚΨΜ');
    const h = hkaiCounts(s, D);
    expect(h.cols.os).toEqual([]);
    expect(Object.values(h.rank).some(r => r.c.os)).toBe(false);
    expect(Object.values(h.cols).flat().map(x => x.id)).not.toContain(p.id);
  });
  it('το Ο/Σ με το χέρι μετρά στη γραμμή του βαθμού και στους κωλυόμενους', async () => {
    const { hkaiCounts, HK_MANUAL } = await import('../src/shared/rules');
    expect(HK_MANUAL.map(x => x[0])).toContain('os');
    const s0 = fakeState(20); const before = hkaiCounts(s0, D).kol;
    const s = { ...s0, hkaiManual: { [D]: { cells: { 'Στρατιώτες': { os: 2 } }, text: {} } } };
    const h = hkaiCounts(s, D);
    expect(h.rank['Στρατιώτες'].c.os).toBe(2);
    expect(h.kol).toBe(before + 2);
  });
});
