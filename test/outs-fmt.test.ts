// Εξοδούχοι «Όλη η δύναμη» (Michael, 30/10), πάνω στο πραγματικό template και σε τυχαία templates· και η τωρινή μορφή ίδια.
// (Η μορφή «Σε 4 πίνακες» αντικαταστάθηκε από την «Όλη η δύναμη»: οι παλιές ρυθμίσεις με 'tab4' διαβάζονται ως 'all'.)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook, mergeSheets } from '../src/main/xlsx';
import { pskDays } from '../src/shared/dates';
import { fakeState as fakeNew } from './fixtures';
// η παλιά διάταξη (κεφαλίδα αριστερά, ημερομηνία δεξιά): αυτά τα τεστ δεν αφορούν τη θέση τους (head-date-swap.test.ts)
const fakeState: typeof fakeNew = n => { const s = fakeNew(n); return { ...s, settings: { ...s.settings, hdLeft: true } }; };
import { genOuts } from './tplgen';
import { genState } from './outs-gen';
import { dayBook } from '../src/shared/outsDay';
import { isOutsAll, type AppState, type OutsFmt, type Status, type TypeKey } from '../src/shared/domain';
import { activePeople } from '../src/shared/rules';
import { upper } from '../src/shared/text';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'q' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const D = '2026-10-26';   // Δευτέρα
function state(fmt: OutsFmt | 'tab4' | undefined, ss: Status[], n = 40): AppState {
  const s = fakeState(n); s.statuses = ss; s.settings = { ...s.settings, ...(fmt ? { outsFmt: fmt } : {}) }; return s;
}
// ό,τι μπήκε: 1 ΔΝ σήμερα, 2 εξοδούχοι, ΔΝ χθες + έξοδος σήμερα, ΚΑ που λήγει σήμερα 15:00, ΚΑ που λήγει αύριο, ΚΑ που λήγει σήμερα με ΔΝ
const scenario = () => [st(1, 'DN', D), st(3, 'OUT', D), st(4, 'OUT', D), st(5, 'DN', '2026-10-25'), st(5, 'OUT', D),
  st(7, 'LEAVE', '2026-10-23', { to: D, toTime: '15:00', kind: 'Κανονική' }), st(6, 'LEAVE', '2026-10-23', { to: '2026-10-27', toTime: '14:00', kind: 'Κανονική' }), st(9, 'LEAVE', '2026-10-23', { to: D }), st(9, 'DN', D)];
// όλα τα κελιά ως κείμενο ανά γραμμή
async function grid(data: Buffer, sheet?: string) { const wb = await Workbook.open(data); const n = sheet || wb.sheetNames()[0]; return { wb, ws: await wb.sheet(n), rows: await wb.values(n, 400, 40), name: n }; }
const at = (rows: (string | number | boolean | Date | null)[][], r: number, c: number) => String(rows[r - 1]?.[c - 1] ?? '');
const inCell = (rows: (string | number | boolean | Date | null)[][], f: (t: string) => boolean) => rows.flat().filter(v => typeof v === 'string' && f(v));

describe('Εξοδούχοι «Όλη η δύναμη»: πραγματικό template', () => {
  it('δύο φύλλα (ΕΞΟΔΟΥΧΟΙ, ΔΥΝΑΜΗ), χωρίς Παραμένοντες, όνομα αρχείου και τίτλοι', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), state('all', scenario()), D);
    expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ 26-10-2026.xlsx'); expect(r.warnings).toEqual([]);
    const { wb, rows } = await grid(r.data);
    expect(wb.sheetNames()).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']); expect(r.sheets).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']);
    expect(at(rows, 5, 1)).toBe('ΕΞΟΔΟΥΧΟΙ ΤΗΣ ΔΕΥΤΕΡΑΣ 26-10-2026');
    const r2 = await grid(r.data, 'ΔΥΝΑΜΗ');
    expect(at(r2.rows, 5, 1)).toBe('ΔΥΝΑΜΗ ΤΗΣ ΔΕΥΤΕΡΑΣ 26-10-2026');
    expect(at(r2.rows, 6, 1)).toMatch(/^ΔΥΝΑΜΗ 40 = Α \d+ \(ΕΞΟΔΟΥΧΟΙ, ΣΕΛ\. 1\) \+ Β \d+ \+ Γ \d+$/);
  });
  it('οι άνθρωποι στις σωστές ομάδες, με ΓΥΡΝΑ', async () => {
    const s = state('all', scenario()); const book = dayBook(s, D);
    const out = (await fillOuts(T('exodouxoi.xlsx'), s, D)).data;
    const rows = [...(await grid(out)).rows, ...(await grid(out, 'ΔΥΝΑΜΗ')).rows];   // οι δύο σελίδες η μία μετά την άλλη
    const nm = (id: number) => s.people.find(p => p.id === id)!.last;
    const where = (id: number) => { let sub = ''; for (let r = 1; r <= rows.length; r++) { const a = at(rows, r, 1); if (/^[ΑΒΓ]\d\. /.test(a)) sub = a.slice(0, 2); if (at(rows, r, 4) === nm(id) && /^\d+$/.test(a)) return sub; } return '-'; };
    for (const [id, g] of [[1, 'Α1'], [3, 'Α2'], [4, 'Α2'], [5, 'Β3'], [6, 'Β1'], [7, 'Γ4'], [9, 'Α1']]) expect(where(id as number), 'p' + id).toBe(g);
    expect(book.find(x => x.p.id === 1)!.g).toBe('A1');
    expect(inCell(rows, t => /^ΤΡΙΤΗ 27\/10 06:00/.test(t)).length).toBeGreaterThan(0);
  });
  it('ο πίνακας του Excel του template μένει μόνο στον πρώτο πίνακα κάθε φύλλου και η περιοχή εκτύπωσης φτάνει ως τη στήλη ΓΥΡΝΑ, σε Α4 όρθιο', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), state('all', scenario()), D);
    const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(r.data);
    const tabs = Object.keys(z.files).filter(f => /^xl\/tables\/table\d+\.xml$/.test(f));
    expect(tabs).toHaveLength(2);   // ένας σε κάθε φύλλο
    for (const sh of ['ΕΞΟΔΟΥΧΟΙ', 'ΔΥΝΑΜΗ']) {
      const { ws, rows } = await grid(r.data, sh);
      // η επικεφαλίδα του πίνακα είναι η πρώτη επικεφαλίδα του φύλλου και μέσα του δεν υπάρχουν συγχωνεύσεις
      const hit = (await Promise.all(tabs.map(async f => /ref="([^"]+)"/.exec(await z.file(f)!.async('string'))![1]))).map(ref => ref.split(':')).filter(([a]) => at(rows, Number(a.slice(1)), 1) === 'Α/Α');
      expect(hit.length, sh).toBeGreaterThan(0);
      const [a, b] = hit[0]; const hr = Number(a.slice(1)), last = Number(b.slice(1));
      expect(a[0]).toBe('A'); expect(b[0]).toBe('H');
      for (const m of ws.merges()) expect(m.r1 < hr || m.r1 > last, sh + ' συγχώνευση μέσα στον πίνακα ' + JSON.stringify(m)).toBe(true);
    }
    const wbx = await z.file('xl/workbook.xml')!.async('string');
    expect([...wbx.matchAll(/\$A\$1:\$I\$\d+/g)]).toHaveLength(2);
    for (const f of Object.keys(z.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) expect(await z.file(f)!.async('string')).toMatch(/<pageSetup[^>]*orientation="portrait"[^>]*fitToHeight="0"|<pageSetup[^>]*fitToHeight="0"[^>]*orientation="portrait"/);
  });
  it('ΠΣΚ: δύο φύλλα ανά μέρα (Παρ, Σαβ, Κυρ), ΠΑΡ 23-10 και ΠΑΡ 23-10 ΔΥΝ…', async () => {
    const s = state('all', [st(1, 'DN', '2026-10-24', { kind: 'ΣΚ' }), st(1, 'DN', '2026-10-25', { kind: 'ΣΚ' }), st(2, 'OUT', '2026-10-23')]);
    const days = pskDays('2026-10-23');
    const parts = await Promise.all(days.map(d => fillOuts(T('exodouxoi.xlsx'), s, d)));
    const tabs = ['ΠΑΡ 23-10', 'ΣΑΒ 24-10', 'ΚΥΡ 25-10'];
    const merged = await mergeSheets(parts.map(x => x.data), parts.map(x => x.sheets!), tabs.map(n => [n, n + ' ΔΥΝ']));
    const wb = await Workbook.open(merged);
    expect(wb.sheetNames()).toEqual(tabs.flatMap(n => [n, n + ' ΔΥΝ']));
    const titles = ['ΠΑΡΑΣΚΕΥΗΣ 23-10-2026', 'ΣΑΒΒΑΤΟΥ 24-10-2026', 'ΚΥΡΙΑΚΗΣ 25-10-2026'];
    for (const [i, n] of tabs.entries()) {
      expect(inCell(await wb.values(n, 400, 40), t => t.startsWith('ΕΞΟΔΟΥΧΟΙ ΤΗΣ ' + titles[i]))).toHaveLength(1);
      expect(inCell(await wb.values(n + ' ΔΥΝ', 400, 40), t => t.startsWith('ΔΥΝΑΜΗ ΤΗΣ ' + titles[i]))).toHaveLength(1);
    }
  });
  it('η τωρινή μορφή (προεπιλογή) δεν αλλάζει: δύο φύλλα, καμία νέα στήλη, οι παρατηρήσεις με το «ΓΥΡΝΑ…»', async () => {
    for (const fmt of [undefined, 'cur' as const]) {
      const r = await fillOuts(T('exodouxoi.xlsx'), state(fmt, scenario()), D);
      expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΠΑΡΑΜΕΝΟΝΤΕΣ 26-10-2026.xlsx');
      const { wb, rows } = await grid(r.data);
      expect(wb.sheetNames()).toEqual(['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ']);
      expect(at(rows, 5, 1)).toBe('ΕΞΟΔΟΥΧΟΙ ΤΗΣ 26 ΟΚΤ 26'); expect(at(rows, 6, 9)).toBe('');
      expect(at(rows, 7, 8)).toMatch(/^ΔΝ, ΓΥΡΝΑ ΤΡΙΤΗ 27\/10 06:00/);
    }
  });
  it('οι παλιές ρυθμίσεις με «Σε 4 πίνακες» (tab4) διαβάζονται ως «Όλη η δύναμη»', async () => {
    expect(isOutsAll({ outsFmt: 'tab4' })).toBe(true); expect(isOutsAll({ outsFmt: 'all' })).toBe(true); expect(isOutsAll({ outsFmt: 'cur' })).toBe(false); expect(isOutsAll({})).toBe(false);
    const r = await fillOuts(T('exodouxoi.xlsx'), state('tab4', scenario()), D);
    expect(r.name).toBe('ΕΞΟΔΟΥΧΟΙ-ΔΥΝΑΜΗ 26-10-2026.xlsx');
  });
});

// Τυχαία templates (tplgen): ό,τι έχει ο γράφων στο δικό του έντυπο Εξοδούχων
describe('Εξοδούχοι «Όλη η δύναμη»: τυχαία templates', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it('#' + seed, async () => {
      const gen = await genOuts(seed * 13); const why = gen.desc.join(' · ');
      const s0 = genState(3000 + seed, true, 10), s: AppState = { ...s0, settings: { ...s0.settings, outsFmt: 'all' } };
      const r = await fillOuts(gen.buf, s, '2026-10-30');
      expect(r.sheets, why).toHaveLength(2);
      const { wb, rows: rows1 } = await grid(r.data, r.sheets![0]); const { rows: rows2 } = await grid(r.data, r.sheets![1]);
      expect(wb.sheetNames().filter(n => /ΠΑΡΑΜΕΝ/.test(n) && !gen.same), why).toEqual([]);
      // ο τίτλος μία φορά σε κάθε φύλλο, η σύνοψη μία φορά στο φύλλο 2, η Δ μετά τις ομάδες, η ημερομηνία (τόπος) μία φορά και κάτω από όλα
      const row = (rows: typeof rows1, f: (t: string) => boolean) => rows.findIndex(x => (x || []).some(v => typeof v === 'string' && f(v)));
      expect(inCell(rows1, t => /^ΕΞΟΔΟΥΧΟΙ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026$/.test(t)), why).toHaveLength(1);
      expect(inCell(rows2, t => /^ΔΥΝΑΜΗ ΤΗΣ ΠΑΡΑΣΚΕΥΗΣ 30-10-2026$/.test(t)), why).toHaveLength(1);
      expect(inCell(rows1, t => /^ΔΥΝΑΜΗ \d+ = /.test(t)), why).toHaveLength(0); expect(inCell(rows2, t => /^ΔΥΝΑΜΗ \d+ = /.test(t)), why).toHaveLength(1);
      expect(inCell(rows1, t => /^Δ\. ΠΟΤΕ ΓΥΡΙΖΟΥΝ/.test(t)), why).toHaveLength(0);
      const dl = row(rows2, t => /^Δ\. ΠΟΤΕ ΓΥΡΙΖΟΥΝ/.test(t)); const lastGroup = Math.max(...[1, 2].map(i => row(rows2, t => new RegExp('^' + 'ΑΒΓ'[i] + '\\d\\. ').test(t))));
      for (const rows of [rows1, rows2]) expect(rows.flat().filter(v => typeof v === 'string' && /^ΑΥΛΩΝΑΣ,/.test(v)), why).toHaveLength(1);
      // κάθε ενεργός μία φορά πριν τη Δ (ανά γραμμή), στο σωστό φύλλο
      const end = dl >= 0 ? dl : rows2.length; const book = dayBook(s, '2026-10-30');
      for (const p of activePeople(s)) {
        const re = new RegExp('(^|[^Α-Ω0-9])' + upper(p.last) + '([^Α-Ω0-9]|$)'); const inA = book.find(b => b.p.id === p.id)!.g[0] === 'A';
        const n = (rows: typeof rows1) => rows.filter(x => (x || []).some(v => typeof v === 'string' && re.test(v))).length;
        expect(n(rows1.slice(0)), why + ' ' + p.last + ' φύλλο 1').toBe(inA ? 1 : 0); expect(n(rows2.slice(0, end)), why + ' ' + p.last + ' φύλλο 2').toBe(inA ? 0 : 1);
      }
      // επικεφαλίδα ΓΥΡΝΑ/ΓΙΑΤΙ ΜΕΝΕΙ δεξιά από τις στήλες του template, σε κάθε ομάδα
      for (const rows of [rows1, rows2]) expect(inCell(rows, t => t === 'ΓΥΡΝΑ' || t === 'ΓΙΑΤΙ ΜΕΝΕΙ').length, why).toBe(rows.filter(x => (x || []).some(v => /^([ΑΒΓ]\d\. |Α\. ΒΓΑΙΝΟΥΝ ΣΗΜΕΡΑ \(0\)$|Β, Γ \(0\)$)/.test(String(v)))).length);
      expect(lastGroup).toBeLessThan(dl < 0 ? rows2.length : dl);
    });
  }
});
