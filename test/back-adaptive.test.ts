// Back side + title/date/signatures of the adaptive ΗΚΑΙ/ΗΚΑΛ on random unit templates (test/backgen.ts). Truth: the lines the app produces (hkaiText builders), where each
// section's rows are, which cells must never change. Rules kept:
//   0 lines in a wrong section        the text of every section's rows = exactly the lines of its category (nothing of another category)
//   0 writes into decision / ΕΛΑΒΑ ΓΝΩΣΗ / label / example cells, 0 outside the rows of the sections
//   every line that is not placed is REPORTED (no section in the form, does not fit, not a sure section)
//   title / date / signature: only the blank part is replaced, the words around it are untouched
// FUZZ_N=200 npx vitest run test/back-adaptive.test.ts for more seeds (default 24). The report tables are printed at the end.
import { describe, it, expect } from 'vitest';
import { modelOfBuffer } from '../src/main/bookModel';
import { fillAdaptive, type FillReport } from '../src/main/fillAdaptive';
import { fillHkai } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import fs from 'fs';
import { hkaiAdikLines, hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines, lineText } from '../src/shared/hkaiText';
import { hkWho } from '../src/shared/punish';
import { hkDate } from '../src/shared/dates';
import { upper } from '../src/shared/text';
import type { SecId } from '../src/shared/backForm';
import type { SheetModel } from '../src/shared/sheetModel';
import type { TplProfile } from '../src/shared/tplStore';
import { genBackMock, type BackMock } from './backgen';

const N = Number(process.env.FUZZ_N || 24);
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ', 'η', 'θ'];
const norm = (t: string) => t.replace(/[\s-]+/g, '').toUpperCase();
const cellText = (m: SheetModel | undefined, r: number, c: number) => { const v = m?.rows[r]?.[c]; return v == null ? '' : String(v); };
const key = (n: string, r: number, c: number) => n + '|' + r + ':' + c;

interface Expect { cat: SecId; entries: string[] }
function expected(m: BackMock): Expect[] {
  const { s, date: d, flags } = m;
  const MON = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
  const dateIn = (t: string) => {
    if (flags.dateFmt === 'hk') return t;
    return t.replace(new RegExp('(\\d{2}) (' + MON.join('|') + ') (\\d{2})', 'g'), (_x: string, dd: string, mo: string, yy: string) => dd + '/' + String(MON.indexOf(mo) + 1).padStart(2, '0') + '/' + (flags.dateFmt === 'slash4' ? '20' + yy : yy));
  };
  const number = (i: number) => (flags.num === 'greek' ? GREEK[i] : String(i + 1)) + '.';
  const conv = (ls: ReturnType<typeof hkaiEgrLines>): string[] => { let n = 0; return ls.map(l => { const t = lineText(l); return /^\d+\.\s/.test(t) ? number(n++) + ' ' + t.replace(/^\d+\.\s+/, '') : t; }).map(dateIn); };
  const person = flags.line === 'person';
  // in the person format only the part after the first colon is the same sentence: compared by that tail
  const out: Expect[] = [
    { cat: 'enroll', entries: conv(hkaiEgrLines(s, d)) }, { cat: 'delete', entries: conv(hkaiDiaLines(s, d)) }, { cat: 'leaves', entries: conv(hkaiLeaveLines(s, d)) },
    { cat: 'punish', entries: conv(hkaiPunLines(s, d)) }, { cat: 'requests', entries: conv(hkaiReqLines(s, d)) }
  ];
  const nos = s.statuses.filter(x => x.type === 'NOS' && x.from === d && s.people.find(p => p.id === x.pid)?.active).map(x => upper(hkWho(s.people.find(p => p.id === x.pid)!)));
  const misc: string[] = []; let k = 0;
  // Άγνοια / Λιποταξία / Αδικ. απουσία (17/11, #352) come first in ΛΟΙΠΑ, numbered with the hospital lines (sweep 17/11: the generator now makes them, FUZZ_ADIK=1)
  for (const l of hkaiAdikLines(s, d)) { const t = lineText(l).replace(/^\d+\.\s+/, ''); const i = t.indexOf(': '); misc.push(dateIn(number(k++) + ' ' + (person && i > 0 ? t.slice(0, i) + ' : ' + t.slice(i + 2) : t))); }
  for (const w of nos) misc.push(dateIn(number(k++) + ' ' + w + (person ? ' : ' : ': ') + 'ΕΙΣΗΧΘΗ ΣΕ ΝΟΣΟΚΟΜΕΙΟ ΤΗΝ ' + hkDate(d) + '.'));
  const loi = s.hkaiManual?.[d]?.text?.loi?.trim(); if (loi) misc.push(loi);
  out.push({ cat: 'misc', entries: misc });
  void person;
  return out;
}

interface Run { m: BackMock; report: FillReport; before: SheetModel[]; after: SheetModel[]; warnings: string[] }
const runs: Run[] = [];
describe('back side and loose texts on random unit templates', () => {
  it('fills x' + N, async () => {
    for (let seed = 1; seed <= N; seed++) {
      const m = await genBackMock(seed);
      const base: TplProfile = m.fill.profile ?? { v: 1, id: 'hkai-1', kind: m.flags.lochos ? 'hkal' : 'hkai', fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [] };
      const profile = { ...base, back: { num: m.flags.num, date: m.flags.dateFmt, line: m.flags.line } };
      const before = await modelOfBuffer(m.buf);
      const { buffer, report } = await fillAdaptive(m.buf, m.s, m.date, profile);
      runs.push({ m, report, before, after: await modelOfBuffer(buffer), warnings: report.warnings });
    }
    expect(runs.length).toBe(N);
  }, 900000);

  it('0 writes into decision / ΕΛΑΒΑ ΓΝΩΣΗ / label / example cells; only the rows of the sections change', () => {
    const bad: string[] = [];
    for (const { m, before, after } of runs) {
      for (const k of m.forbidden) {
        const [n, rc] = k.split('|'); const [r, c] = rc.split(':').map(Number);
        const b = before.find(x => x.name === n), a = after.find(x => x.name === n);
        if (cellText(b, r, c) !== cellText(a, r, c)) bad.push('seed ' + m.seed + ' ' + k + ' «' + cellText(b, r, c) + '» → «' + cellText(a, r, c) + '»');
      }
      const rows = new Set<string>(); for (const x of m.sections) for (const q of x.rows) rows.add(key(m.back, q.r, q.c));
      for (const b of before) {
        if (b.name === m.fill.sheet) continue;
        const a = after.find(x => x.name === b.name)!;
        for (let r = 0; r < Math.max(b.rows.length, a.rows.length); r++) for (let c = 0; c < Math.max(b.rows[r]?.length ?? 0, a.rows[r]?.length ?? 0); c++) {
          if (cellText(b, r, c) === cellText(a, r, c)) continue;
          const k = key(b.name, r, c);
          if (rows.has(k) || m.allowed.has(k)) continue;
          bad.push('seed ' + m.seed + ' changed ' + k + ' «' + cellText(b, r, c) + '» → «' + cellText(a, r, c).slice(0, 30) + '» · ' + m.desc[0].slice(0, 60));
        }
      }
      // the copies of the continuation sheet: the template's own cells untouched, only the free rows hold text
      const orig = before.find(x => x.name === m.cont);
      for (const p of after.filter(x => m.cont && x.name !== m.cont && x.name.startsWith(m.cont.slice(0, 20)))) {
        for (let r = 0; r < Math.max(orig!.rows.length, p.rows.length); r++) for (let c = 0; c < Math.max(orig!.rows[r]?.length ?? 0, p.rows[r]?.length ?? 0); c++) {
          if (cellText(orig, r, c) !== cellText(p, r, c) && !m.contRows.some(q => q.r === r && q.c === c)) bad.push('seed ' + m.seed + ' copy ' + p.name + ' changed ' + r + ':' + c);
        }
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('0 lines in a wrong section; every line not placed is reported', () => {
    const bad: string[] = [];
    for (const { m, after, warnings, report } of runs) {
      if (!report.front) continue;   // no ΗΚΑΙ table found: nothing is written at all (one warning)
      const back = after.find(x => x.name === m.back)!;
      const pages = m.cont ? after.filter(x => x.name !== m.cont && x.name.startsWith(m.cont!.slice(0, 20))) : [];
      for (const ex of expected(m)) {
        const target = ex.cat === 'leaves' ? (m.sections.find(x => x.id === 'leaves') ?? m.sections.find(x => x.id === 'absences')) : m.sections.find(x => x.id === ex.cat);
        if (!ex.entries.length) continue;
        if (!target) { if (!warnings.some(w => w.includes('δεν έχει ενότητα'))) bad.push('seed ' + m.seed + ' ' + ex.cat + ': no section and no warning'); continue; }
        let actual = target.rows.map(q => cellText(back, q.r, q.c)).join('\n');
        for (const p of pages) { let on = false; for (const q of m.contRows) { const t = cellText(p, q.r, q.c); if (!t) continue; if (norm(t) === norm(target.text)) { on = true; continue; } if (m.sections.some(x => norm(x.text) === norm(t))) { on = false; continue; } if (on) actual += '\n' + t; } }
        const A = norm(actual);
        if (m.flags.line === 'person' && ex.cat !== 'misc') {
          // the person format moves things around the colon: the lines are counted by their numbering
          const want = ex.entries.filter(e => /^([1-9]\d*|(?:στ|ΣΤ|[α-θΑ-Θ]|ι[α-θ]?|Ι[Α-Θ]?))\.\s/.test(e)).length;
          const labels = (actual.match(/(^|\n)\s*([1-9]\d*|(?:στ|ΣΤ|[α-θΑ-Θ]|ι[α-θ]?|Ι[Α-Θ]?))\.\s/g) || []).length;
          if (labels > want) bad.push('seed ' + m.seed + ' ' + ex.cat + ' person: more lines than the app has');
          if (labels < want && !warnings.some(w => w.includes('δεν χωράνε') && w.includes(target.text.replace(/\s+/g, ' ').trim()))) bad.push('seed ' + m.seed + ' ' + ex.cat + ' person: ' + (want - labels) + ' unplaced and not reported');
          continue;
        }
        const placed = ex.entries.filter(e => A.includes(norm(e)));
        // nothing but the lines of this category is in the section
        if (A !== norm(placed.join(''))) bad.push('seed ' + m.seed + ' ' + ex.cat + ' → ' + target.text + ': foreign text in the section · ' + A.slice(0, 50));
        if (placed.length < ex.entries.length && !warnings.some(w => w.includes('δεν χωράνε') && w.includes(target.text.replace(/\s+/g, ' ').trim()))) bad.push('seed ' + m.seed + ' ' + ex.cat + ': ' + (ex.entries.length - placed.length) + ' lines unplaced and not reported');
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('title, date and signatures: only the blank part is filled', () => {
    const bad: string[] = [];
    for (const { m, before, after, report } of runs) {
      if (!report.front) continue;
      const fb = before.find(x => x.name === m.fill.sheet)!, fa = after.find(x => x.name === m.fill.sheet)!;
      const chk = (x: { r: number; c: number; was: string; want: string } | undefined, what: string) => {
        if (!x) return; if (cellText(fb, x.r, x.c) !== x.was) { bad.push('seed ' + m.seed + ' ' + what + ' setup'); return; }
        if (cellText(fa, x.r, x.c) !== x.want) bad.push('seed ' + m.seed + ' ' + what + ' «' + x.was + '» → «' + cellText(fa, x.r, x.c) + '» want «' + x.want + '»');
      };
      chk(m.front.title, 'title'); chk(m.front.date, 'date'); m.front.sigs.forEach((x, i) => chk(x, 'sig' + i));
      if (m.flags.dateLine === 2) {
        for (let r = 0; r < fb.rows.length; r++) for (let c = 0; c < (fb.rows[r]?.length ?? 0); c++) if (cellText(fb, r, c) === 'Αυλώνας, 25/09/26') chk({ r, c, was: 'Αυλώνας, 25/09/26', want: m.s.settings.place + ', ' + m.date.slice(8, 10) + '/' + m.date.slice(5, 7) + '/' + m.date.slice(2, 4) }, 'date line');
      }
      // the role cells of the signatures are the template's own words: unchanged
      for (let r = 0; r < fb.rows.length; r++) for (let c = 0; c < (fb.rows[r]?.length ?? 0); c++) if (/^Ο (ΑΛΧΙΑΣ|ΔΚΤΗΣ)/.test(cellText(fb, r, c)) && cellText(fb, r, c) !== cellText(fa, r, c)) bad.push('seed ' + m.seed + ' role cell changed');
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('a dry run changes nothing and the continuation copies are the only added sheets', async () => {
    for (const { m, before, after } of runs.slice(0, 8)) {
      const added = after.filter(a => !before.some(b => b.name === a.name)).map(a => a.name);
      for (const n of added) expect(m.cont && n.startsWith(m.cont.slice(0, 20))).toBeTruthy();
    }
    const m = runs[0].m; const dry = await fillAdaptive(m.buf, m.s, m.date, null, { dryRun: true });
    expect(dry.buffer).toBe(m.buf);
  });

  it('through fillHkai: a unit with a decision column is routed to the adaptive fill and never written over ΕΙΣΗΓΗΣΗ', async () => {
    const m = await genBackMock(3, { decision: true, layout: 'below', form: 'six', drop: [], rows: 6, cont: false, example: false });
    const r = await fillHkai(m.buf, m.s, m.date, {});
    const out = await modelOfBuffer(r.data);
    for (const k of m.forbidden) { const [n, rc] = k.split('|'); const [a, c] = rc.split(':').map(Number); expect(cellText(out.find(x => x.name === n), a, c)).toBe(cellText((await modelOfBuffer(m.buf)).find(x => x.name === n), a, c)); }
  });

  it('the bundled template with a decision cell next to a label: the classic path does not write over it', async () => {
    const tpl = fs.readFileSync('templates/hkai.xlsx'); const wb = await Workbook.open(tpl); const bk = await wb.sheet(1);
    const sh = (await modelOfBuffer(tpl))[1]; let ref = '';
    for (let r = 0; r < sh.rows.length && !ref; r++) for (let c = 0; c < (sh.rows[r]?.length ?? 0); c++) if (/^1\s*\.\s*ΕΓΓΡΑΦΕΣ/.test(String(sh.rows[r][c] ?? ''))) { const g = sh.merges.find(x => x.r1 === r && x.c1 === c); ref = String.fromCharCode(65 + (g ? g.c2 : c) + 1) + (r + 1); }
    expect(ref).not.toBe(''); bk.set(ref, 'ΕΙΣΗΓΗΣΗ', true); const patched = await wb.save();
    const { genHkState } = await import('./hk-gen');
    const s = genHkState(5, {}); const d = '2026-10-15' as const;
    const out = await Workbook.open((await fillHkai(patched, s, d, {})).data);
    expect((await out.sheet(1)).get(ref)).toBe('ΕΙΣΗΓΗΣΗ');
  });

  it('report', () => {
    const rows = new Map<string, number[]>();
    for (const { m, report } of runs) {
      if (!report.front) continue;
      const k = m.flags.form + '/' + (m.flags.decision ? 'decision' : m.flags.layout) + (m.cont ? '/cont' : '') + (m.flags.drop.length ? '/missing' : '');
      const a = rows.get(k) || [0, 0, 0, 0, 0]; a[0]++;
      for (const x of report.back.sections) { a[1] += x.entries; a[2] += x.placed; a[3] += x.moved; a[4] += Math.max(0, x.unplaced); }
      rows.set(k, a);
    }
    const lines = ['variant                         files  lines  placed  continued  reported-unplaced', ...[...rows].sort().map(([k, a]) => k.padEnd(32) + String(a[0]).padStart(5) + String(a[1]).padStart(7) + String(a[2]).padStart(8) + String(a[3]).padStart(11) + String(a[4]).padStart(19))];
    const miss = runs.reduce((a, r) => a + r.report.back.missing.reduce((b, x) => b + x.n, 0), 0);
    console.log(lines.join('\n') + '\nlines of categories the form has no section for (reported, not written): ' + miss + '\nfiles without a ΗΚΑΙ table (nothing written): ' + runs.filter(r => !r.report.front).length + '\ntitle/date/sig lines found: ' + runs.filter(r => r.report.back.front.title).length + ' titles · ' + runs.filter(r => r.report.back.front.date).length + ' dates · ' + runs.reduce((a, r) => a + r.report.back.front.sigs, 0) + ' signature roles');
    expect(runs.length).toBe(N);
  });
});
