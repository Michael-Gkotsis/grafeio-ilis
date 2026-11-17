// The mapping screen «Πρότυπο μονάδας» without the screen: the model of a unit's own ΗΚΑΙ/ΗΚΑΛ template, simulated user choices, the command that saves
// the profile (and what «Δημιουργία» adds to the settings), learned words on the next detection, and the real export entry (fillHkai) on random unit templates.
import { describe, it, expect } from 'vitest';
import { modelOfBuffer } from '../src/main/bookModel';
import { fillHkai } from '../src/main/exports';
import { hkaiAdaptive, matchProfile, profileFor, tryFill, restoreCopy, modelOfFile, xlsxBuffer } from '../src/main/tplAdapt';
import { findSoffice } from '../src/main/xlsConvert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { apply } from '../src/shared/commands';
import { buildTplModel, classicFits, duplicates, kindOfSettings, type Choices, type TplCreate, type TplModel } from '../src/shared/tplMap';
import { Evaluator, UNSUPPORTED } from '../src/shared/sheetEval';
import { phraseKey } from '../src/shared/lexicon';
import { profilesOf } from '../src/shared/tplProfile';
import { activePeople } from '../src/shared/rules';
import type { AppState } from '../src/shared/domain';
import { genFillMock, type FillMock } from './mockgen';

const ctx = { today: '2026-09-25', newId: (() => { let n = 0; return () => 'u' + ++n; })() };
const posts = (s: AppState) => [...new Set(activePeople(s).map(p => (p.post || '').trim()).filter(Boolean))];

// what a user does on the screen: accepts every proposal, picks the app's column for the columns the mock says are the unit's own, leaves the rest alone
function simulate(m: FillMock, model: TplModel): Choices {
  const ch: Choices = { cols: {}, rows: {}, words: {} };
  const taken = (k: string) => model.cols.some(c => c.value === k && c.state === 'sure') || Object.values(ch.cols).some(x => (x.k === 'keys' && 'state:' + x.keys[0] === k) || (x.k === 'calc' && 'calc:' + x.what === k));
  const own = (m.profile?.rules?.cols || {}) as Record<string, { t: string; keys: string[] }>;
  for (const c of model.cols) {
    if (c.state === 'sure') continue;
    const rule = own[phraseKey(c.text)];
    if (c.state === 'suggest' && taken(c.suggest)) ch.cols[c.c] = { k: 'ignore' };       // the screen refuses two columns for one state
    else if (c.state === 'suggest' && c.suggest.startsWith('state:')) ch.cols[c.c] = { k: 'keys', keys: [c.suggest.slice(6)] };
    else if (c.state === 'suggest' && c.suggest.startsWith('calc:')) ch.cols[c.c] = { k: 'calc', what: c.suggest.slice(5) };
    else if (rule?.t === 'state' && !taken('state:' + rule.keys[0])) ch.cols[c.c] = { k: 'keys', keys: rule.keys };
    else ch.cols[c.c] = { k: 'ignore' };
  }
  for (const r of model.rows) {
    if (r.state === 'sure') continue;
    ch.rows[r.r] = r.state === 'suggest' ? { k: 'row', key: r.suggest } : { k: 'ignore' };
  }
  expect(duplicates(model, ch)).toEqual([]);
  return ch;
}
const adopt = (s: AppState, buf: Buffer, sheets: Awaited<ReturnType<typeof modelOfBuffer>>, choices: Choices, creates: TplCreate[] = []) => {
  const { profile, state } = profileFor(sheets, s, { choices, creates });
  return { profile, state: apply(s, { t: 'adaptTpl', profile, create: creates, text: 'δοκιμή' }, ctx).state, planned: state };
};

describe('command adaptTpl', () => {
  it('saves the profile, replaces the same id, and the creations add the right entries once', async () => {
    const m = await genFillMock(3, { own: false, countifs: false, ownCols: 0, unknownRow: false });
    const sheets = await modelOfBuffer(m.buf);
    const model = buildTplModel(sheets, { settings: m.s.settings, kind: kindOfSettings(m.s.settings), posts: posts(m.s) });
    const { profile } = adopt(m.s, m.buf, sheets, simulate(m, model));
    const create: TplCreate[] = [{ k: 'hkRow', name: 'Αντισυνταγματάρχες', grp: 'off', after: 'Επίλαρχοι' }, { k: 'leaveKind', name: 'Καραντίνα ΧΧ', col: 'allh' }];
    let st = apply(m.s, { t: 'adaptTpl', profile, create, text: 'δοκιμή' }, ctx).state;
    expect(profilesOf(st.settings).map(p => p.id)).toEqual([profile.id]);
    expect(st.settings.lists?.hkRows?.map(x => x.name)).toContain('Αντισυνταγματάρχες');
    expect(st.settings.lists?.leaveKinds?.add?.find(x => x.name === 'Καραντίνα ΧΧ')?.col).toBe('allh');
    // again: nothing is doubled, the profile of the same id is replaced
    st = apply(st, { t: 'adaptTpl', profile: { ...profile, name: 'Άλλο όνομα' }, create, text: 'δοκιμή' }, ctx).state;
    expect(profilesOf(st.settings)).toHaveLength(1); expect(profilesOf(st.settings)[0].name).toBe('Άλλο όνομα');
    expect(st.settings.lists?.hkRows?.filter(x => x.name === 'Αντισυνταγματάρχες')).toHaveLength(1);
    expect(st.settings.lists?.leaveKinds?.add?.filter(x => x.name === 'Καραντίνα ΧΧ')).toHaveLength(1);
    // a broken profile is refused, the state stays
    expect(() => apply(m.s, { t: 'adaptTpl', profile: { id: 3 } as never, text: 'x' }, ctx)).toThrow();
  });
});

describe('learned words', () => {
  it('a column the user mapped is «σίγουρο» on the next detection, also in a changed copy of the file', async () => {
    const m = await genFillMock(11, { own: false, countifs: false, ownCols: 2, totals: 'formulas', typo: false });
    const sheets = await modelOfBuffer(m.buf); const kind = kindOfSettings(m.s.settings);
    const first = buildTplModel(sheets, { settings: m.s.settings, kind, posts: posts(m.s) });
    const unknown = first.cols.filter(c => c.state === 'unknown' && c.text);
    expect(unknown.length).toBeGreaterThan(0);
    const ch: Choices = { cols: {}, rows: {}, words: {} }; for (const c of unknown) ch.cols[c.c] = { k: 'keys', keys: ['fyl'] };
    // only the first one (a second column with the same state is refused by the screen); the rest stay as they were
    const one = unknown[0]; ch.cols = { [one.c]: { k: 'keys', keys: ['fyl'] } };
    const { state } = adopt(m.s, m.buf, sheets, ch);
    const p = profilesOf(state.settings)[0];
    expect(p.words[phraseKey(one.text)]).toBe('hkcol:fyl');
    const again = buildTplModel(sheets, { settings: state.settings, kind, profile: p, posts: posts(state) });
    const v = again.cols.find(c => c.c === one.c)!;
    expect(v.state).toBe('sure'); expect(v.user).toBe(true); expect(v.value).toBe('state:fyl');
    expect(again.choices.cols[one.c]).toEqual({ k: 'keys', keys: ['fyl'] });
    // the file comes back with a new row on top and a new column on the left
    const moved = sheets.map(s => ({ ...s, rows: [[], ...s.rows.map(r => [null, ...(r || [])])], fx: new Set([...s.fx].map(k => { const [r, c] = k.split(':').map(Number); return (r + 1) + ':' + (c + 1); })), formulas: new Map([...s.formulas].map(([k, f]) => { const [r, c] = k.split(':').map(Number); return [(r + 1) + ':' + (c + 1), f] as [string, string]; })), merges: s.merges.map(x => ({ r1: x.r1 + 1, r2: x.r2 + 1, c1: x.c1 + 1, c2: x.c2 + 1 })) }));
    const hit = matchProfile(moved, state, [p]); expect(hit).not.toBeNull();
    const m2 = buildTplModel(moved, { settings: state.settings, kind, profile: p, posts: posts(state) });
    expect(m2.cols.find(c => c.text === one.text)?.state).toBe('sure');
  });
});

// ------------------------------------------------------------------ end to end: detection → the user's choices → profile → the real export entry
const N = Number(process.env.FUZZ_N || 24);
describe('ΗΚΑΙ output through fillHkai with a saved profile', () => {
  const stats = { adaptive: 0, classic: 0, cells: 0 };
  it('numbers equal hkaiCounts, nothing unsafe is written; templates the old path fills keep it, byte for byte (x' + N + ')', async () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= N; seed++) {
      const m = await genFillMock(seed);
      const sheets = await modelOfBuffer(m.buf); const kind = kindOfSettings(m.s.settings);
      const model = buildTplModel(sheets, { settings: m.s.settings, kind, posts: posts(m.s) });
      const { state } = adopt(m.s, m.buf, sheets, simulate(m, model));
      const fits = classicFits(sheets, state.settings, m.sheet).fits;
      const out = await fillHkai(m.buf, state, m.date, {}).catch(e => e as Error);
      if (out instanceof Error) { if (!fits) bad.push('seed ' + seed + ' adaptive path threw: ' + out.message); else stats.classic++; continue; }
      const direct = await hkaiAdaptive(m.buf, state, m.date, {});
      if (fits) {
        // the old path: the very same bytes as without any profile
        const plain = await fillHkai(m.buf, { ...state, settings: { ...state.settings, tplProfiles: undefined } }, m.date, {}).catch(() => null);
        if (!direct && plain && !Buffer.from(out.data).equals(Buffer.from(plain.data))) bad.push('seed ' + seed + ' classic output changed by an unused profile');
        if (direct) bad.push('seed ' + seed + ' adaptive although the old path fits');
        stats.classic++; continue;
      }
      if (!direct) { bad.push('seed ' + seed + ' not adaptive although the old path does not fit: ' + classicFits(sheets, state.settings, m.sheet).why.join('; ')); continue; }
      stats.adaptive++;
      expect(out.name).toMatch(/\.xlsx$/); expect(out.warnings.length).toBeGreaterThan(0);
      const after = await modelOfBuffer(Buffer.from(out.data)); const before = sheets;
      const fa = after.find(x => x.name === m.sheet)!, fb = before.find(x => x.name === m.sheet)!; const ev = new Evaluator(after);
      const warned = out.warnings.some(w => /Έλεγχος με τους τύπους/.test(w));
      for (const [k, truth] of m.truth) {
        const [r, c] = k.split(':').map(Number); stats.cells++;
        if (fa.fx.has(k)) { const got = ev.cell(fa, r, c); const g = got == null || got === '' ? 0 : got; if (got !== UNSUPPORTED && g !== truth && !warned) bad.push('seed ' + seed + ' ' + k + ' formula shows ' + String(g) + ' truth ' + truth + ' and nothing was said'); continue; }
        const v = fa.rows[r]?.[c]; const was = fb.rows[r]?.[c];
        if (v === was && (v == null || v === '' || v === 0 ? 0 : Number(v)) !== truth) continue;       // not written: reported by the engine (unmapped / skipped)
        if ((v == null || v === '' ? 0 : Number(v)) !== truth) bad.push('seed ' + seed + ' ' + k + ' wrote ' + v + ' truth ' + truth);
      }
      // the columns the user left alone are not touched, formulas and labels stay
      for (const u of m.unmappedCols) for (let r = 0; r < fb.rows.length; r++) if (fb.rows[r]?.[u.c] !== fa.rows[r]?.[u.c]) bad.push('seed ' + seed + ' unmapped column ' + u.text + ' changed at row ' + r);
      for (const [fk, f] of fb.formulas) if (fa.formulas.get(fk) !== f) bad.push('seed ' + seed + ' formula ' + fk + ' changed');
    }
    // eslint-disable-next-line no-console
    console.log('adaptive:', stats.adaptive, 'old path:', stats.classic, 'cells compared:', stats.cells);
    expect(bad.slice(0, 8)).toEqual([]);
    expect(stats.adaptive).toBeGreaterThan(0);
  }, 600000);
});

describe('the bundled templates keep the old path', () => {
  it('hkai.xlsx with a saved profile: understood completely, the very same bytes as without a profile', async () => {
    const fs = await import('fs'); const path = await import('path');
    const { fakeState } = await import('./fixtures');
    let s = { ...fakeState(60), settings: { ...fakeState(60).settings, hdLeft: true } } as AppState;
    s = apply(s, { t: 'autofill', date: '2026-10-12' }, { today: '2026-10-12', newId: () => 'q' }).state;
    for (const name of ['hkai.xlsx']) {
      const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', name)); const sheets = await modelOfBuffer(buf);
      const model = buildTplModel(sheets, { settings: s.settings, kind: 'hkai' });
      expect(model.count.unknown + model.count.suggest).toBe(0);
      expect(model.lost).toBe(0); expect(model.driven).toBeNull();
      expect(classicFits(sheets, s.settings).fits).toBe(true);
      const { state } = adopt(s, buf, sheets, { cols: {}, rows: {}, words: {} });
      expect(profilesOf(state.settings)).toHaveLength(1);
      const a = await fillHkai(buf, s, '2026-10-12'); const b = await fillHkai(buf, state, '2026-10-12');
      expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true); expect(b.warnings).toEqual(a.warnings);
      expect(await hkaiAdaptive(buf, state, '2026-10-12', {})).toBeNull();
    }
  });
});

describe('the trial and the copy with the formulas back', () => {
  it('shows today\'s numbers in the unit\'s own table, lists the refused cells and the unmapped columns, restores formulas only into a copy', async () => {
    const m = await genFillMock(5, { own: false, countifs: false, totals: 'numbers', ownCols: 1, typo: false });
    const sheets = await modelOfBuffer(m.buf); const model = buildTplModel(sheets, { settings: m.s.settings, kind: kindOfSettings(m.s.settings), posts: posts(m.s) });
    const choices = simulate(m, model);
    const t = await tryFill(sheets, m.buf, m.s, m.date, { choices, sheet: m.sheet });
    expect(t.front).toBe(m.sheet); expect(t.rows.length).toBeGreaterThan(5); expect(t.head.length).toBeGreaterThan(5);
    expect(t.fixes.length).toBeGreaterThan(0);                                           // the totals lost their formulas
    // the numbers of the table are the truth wherever the app wrote them
    for (const r of t.rows) r.cells.forEach((c, i) => {
      const col = t.head[i].ref; void col;
      if (c.how === 'written' && c.v != null && typeof c.v !== 'number') throw new Error('a written cell holds ' + c.v);
    });
    expect(t.written).toBeGreaterThan(0);
    const before = Buffer.from(m.buf);
    const copy = await restoreCopy(sheets, m.buf, m.s, { choices, sheet: m.sheet });
    expect(copy.applied).toBeGreaterThan(0); expect(Buffer.from(m.buf).equals(before)).toBe(true);   // the input is untouched, the copy is a new buffer
    const after = await modelOfBuffer(copy.buffer); const was = sheets.find(x => x.name === m.sheet)!; const now = after.find(x => x.name === m.sheet)!;
    expect(now.formulas.size).toBeGreaterThan(was.formulas.size);
    for (const [k, f] of was.formulas) expect(now.formulas.get(k)).toBe(f);                // the formulas the file had are the same
  });
  it('the model of a file on disk (modelOfFile) and of an .xls through the converter', async () => {
    const m = await genFillMock(8, { countifs: false });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-tm-'));
    try {
      const f = path.join(dir, 'ΗΚΑΙ ΜΟΝΑΔΑΣ.xlsx'); fs.writeFileSync(f, m.buf);
      const r = await modelOfFile(f, m.s, m.date, m.sheet);
      expect(r.model.file).toBe(f); expect(r.model.cols.length).toBeGreaterThan(5); expect(r.model.sheet).toBe(m.sheet);
      const so = findSoffice();
      if (so) {
        execFileSync(so, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xls:MS Excel 97', '--outdir', dir, f], { timeout: 120000, stdio: 'ignore' });
        const x = path.join(dir, 'ΗΚΑΙ ΜΟΝΑΔΑΣ.xls'); const orig = fs.readFileSync(x);
        const buf = await xlsxBuffer(x); expect((await modelOfBuffer(buf)).length).toBeGreaterThan(0);
        expect(fs.readFileSync(x).equals(orig)).toBe(true);                               // the original is never changed
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 180000);
});

describe('«Δημιουργία»', () => {
  it('a row the app lacks becomes a row of the ΗΚΑΙ and the totals that sum it are written again; a new status counts in the column chosen', async () => {
    const m = await genFillMock(2, { unknownRow: true, own: false, countifs: false, originSplit: false, rankSplit: false, totals: 'numbers', ownCols: 0, dropRows: false });
    const sheets = await modelOfBuffer(m.buf); const kind = kindOfSettings(m.s.settings);
    const model = buildTplModel(sheets, { settings: m.s.settings, kind });
    const row = model.rows.find(r => r.text === 'Επικουρικοί')!; expect(row.state).toBe('unknown');
    const base = simulate(m, model); delete base.rows[row.r];
    const skipped = (await tryFill(sheets, m.buf, m.s, m.date, { choices: { ...base, rows: { ...base.rows, [row.r]: { k: 'ignore' } } }, sheet: m.sheet })).rows.filter(r => r.skipped);
    expect(skipped.length).toBeGreaterThan(0);                                              // ignored with data: the totals that add it up are not written
    const create: TplCreate[] = [{ k: 'hkRow', name: 'Επικουρικοί', grp: 'nco', after: 'Δεκανείς' }];
    const choices: Choices = { ...base, rows: { ...base.rows, [row.r]: { k: 'row', key: 'Επικουρικοί' } } };
    const t = await tryFill(sheets, m.buf, m.s, m.date, { choices, creates: create, sheet: m.sheet });
    expect(t.rows.filter(r => r.skipped)).toEqual([]);
    expect(t.rows.find(r => r.label === 'Επικουρικοί')).toBeTruthy();
    // saved through the command: the row is in the unit's own rows, the profile maps it
    const { profile } = profileFor(sheets, m.s, { choices, creates: create, sheet: m.sheet });
    const st = apply(m.s, { t: 'adaptTpl', profile, create, text: 'δοκιμή' }, ctx).state;
    expect(st.settings.lists?.hkRows?.map(x => x.name)).toContain('Επικουρικοί');
    expect(Object.keys(profilesOf(st.settings)[0].rules?.rows || {})).toContain(phraseKey('Επικουρικοί'));
    const out = await hkaiAdaptive(m.buf, st, m.date, {}); expect(out).not.toBeNull();
  });
});
