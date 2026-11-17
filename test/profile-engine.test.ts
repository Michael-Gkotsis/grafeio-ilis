// Tests of the engine's PR 2 pieces on mock files with ground truth (test/mockgen.ts): template profiles (recognise the same template again,
// never another one), the safe write layer (never into a formula, a label or a merge child) and roster reading edge cases.
// Rules kept: 0 wrong-sure, 0 wrong matches of a different template, 0 unsafe writes. FUZZ_N=200 for more seeds (default 25).
import { describe, it, expect } from 'vitest';
import { modelOfBuffer } from '../src/main/bookModel';
import { Workbook } from '../src/main/xlsx';
import { safeWrite, mergeOurs, oursKey, type PlannedWrite } from '../src/main/safeWrite';
import { detectBook } from '../src/shared/shape';
import { applyProfile, fingerprintOf, learnedNames, lexiconFor, matchFingerprint, profileOf, setByUser, ignoreMark, teach, sanitizeProfiles, PROFILE_VERSION } from '../src/shared/tplProfile';
import { readRoster, countKinds } from '../src/shared/rosterRead';
import { migrateSettings, DEFAULT_SETTINGS } from '../src/shared/domain';
import { buildLexicon } from '../src/shared/lexicon';
import { KINDS, genMock, genRosterEdge, modifyModel, movedItem, conceptSet, type Mod } from './mockgen';
import { rng, int, chance, pick } from './tplgen';

const N = Number(process.env.FUZZ_N || 25);
const PK = KINDS.filter(k => k !== 'hkal-countifs');      // the profile tests use files whose cells do not count another sheet

describe('template profile', () => {
  const tab: Record<string, { found: number; missing: number; wrong: number; minScore: number }> = {};
  for (const kind of PK) {
    it(kind + ': a modified copy of the same template is found again x' + N, async () => {
      const t = (tab[kind] = { found: 0, missing: 0, wrong: 0, minScore: 1 });
      for (let seed = 1; seed <= N; seed++) {
        const m = await genMock(kind, seed); const sheets = await modelOfBuffer(m.buf);
        const shape = detectBook({ sheets });
        const truth = m.items.filter(i => (i.what === 'col' || i.what === 'row') && typeof i.concept === 'string');
        const p = profileOf(shape, kind === 'roster' ? 'roster' : kind === 'weapons' ? 'weapons' : kind === 'service-list' ? 'services' : kind === 'hkal' ? 'hkal' : 'hkai',
          { accept: e => truth.some(i => i.sheet === e.sheet && i.what === e.type && (e.type === 'col' ? i.c === e.c : i.r === e.r) && i.concept === e.concept) });
        // same copy first: everything is found where it was
        const same = applyProfile(sheets, p);
        expect(same.match.ok, kind + ' ' + seed + ' same file').toBe(true);
        // the modified copy
        const rg = rng(seed * 31 + 7); const main = shape.sheets.find(s => s.regions.length)?.name || sheets[0].name;
        const cs = truth.filter(i => i.sheet === main && i.c != null).map(i => i.c!); const cMax = cs.length ? Math.max(...cs) : 0;
        // the header row is right above the first data row (or is the grid's header); the new column sits right next to the table
        const geom = m.items.find(i => i.sheet === main && (i.geom === 'first' || i.geom === 'header'));
        const hdrRow = geom ? (geom.geom === 'first' ? Number(geom.value) - 1 : Number(geom.value)) : 0;
        const mod: Mod = { sheet: main, rowAt: 0, rows: int(rg, 1, 6), colAt: 0, cols: int(rg, 1, 2), ...(truth.some(i => i.shape === 'list') && chance(rg, 0.7) ? { extra: { r: Math.max(0, hdrRow), c: cMax + 1, text: 'Επιπλέον στήλη' } } : {}), ...(chance(rg, 0.6) ? { rename: 'Νέο ' + seed } : {}) };
        const a = applyProfile(modifyModel(sheets, mod), p);
        t.minScore = Math.min(t.minScore, a.match.score);
        expect(a.match.ok, kind + ' ' + seed + ' modified score ' + a.match.score + ' ' + a.match.missing.join(',')).toBe(true);
        for (const f of a.found) {
          const it = truth.find(i => i.sheet === f.el.sheet && i.what === f.el.type && (f.el.type === 'col' ? i.c === f.el.c : i.r === f.el.r));
          if (!it) continue;
          const mv = movedItem(it, mod);
          const ok = (f.el.type === 'col' ? f.c === mv.c : f.r === mv.r) && f.sheet === (mod.sheet === f.el.sheet && mod.rename ? mod.rename : f.el.sheet);
          if (ok) t.found++; else { t.wrong++; }
        }
        t.missing += a.missing.length + a.ambiguous.length;
      }
      expect(tab[kind].wrong, 'elements found in the wrong place').toBe(0);
      expect(tab[kind].found / Math.max(1, tab[kind].found + tab[kind].missing)).toBeGreaterThan(0.8);
    }, 600000);
  }
  it('a different template never matches', async () => {
    const prints = new Map<string, { fp: ReturnType<typeof fingerprintOf>; set: Set<string> }>();
    const S = Math.min(N, 10);
    for (const kind of PK) for (let seed = 1; seed <= S; seed++) {
      const m = await genMock(kind, seed); prints.set(kind + seed, { fp: fingerprintOf(detectBook({ sheets: await modelOfBuffer(m.buf) })), set: conceptSet(m.items) });
    }
    let pairs = 0, hi = 0, lo = 1, same = 1;
    const bad: string[] = [];
    for (const [ka, a] of prints) for (const [kb, b] of prints) {
      const inter = [...a.set].filter(x => b.set.has(x)).length; const jac = inter / Math.max(1, new Set([...a.set, ...b.set]).size);
      const res = matchFingerprint(a.fp, b.fp);
      if (ka === kb) { same = Math.min(same, res.score); continue; }
      if (ka.replace(/\d+$/, '') === kb.replace(/\d+$/, '') || jac >= 0.6) continue;     // same kind (optional columns only) or nearly the same concepts: not different templates
      pairs++; hi = Math.max(hi, res.score); lo = Math.min(lo, res.score);
      if (res.ok) bad.push(ka + ' vs ' + kb + ' score ' + res.score + ' jaccard ' + jac.toFixed(2));
    }
    console.log('\ndifferent-template pairs: ' + pairs + '  highest score ' + hi + '  (match from 0.72)  same-file lowest ' + same);
    expect(bad).toEqual([]);
    expect(pairs).toBeGreaterThan(20);
  }, 600000);
  it('unit words become sure names for that unit only; ignore marks and user choices are found again', async () => {
    const m = await genMock('roster', 3); const sheets = await modelOfBuffer(m.buf); const shape = detectBook({ sheets });
    const sh = shape.sheets.find(s => s.regions.some(r => r.type === 'list'))!; const reg = sh.regions.find(r => r.type === 'list')!;
    const unk = reg.type === 'list' ? reg.cols.find(c => c.match.confidence === 'unknown' && c.leaf) : undefined;
    let p = profileOf(shape, 'roster');
    if (unk) {
      p = setByUser(p, shape, { sheet: sh.name, type: 'col', c: unk.c, concept: 'person:phone' });
      p = ignoreMark(p, shape, sh.name, 'col', unk.c);
      expect(buildLexicon({ learned: learnedNames(p) }).match(unk.leaf, { kinds: ['person'] }).confidence).toBe('sure');
      expect(buildLexicon().match(unk.leaf, { kinds: ['person'] }).confidence).not.toBe('sure');   // other units are unaffected
      const a = applyProfile(modifyModel(sheets, { sheet: sh.name, rowAt: 0, rows: 3, colAt: 0, cols: 1 }), p);
      expect(a.found.some(f => f.el.how === 'user' && f.dc === 1 && f.dr === 0)).toBe(true);
      expect(a.ignored.length).toBe(1);
    }
    expect(lexiconFor(teach(p, 'ΧΧΧ ΛΕΞΗ', 'person:room')).match('ΧΧΧ ΛΕΞΗ').concept).toBe('person:room');
  });
  it('settings: absent = [], damaged or newer profiles are dropped, old state files migrate unchanged', async () => {
    expect(sanitizeProfiles(undefined)).toEqual([]);
    expect(sanitizeProfiles([{ id: 'x' }, 5, null, { v: PROFILE_VERSION + 1, id: 'n', kind: 'roster', fp: {} }])).toEqual([]);
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); delete old.tplProfiles;
    expect(migrateSettings(old).tplProfiles).toBeUndefined();
    const m = await genMock('weapons', 2); const p = profileOf(detectBook({ sheets: await modelOfBuffer(m.buf) }), 'weapons');
    const back = migrateSettings({ ...old, tplProfiles: JSON.parse(JSON.stringify([p, { junk: 1 }])) }).tplProfiles!;
    expect(back.length).toBe(1); expect(back[0]).toEqual(p);
  });
  it('report', () => {
    console.log('\nprofile round trip (moved table, rows/columns added, sheet renamed)\n' + 'kind'.padEnd(14) + 'found'.padStart(7) + 'missing'.padStart(9) + 'WRONG'.padStart(7) + 'min score'.padStart(11) + '\n'
      + Object.entries(tab).map(([k, t]) => k.padEnd(14) + String(t.found).padStart(7) + String(t.missing).padStart(9) + String(t.wrong).padStart(7) + String(t.minScore).padStart(11)).join('\n'));
  });
});

describe('safe write layer', () => {
  it('never writes into a formula, a label or a merge child x' + N * 2, async () => {
    const cnt: Record<string, number> = { written: 0, formula: 0, label: 0, 'merge-child': 0, outside: 0, conflict: 0, 'no-sheet': 0 }; let unsafe = 0; let plans = 0;
    for (const kind of PK) for (let seed = 1; seed <= N * 2 / PK.length + 1; seed++) {
      const mk = await genMock(kind, seed); const book = await modelOfBuffer(mk.buf); const wb = await Workbook.open(mk.buf);
      const s0 = book[0]; const g = rng(seed * 13 + 5); plans++;
      const rows = s0.rows.length + 6, cols = Math.max(...s0.rows.map(r => r.length), 4) + 6;
      const plan: PlannedWrite[] = Array.from({ length: 120 }, () => ({ sheet: chance(g, 0.03) ? 'ΔΕΝ ΥΠΑΡΧΕΙ' : s0.name, r: int(g, 0, rows), c: int(g, 0, cols), value: chance(g, 0.3) ? int(g, 1, 99) : pick(g, ['ελεγχος', 'Ωραίο κείμενο', 'ΑΒΓ']) }));
      const dry = await safeWrite(wb, plan, { dryRun: true });
      const rep = await safeWrite(wb, plan);
      expect(rep.written.map(w => w.ref)).toEqual(dry.written.map(w => w.ref)); expect(rep.refused.length).toBe(dry.refused.length);
      for (const w of rep.written) {
        const k = w.r + ':' + w.c;
        const inMerge = s0.merges.find(m => w.r >= m.r1 && w.r <= m.r2 && w.c >= m.c1 && w.c <= m.c2);
        const v = s0.rows[w.r]?.[w.c];
        if (s0.fx.has(k) || (typeof v === 'string' && v.trim() !== '') || (inMerge && (inMerge.r1 !== w.r || inMerge.c1 !== w.c))) unsafe++;
        if (typeof w.value === 'string' && w.value !== w.value.toUpperCase()) unsafe++;
      }
      cnt.written += rep.written.length; for (const f of rep.refused) cnt[f.reason]++;
      // the saved file keeps every formula, label and merge as it was
      const after = (await modelOfBuffer(await wb.save()))[0];
      for (const k of s0.fx) if (!after.fx.has(k)) unsafe++;
      for (const m of s0.merges) if (!after.merges.some(x => x.r1 === m.r1 && x.c1 === m.c1 && x.r2 === m.r2 && x.c2 === m.c2)) unsafe++;
      s0.rows.forEach((row, r) => (row || []).forEach((v, c) => { if (typeof v === 'string' && v.trim() && !s0.fx.has(r + ':' + c) && after.rows[r]?.[c] !== v) unsafe++; }));
    }
    console.log('\nsafe write: ' + plans + ' random plans · ' + Object.entries(cnt).map(([k, v]) => k + ' ' + v).join(' · ') + ' · UNSAFE ' + unsafe);
    expect(unsafe).toBe(0); expect(cnt.written).toBeGreaterThan(0); expect(cnt.formula + cnt.label + cnt['merge-child']).toBeGreaterThan(0);
  }, 600000);
  it('our own cells can be written again; labels never; text is in capitals; styles stay', async () => {
    const mk = await genMock('roster', 4); const wb = await Workbook.open(mk.buf); const book = await modelOfBuffer(mk.buf); const sh = book[0];
    const sheetName = sh.name; const label = (() => { for (let r = 0; r < sh.rows.length; r++) for (let c = 0; c < (sh.rows[r] || []).length; c++) if (typeof sh.rows[r][c] === 'string' && sh.rows[r][c] !== '') return { r, c }; return { r: 0, c: 0 }; })();
    const free = { r: sh.rows.length + 1, c: 0 };
    const r1 = await safeWrite(wb, [{ sheet: sheetName, ...free, value: 'ένα' }, { sheet: sheetName, ...label, value: 'Χ' }]);
    expect(r1.written.map(w => w.value)).toEqual(['ΕΝΑ']); expect(r1.refused[0].reason === 'label' || r1.refused[0].reason === 'merge-child').toBe(true);
    const ours = mergeOurs({}, r1);
    const r2 = await safeWrite(wb, [{ sheet: sheetName, ...free, value: 'δύο' }]); expect(r2.refused[0].reason).toBe('label');   // not in the list: it looks like a label
    const r3 = await safeWrite(wb, [{ sheet: sheetName, ...free, value: 'δύο' }], { ours }); expect(r3.written.length).toBe(1);
    expect(oursKey(sheetName, free.r, free.c) in ours).toBe(true);
  });
});

describe('roster reading edge cases', () => {
  it('reads every person, the kind by rank, groups; asks for unknown ranks x' + N * 2, async () => {
    let people = 0, read = 0, wrong = 0, asked = 0, vacant = 0; const modes: Record<string, number> = {}; const bad: string[] = [];
    for (let seed = 1; seed <= N * 2; seed++) {
      const e = await genRosterEdge(seed); const sheet = (await modelOfBuffer(e.buf))[0]; const x = readRoster(sheet);
      modes[e.mode] = (modes[e.mode] || 0) + 1; people += e.people.length; vacant += e.vacant;
      const byRow = new Map(x.people.map(p => [p.r, p]));
      for (const t of e.people) {
        const p = byRow.get(t.r);
        if (!p) { bad.push('seed ' + seed + ' (' + e.mode + ', ' + e.desc.join('/') + ') row ' + t.r + ' not read'); continue; }
        read++;
        if (p.kind !== t.kind) { wrong++; bad.push('seed ' + seed + ' row ' + t.r + ' kind ' + p.kind + ' expected ' + t.kind + ' (' + p.rank + ')'); }
        if ((p.asm || '') !== t.asm) { wrong++; bad.push('seed ' + seed + ' row ' + t.r + ' asm'); }
        if ((p.group || '') !== (t.group || '')) { wrong++; bad.push('seed ' + seed + ' row ' + t.r + ' group ' + p.group + ' vs ' + t.group); }
        if (p.kind === 'ask') asked++;
      }
      if (x.people.length !== e.people.length) bad.push('seed ' + seed + ' read ' + x.people.length + ' of ' + e.people.length + ' (' + e.desc.join('/') + ')');
      expect(x.vacant, 'seed ' + seed).toBe(e.vacant);
      expect(x.ask.reduce((a, k) => a + k.rows.length, 0)).toBe(x.people.filter(p => p.kind === 'ask').length);
    }
    console.log('\nroster edge cases: ' + N * 2 + ' files · people ' + people + ' · read ' + read + ' · wrong ' + wrong + ' · asked (ambiguous/unknown rank) ' + asked + ' · positions without name ' + vacant + ' · name layouts ' + JSON.stringify(modes));
    expect(bad.slice(0, 8)).toEqual([]);
  }, 600000);
  it('the user answer settles an asked rank', async () => {
    const e = await genRosterEdge(5); const sheet = (await modelOfBuffer(e.buf))[0]; const x = readRoster(sheet);
    const a = x.ask[0]; if (!a) return;
    const y = readRoster(sheet, { answers: { [a.rank]: 'soldier' } });
    expect(y.people.filter(p => p.rank === a.rank).every(p => p.kind === 'soldier')).toBe(true);
    expect(countKinds(y).soldier).toBeGreaterThan(countKinds(x).soldier);
  });
});
