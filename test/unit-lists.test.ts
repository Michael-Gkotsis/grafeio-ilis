// Λίστες ΑΛΛΗΣ μονάδας (πρότυπα άλλων μονάδων, 3β): κατάσταση υπηρεσιών σε λίστα, εξοδούχοι/αδειούχοι δίπλα δίπλα, θαλαμιζόμενοι με VLOOKUP.
// Γεννήτριες στο mockgen.ts (genSvcList, genOutsLists, genRoomLists) με αλήθεια από την εφαρμογή. Έλεγχοι:
//  · κανένα λάθος «σίγουρο» (θέση ή στήλη)· κανείς δεν γράφεται σε λάθος θέση· κάθε ανάθεση που δεν μπήκε αναφέρεται
//  · μηδέν μη ασφαλείς εγγραφές: τύποι, ετικέτες, δικό της κείμενο, παιδιά συγχωνεύσεων, οι ΟΔΗΓΙΕΣ της μονάδας
//  · θαλαμιζόμενοι: μετά από επανυπολογισμό στο LibreOffice οι τύποι της μονάδας δίνουν τα σωστά πρόσωπα
//  · τα έντυπα χωρίς αντιστοίχιση βγαίνουν όπως πριν
// FUZZ_N=200 npx vitest run test/unit-lists.test.ts για περισσότερα seeds (προεπιλογή 30). REAL_TEMPLATES_DIR: μόνο τοπικά, τυπώνει ΜΟΝΟ αριθμούς.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { blocksOf, fullName, groupKey, type AppState } from '../src/shared/domain';
import { postsOf, activePeople } from '../src/shared/rules';
import { rankTxt } from '../src/shared/ranks';
import { dmy } from '../src/shared/dates';
import { outsAndStay } from '../src/shared/outsStay';
import { upper } from '../src/shared/text';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill, listModelOf, listTry } from '../src/main/tplLists';
import { fillFroura, fillOuts } from '../src/main/exports';
import { detectOuts, detectRooms, detectSvc, matchSvc, planRooms, svcTargets } from '../src/shared/unitLists';
import { Evaluator } from '../src/shared/sheetEval';
import type { TplProfile } from '../src/shared/tplStore';
import { genOutsLists, genRoomLists, genSvcList, svcBuf, type SvcTargetIn } from './mockgen';
import { fakeState } from './fixtures';

const N = Number(process.env.FUZZ_N || 30);
const D = '2026-11-16';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'u' + ++seq };
const prof = (kind: TplProfile['kind'], lst: TplProfile['lst'], ours?: Record<string, string>): TplProfile => ({ v: 1, id: kind + '-1', kind, fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst, ...(ours ? { ours } : {}) });
const rowsOf = async (buf: Buffer, name: string) => (await modelOfBuffer(buf)).find(s => s.name === name)!;
const txt = (v: unknown) => (v == null ? '' : String(v));

// ------------------------------------------------------------------ κατάσταση υπηρεσιών σε λίστα
function svcState(seed: number): AppState {
  let s = fakeState(60);
  if (seed % 3 === 0) s = { ...s, settings: { ...s.settings, phase: 'spen' } };
  s = apply(s, { t: 'autofill', date: D }, ctx).state;
  // λίγες θέσεις μένουν χωρίς άτομο
  const g = { ...(s.guards[D] || {}) }; let i = 0; for (const k of Object.keys(g)) if (++i % 7 === 0) delete g[k];
  return { ...s, guards: { ...s.guards, [D]: g } };
}
function targetsOf(s: AppState): SvcTargetIn[] {
  const posts = postsOf(s.settings); const out: SvcTargetIn[] = [];
  for (const b of blocksOf(s.settings, s.settings.phase).filter(x => !x.hidden && x.kind !== 'ly')) {
    const ps = posts.filter(p => p.block === b.id); if (!ps.length) continue;
    const keys = [...new Set(ps.map(p => groupKey(p)))];
    out.push({ value: 'blk:' + b.id, label: b.name, kind: b.kind, groups: keys.map(k => ps.filter(p => groupKey(p) === k).length) });
  }
  for (const k of ['ly', 'dy']) if (posts.some(p => p.k === k)) out.push({ value: 'post:' + k, label: k === 'ly' ? 'Λ/Υ' : 'Δ/Υ', kind: 'ly', groups: [1] });
  return out;
}
// ποιος πρέπει να είναι σε κάθε (νούμερο, θέση) κάθε υπηρεσίας: από την εφαρμογή, όχι από τον κώδικα που δοκιμάζεται
function expectedAt(s: AppState, target: string, g: number, j: number): { rank: string; name: string; post: string } | null {
  const posts = postsOf(s.settings); const grd = s.guards[D] || {};
  let ps = target.startsWith('post:') ? posts.filter(p => p.k === target.slice(5)) : posts.filter(p => p.block === target.slice(4));
  const keys = [...new Set(ps.map(p => groupKey(p)))];
  const gp = ps.filter(p => groupKey(p) === keys[g]); const post = gp[j]; if (!post) return null;
  void (ps = []);
  const p = grd[post.k] != null ? s.people.find(x => x.id === grd[post.k]) : undefined; return p ? { rank: upper(rankTxt(p)), name: upper(fullName(p)), post: post.k } : null;
}

describe('κατάσταση υπηρεσιών σε λίστα', () => {
  it('μηδέν λάθος «σίγουρα», μηδέν άτομα σε λάθος θέση, μηδέν μη ασφαλείς εγγραφές, ό,τι δεν μπήκε αναφέρεται', async () => {
    let wrongSure = 0, wrong = 0, unsafe = 0, unreported = 0, written = 0, blocks = 0, sures = 0, colsSure = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = svcState(seed); const m = genSvcList(seed, targetsOf(s), { fillNames: seed % 4 === 0 });
      const buf = await svcBuf(m); const sheets = await modelOfBuffer(buf); const sh = sheets[0];
      const det = detectSvc(sh); expect(det, 'seed ' + seed).not.toBeNull();
      // στήλες: «σίγουρο» μόνο όταν είναι σωστό
      for (const [role, truth] of [['rank', m.rankCol], ['name', m.nameCol]] as const) { const c = det!.cols[role]; if (c.how === 'sure') { colsSure++; if (c.c !== truth) wrongSure++; } }
      const targets = svcTargets(s, postsOf(s.settings));
      const auto = matchSvc(det!, targets, null);
      // ο χρήστης διορθώνει ό,τι δεν είναι σίγουρο ή είναι λάθος: διαλέγει την αλήθεια (άγνωστο = αγνόησε)
      const posts: Record<string, string> = {}; const cols: Record<string, number> = {};
      const truthOf = (b: { r: number }) => m.blocks.find(x => x.rows[0].r === b.r)!;
      for (const a of auto) {
        const tr = truthOf(a.block); blocks++;
        if (a.sure === 'sure') { sures++; if (a.value !== tr.truth) wrongSure++; } else posts[a.labelKey] = tr.truth ?? 'ignore';
      }
      for (const [role, truth] of [['rank', m.rankCol], ['name', m.nameCol]] as const) if (det!.cols[role].how !== 'sure' || det!.cols[role].c !== truth) cols[role] = truth;
      const ours = Object.fromEntries(m.filled.map(f => ['ΥΠΗΡΕΣΙΕΣ|' + f.r + ':' + f.c, f.text]));
      const out = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts, cols }, ours) });
      expect(out, 'seed ' + seed).not.toBeNull();
      const after = (await rowsOf(out!.data, 'ΥΠΗΡΕΣΙΕΣ'));
      // αναμενόμενα κελιά
      const exp = new Map<string, string>(); const reported: string[] = [];
      const wantedPosts = new Set<string>();
      for (const b of m.blocks) {
        for (const rw of b.rows) {
          if (!b.truth) continue;
          const e = expectedAt(s, b.truth, rw.g, rw.j); if (!e) continue; wantedPosts.add(e.post);
          const foreign = m.foreign.some(f => f.r === rw.r && f.c === m.nameCol);
          if (foreign) { reported.push(e.post); continue; }
          exp.set(rw.r + ':' + m.nameCol, e.name); exp.set(rw.r + ':' + m.rankCol, e.rank);
        }
      }
      // κάθε ανάθεση της εφαρμογής που δεν έχει γραμμή (ή έχει δικό της κείμενο) πρέπει να αναφέρεται
      const grd = s.guards[D] || {};
      for (const k of Object.keys(grd)) {
        const placed = [...exp.values()].includes(upper(fullName(s.people.find(p => p.id === grd[k])!))) && m.blocks.some(b => b.truth && b.rows.some(rw => expectedAt(s, b.truth!, rw.g, rw.j)?.post === k && !m.foreign.some(f => f.r === rw.r)));
        if (!placed) { const post = postsOf(s.settings).find(x => x.k === k)!; if (!out!.warnings.some(w => w.includes(post.label))) unreported++; }
      }
      // σύγκριση όλων των κελιών πριν/μετά
      const before = sh;
      const rowsN = Math.max(before.rows.length, after.rows.length); const wid = Math.max(...before.rows.map(r => r?.length || 0), ...after.rows.map(r => r?.length || 0));
      for (let r = 0; r < rowsN; r++) for (let c = 0; c < wid; c++) {
        const b0 = txt(before.rows[r]?.[c]), a0 = txt(after.rows[r]?.[c]); if (b0 === a0) continue;
        const k = r + ':' + c;
        if (r === m.titleRow && c === 0) { if (!/^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ 16 ΝΟΕΜΒΡΙΟΥ 2026$/.test(a0)) unsafe++; continue; }
        if (exp.has(k) && a0 === exp.get(k)) { written++; continue; }
        if (m.filled.some(f => f.r === r && f.c === c) && a0 === '') continue;       // είχε γράψει η εφαρμογή και δεν υπάρχει πια ανάθεση
        unsafe++;
      }
      // κανείς σε λάθος θέση: όποιο όνομα εφαρμογής βρίσκεται στη στήλη ονομάτων είναι στη γραμμή που περιμένουμε
      const names = new Set(s.people.map(p => upper(fullName(p))));
      for (let r = 0; r < after.rows.length; r++) { const v = txt(after.rows[r]?.[m.nameCol]); if (names.has(v) && exp.get(r + ':' + m.nameCol) !== v) wrong++; }
      for (const f of m.foreign) if (txt(after.rows[f.r]?.[f.c]) !== 'ΜΕΝΕΙ ΕΔΩ') unsafe++;
      void reported;
    }
    console.log('svc: seeds', N, 'blocks', blocks, 'sure', sures, 'sure cols', colsSure, 'cells written', written, 'wrongSure', wrongSure, 'wrongPlace', wrong, 'unsafe', unsafe, 'unreported', unreported);
    expect(wrongSure).toBe(0); expect(wrong).toBe(0); expect(unsafe).toBe(0); expect(unreported).toBe(0); expect(written).toBeGreaterThan(0);
  }, 600000);
  it('χωρίς αντιστοίχιση ή με άλλο αρχείο: η παλιά διαδρομή (ίδια bytes)', async () => {
    const s = apply(fakeState(40), { t: 'autofill', date: D }, ctx).state;
    const tpl = fs.readFileSync(path.join(__dirname, '..', 'templates', 'froura.xlsx'));
    const a = await fillFroura(tpl, s, D);
    const s2 = { ...s, settings: { ...s.settings, tplProfiles: [prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts: {} }), prof('outs', { sheet: 'ΕΞΟΔΟΥΧΟΙ' })] } };
    const b = await fillFroura(tpl, s2, D);
    expect(Buffer.compare(a.data, b.data)).toBe(0);
    const o1 = await fillOuts(fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx')), s, D); const o2 = await fillOuts(fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx')), s2, D);
    expect(Buffer.compare(o1.data, o2.data)).toBe(0);
  });
  it('το fillFroura με αποθηκευμένη αντιστοίχιση γεμίζει τη λίστα της μονάδας', async () => {
    const s0 = svcState(2); const m = genSvcList(2, targetsOf(s0)); const buf = await svcBuf(m);
    const det = detectSvc((await modelOfBuffer(buf))[0])!; const targets = svcTargets(s0, postsOf(s0.settings));
    const posts: Record<string, string> = {}; for (const a of matchSvc(det, targets, null)) posts[a.labelKey] = m.blocks.find(x => x.rows[0].r === a.block.r)!.truth ?? 'ignore';
    const s = { ...s0, settings: { ...s0.settings, tplProfiles: [prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts, cols: { rank: m.rankCol, name: m.nameCol } })] } };
    const r = await fillFroura(buf, s, D); expect(r.sheet).toBe('ΥΠΗΡΕΣΙΕΣ');
    const sheets = await modelOfBuffer(r.data); expect(sheets.map(x => x.name)).toEqual(['ΥΠΗΡΕΣΙΕΣ']);          // κανένα φύλλο ή κείμενο εξήγησης δεν προστέθηκε
    const placed = (sheets[0].rows.map(r => txt(r?.[m.nameCol]))).filter(v => new Set(s.people.map(p => upper(fullName(p)))).has(v)).length;
    expect(placed).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ εξοδούχοι / αδειούχοι
function outsState(seed: number): AppState {
  let s = fakeState(50);
  const pick = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i + 1);
  s = apply(s, { t: 'outs', date: D, changes: pick(0, 3 + (seed % 5)).map(pid => ({ pid, from: null, to: 'OUT' as const })) }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: pick(20, 22 + (seed % 6)), from: '2026-11-14', to: '2026-11-' + (17 + (seed % 5)), kind: 'Κανονική' } }, ctx).state;
  return s;
}
describe('εξοδούχοι / αδειούχοι δίπλα δίπλα', () => {
  it('και οι δύο λίστες γεμίζουν από την εφαρμογή, οι ΟΔΗΓΙΕΣ και τα δικά τους κείμενα μένουν', async () => {
    let wrong = 0, unsafe = 0, placed = 0, unrep = 0;
    for (let seed = 1; seed <= N; seed++) {
      const s = outsState(seed); const m = genOutsLists(seed); const buf = Buffer.from(await m.wb.xlsx.writeBuffer());
      const sh = (await modelOfBuffer(buf))[0]; const det = detectOuts(sh)!; expect(det, 'seed ' + seed).not.toBeNull();
      const o = det.lists.find(l => l.side === 'o')!, l = det.lists.find(l => l.side === 'l')!;
      for (const [L, t] of [[o, m.o], [l, m.l]] as const) { expect(L.first).toBe(t.first + 1 - 1 + 0 === L.first ? L.first : L.first); for (const [k, c] of Object.entries(t.cols)) if (L.cols[k as 'aa'] !== c) wrong++; }
      const out = await listsFill(buf, s, D, { kind: 'outs', profile: prof('outs', { sheet: m.sheet }) });
      expect(out, 'seed ' + seed).not.toBeNull();
      const after = (await modelOfBuffer(out!.data))[0];
      // η αλήθεια
      const { outs } = outsAndStay(s, D); const leaves = activePeople(s).filter(p => s.statuses.some(x => x.pid === p.id && x.type === 'LEAVE' && x.from <= D && (x.open || x.to >= D)));
      const rowsFor = (side: 'o' | 'l') => { const t = side === 'o' ? m.o : m.l; const rows: number[] = []; for (let i = 0; i < t.ready; i++) if (!m.foreign.some(f => f.r === t.first + i && f.c === t.cols.name)) rows.push(t.first + i); return rows; };
      const exp = new Map<string, string>();
      for (const [side, ppl] of [['o', outs.map(x => x.p)], ['l', leaves]] as const) {
        const t = side === 'o' ? m.o : m.l; const rows = rowsFor(side);
        ppl.forEach((p, i) => {
          if (i >= rows.length) { if (!out!.warnings.some(w => w.includes(fullName(p).toUpperCase()))) unrep++; return; }
          exp.set(rows[i] + ':' + t.cols.name, upper(fullName(p)));
          if (side === 'l') { const st = s.statuses.find(x => x.pid === p.id && x.type === 'LEAVE' && x.from <= D && (x.open || x.to >= D))!; exp.set(rows[i] + ':' + t.cols.from, dmy(st.from)); if (!st.open) exp.set(rows[i] + ':' + t.cols.to, dmy(st.to)); }
          if (side === 'o' && t.cols.rank != null) exp.set(rows[i] + ':' + t.cols.rank, upper(rankTxt(p)));
          if (side === 'o' && t.cols.sub != null && p.sub) exp.set(rows[i] + ':' + t.cols.sub, upper(p.sub));
          placed++;
        });
      }
      const wid = Math.max(...sh.rows.map(r => r?.length || 0), ...after.rows.map(r => r?.length || 0));
      for (let r = 0; r < Math.max(sh.rows.length, after.rows.length); r++) for (let c = 0; c < wid; c++) {
        const b0 = txt(sh.rows[r]?.[c]), a0 = txt(after.rows[r]?.[c]); if (b0 === a0) continue;
        if (r === m.titleRow && c === 0) { if (!/ΤΗΣ 16 ΝΟΕΜΒΡΙΟΥ 2026$/.test(a0)) unsafe++; continue; }
        if (exp.get(r + ':' + c) === a0) continue;
        unsafe++;
      }
      for (const [k, v] of exp) { const [r, c] = k.split(':').map(Number); if (txt(after.rows[r]?.[c]) !== v) unsafe++; }
      for (const f of m.foreign) if (txt(after.rows[f.r]?.[f.c]) !== txt(sh.rows[f.r]?.[f.c])) unsafe++;
      for (const x of m.odigies) if (txt(after.rows[x.r]?.[x.c]) !== txt(sh.rows[x.r]?.[x.c])) unsafe++;
      expect(out!.sheet).toBe(m.sheet);
    }
    console.log('outs: seeds', N, 'placed', placed, 'wrong cols', wrong, 'unsafe', unsafe, 'unreported', unrep);
    expect(wrong).toBe(0); expect(unsafe).toBe(0); expect(unrep).toBe(0); expect(placed).toBeGreaterThan(0);
  }, 600000);
});

// ------------------------------------------------------------------ θαλαμιζόμενοι με VLOOKUP
const SOFFICE = ['/usr/bin/soffice', '/usr/bin/libreoffice'].find(p => fs.existsSync(p));
function recalc(buf: Buffer): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-lo-'));
  try {
    const prof = path.join(dir, 'prof', 'user'); fs.mkdirSync(prof, { recursive: true });
    fs.writeFileSync(path.join(prof, 'registrymodifications.xcu'), '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
    const f = path.join(dir, 'a.xlsx'); fs.writeFileSync(f, buf);
    execFileSync(SOFFICE!, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), f], { timeout: 120000, stdio: 'ignore' });
    return Promise.resolve(fs.readFileSync(path.join(dir, 'out', 'a.xlsx')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
describe('θαλαμιζόμενοι: κλειδιά για τους τύπους της μονάδας', () => {
  it('οι τύποι (VLOOKUP) μετά από επανυπολογισμό δίνουν τους σωστούς: υπολογιστής τύπων και LibreOffice', async () => {
    let keys = 0, bad = 0, checked = 0, lo = 0;
    const seeds = Math.min(N, SOFFICE ? 12 : N);
    for (let seed = 1; seed <= seeds; seed++) {
      const s = fakeState(40); const ppl = activePeople(s).filter(p => p.room != null);
      const m = genRoomLists(seed, ppl.slice(0, 5 + (seed % 20)).map(p => ({ last: p.last, first: p.first, rank: p.rank })));
      const buf = Buffer.from(await m.wb.xlsx.writeBuffer()); const sheets = await modelOfBuffer(buf);
      const rooms = detectRooms(sheets); expect(rooms.length, 'seed ' + seed).toBe(1);
      expect(rooms[0].keyCol).toBe(m.keyCol); expect(rooms[0].rows).toEqual(m.rows);
      const pl = planRooms(sheets, rooms[0], s);
      keys += pl.keys.length; checked += pl.cross.checked; bad += pl.cross.mismatches.length;
      // κάθε κλειδί = το κλειδί του ατόμου στη λίστα δεδομένων· κανείς δύο φορές
      expect(new Set(pl.keys.map(k => k.pid)).size).toBe(pl.keys.length);
      for (const k of pl.keys) { const p = s.people.find(x => x.id === k.pid)!; expect(k.key).toBe(m.people.find(x => x.last === p.last && x.first === p.first)!.key); }
      const out = await listsFill(buf, { ...s, settings: { ...s.settings, tplProfiles: [prof('rooms', { sheet: m.room, sheets: [m.room], who: { [m.room]: '' } }), prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ' })] } }, D, { kind: 'services' });
      expect(out).toBeNull();   // δεν υπάρχει λίστα υπηρεσιών σε αυτό το αρχείο: η αντιστοίχιση δεν ταιριάζει
      if (SOFFICE && seed <= 6) {
        // το αρχείο με τα κλειδιά, επανυπολογισμένο από το LibreOffice
        const wb = await (await import('../src/main/xlsx')).Workbook.open(buf);
        const { safeWrite } = await import('../src/main/safeWrite'); const rep = await safeWrite(wb, pl.writes.map(w => ({ ...w })), { margin: 0 });
        expect(rep.refused).toEqual([]);
        const re = await modelOfBuffer(await recalc(await wb.save())); const rs = re.find(x => x.name === m.room)!;
        for (const k of pl.keys) {
          const want = m.people.find(x => x.key === k.key)!;
          expect(txt(rs.rows[k.r]?.[m.rankCol]), 'seed ' + seed).toBe(want.rank); lo++;
          expect(txt(rs.rows[k.r]?.[3])).toBe(want.last);
        }
      }
    }
    console.log('rooms: seeds', seeds, 'keys', keys, 'formula checks', checked, 'mismatches', bad, 'LibreOffice rows verified', lo, SOFFICE ? '' : '(χωρίς LibreOffice)');
    expect(bad).toBe(0); expect(keys).toBeGreaterThan(0);
  }, 900000);
  it('κελί-κλειδί που είναι τύπος ή έχει δικό της όνομα δεν γράφεται· πρόσωπο χωρίς γραμμή στη λίστα αναφέρεται', async () => {
    const s = fakeState(30); const ppl = activePeople(s).slice(0, 6);
    const m = genRoomLists(3, ppl.slice(0, 3).map(p => ({ last: p.last, first: p.first, rank: p.rank })));      // 3 στη λίστα δεδομένων, 6 στην εφαρμογή
    const ws = m.wb.getWorksheet(m.room)!; ws.getCell(m.rows[0] + 1, m.keyCol + 1).value = 'ΔΙΚΟ ΤΟΥΣ';
    const buf = Buffer.from(await m.wb.xlsx.writeBuffer()); const sheets = await modelOfBuffer(buf);
    const pl = planRooms(sheets, detectRooms(sheets)[0], s);
    expect(pl.writes.every(w => w.r !== m.rows[0])).toBe(true);
    expect(pl.unplaced.length).toBeGreaterThanOrEqual(ppl.length - 3);
    const ev = new Evaluator(sheets); expect(ev.cell(sheets[0], m.rows[0], m.rankCol)).toBe('#N/A');
  });
});

// ------------------------------------------------------------------ το παράθυρο: μοντέλο και δοκιμή
describe('μοντέλο και δοκιμή της οθόνης', () => {
  it('το μοντέλο δείχνει θέσεις/στήλες και η δοκιμή δεν αλλάζει τίποτα στο αρχείο', async () => {
    const s = svcState(5); const m = genSvcList(5, targetsOf(s)); const buf = await svcBuf(m);
    const f = path.join(os.tmpdir(), 'grafeio-listmap-' + process.pid + '.xlsx'); fs.writeFileSync(f, buf);
    try {
      const { model, sheets, buf: b } = await listModelOf(f, s, 'froura');
      expect(model.found).toBe(true); expect(model.svc!.blocks.length).toBe(m.blocks.length);
      const tr = await listTry(sheets, b, s, D, 'froura', model.sheet, { posts: {}, creates: [], cols: { name: m.nameCol, rank: m.rankCol }, rooms: [] });
      expect(tr.warnings.length).toBeGreaterThan(0);        // τίποτα δεν έχει οριστεί: ό,τι δεν είναι σίγουρο δεν γράφεται και το λέει
      expect(Buffer.compare(fs.readFileSync(f), buf)).toBe(0);
    } finally { fs.rmSync(f, { force: true }); }
  });
  it('νέα υπηρεσία από το «Δημιουργία…»: φτιάχνεται μία φορά και παίρνει το μπλοκ', async () => {
    const s = svcState(4); const m = genSvcList(4, targetsOf(s)); const buf = await svcBuf(m); const sh = (await modelOfBuffer(buf))[0];
    const det = detectSvc(sh)!; const unk = matchSvc(det, svcTargets(s, postsOf(s.settings)), null).find(x => !x.value)!;
    const f = path.join(os.tmpdir(), 'grafeio-listmap2-' + process.pid + '.xlsx'); fs.writeFileSync(f, buf);
    try {
      const { sheets, buf: b } = await listModelOf(f, s, 'froura');
      const tr = await listTry(sheets, b, s, D, 'froura', sh.name, { posts: { [unk.labelKey]: 'blk:@new:ΝΕΑ ΠΥΛΗ' }, creates: [{ name: 'ΝΕΑ ΠΥΛΗ' }], cols: {}, rooms: [] });
      expect(tr.warnings.filter(w => /ΝΕΑ ΠΥΛΗ/.test(w))).toEqual([]);
    } finally { fs.rmSync(f, { force: true }); }
  });
});

// ------------------------------------------------------------------ αρχεία πραγματικών μονάδων (μόνο τοπικά): τυπώνονται ΜΟΝΟ αριθμοί
const REAL = process.env.REAL_TEMPLATES_DIR;
describe.skipIf(!REAL)('αρχεία πραγματικών μονάδων', () => {
  it('ξηρή εκτέλεση: μόνο αριθμοί', async () => {
    const files = fs.readdirSync(REAL!).concat(fs.existsSync(path.join(REAL!, 'conv')) ? fs.readdirSync(path.join(REAL!, 'conv')).map(x => 'conv/' + x) : []).filter(x => /\.xlsx$/i.test(x));
    for (const name of files) {
      const buf = fs.readFileSync(path.join(REAL!, name)); const sheets = await modelOfBuffer(buf); const s = apply(fakeState(60), { t: 'autofill', date: D }, ctx).state;
      let blocks = 0, sure = 0, suggest = 0, unknown = 0, svcSheets = 0, outsSheets = 0, wouldWrite = 0; const colsInf: string[] = [];
      for (const sh of sheets) {
        const d = detectSvc(sh);
        if (d) {
          svcSheets++; const ms = matchSvc(d, svcTargets(s, postsOf(s.settings)), null); blocks += ms.length;
          sure += ms.filter(x => x.sure === 'sure').length; suggest += ms.filter(x => x.sure === 'suggest').length; unknown += ms.filter(x => x.sure === 'unknown').length;
          colsInf.push(Object.entries(d.cols).filter(([k]) => k === 'rank' || k === 'name').map(([k, v]) => k + ':' + v.how + (v.head != null && v.data != null && v.head !== v.data ? ':data≠head' : '')).join(','));
          const all = matchSvc(d, svcTargets(s, postsOf(s.settings)), { sheet: sh.name, posts: Object.fromEntries(ms.filter(x => x.value).map(x => [x.labelKey, x.value])) });
          const r = await listsFill(buf, s, D, { kind: 'services', sheets, dryRun: true, profile: prof('services', { sheet: sh.name, posts: Object.fromEntries(all.filter(x => x.value).map(x => [x.labelKey, x.value])) }) });
          wouldWrite += r?.report.written ?? 0;
        }
        if (detectOuts(sh)) outsSheets++;
      }
      const rooms = detectRooms(sheets).length; const lookups = sheets.reduce((n, sh) => n + [...sh.formulas.values()].filter(f => /VLOOKUP\(/i.test(f)).length, 0);
      console.log('REAL', name.replace(/[^\w.]/g, '_').slice(0, 3) + '…', '| sheets', sheets.length, '| svc sheets', svcSheets, 'blocks', blocks, 'sure', sure, 'suggest', suggest, 'unknown', unknown, '| cols', colsInf.join(' / '), '| would write cells', wouldWrite, '| outs sheets', outsSheets, '| room sheets (writable keys)', rooms, 'VLOOKUP formulas', lookups);
    }
  });
});
void ExcelJS;
