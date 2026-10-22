// Τυχαία templates (tplgen.ts): κάθε έντυπο της εφαρμογής πρέπει να βρίσκει τα στοιχεία του όπου κι αν είναι και να
// γράφει τα σωστά πράγματα στα σωστά κελιά, χωρίς να αγγίζει τίποτα άλλο. Οι έλεγχοι βρίσκουν τα στοιχεία στο
// αποτέλεσμα από τα κείμενά τους (επικεφαλίδες, «1ο», «Λ/Υ:»), όχι από θέσεις.
// FUZZ_N=200 npx vitest run test/template-fuzz.test.ts για περισσότερα seeds· FUZZ_OUT=φάκελος κρατά τα αρχεία.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts, outsAndStay, outsNote, punishedOn, absentOn } from '../src/main/exports';
import { Workbook, type XlValue } from '../src/main/xlsx';
import { absenceOf, dutyName } from '../src/shared/froura';
import { fatherTxt, type AppState } from '../src/shared/domain';
import { byName } from '../src/shared/hkaiText';
import { HK_NCO, HK_OFFICERS, hkaiCounts, postBy, seatMap } from '../src/shared/rules';
import { HK_COLS } from '../src/shared/sources';
import { hkRowName, unitSettingsFor } from '../src/shared/unit';
import { normGreek, norm } from '../src/shared/text';
import { fakeState } from './fixtures';
import { genFroura, genHkai, genOuts, genReport, col, rng, chance, pick, int, shuffle } from './tplgen';
import { fillReport, inspectTemplate } from '../src/main/reports';
import { byIds, defaultPick, fieldValue, type Report } from '../src/shared/reports';

const N = Number(process.env.FUZZ_N || 30);
const OUT = process.env.FUZZ_OUT;
const D = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'f' + ++seq };
const UNIT: [string, string, string] = ['ΜΟΝΑΔΑ ΔΟΚΙΜΗΣ', 'ΓΡΑΜΜΗ ΔΥΟ', 'ΓΡΑΜΜΗ ΤΡΙΑ'];
const keep = (name: string, data: Buffer) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), data); } };

// every: βάρδιες θαλαμοφυλάκων/οπλοφυλάκων κάθε τόσα λεπτά (90: 4 ανά νούμερο, 240: 1–2)
function busy(phase: 'sven' | 'spen' = 'sven', gate = false, every = 0): AppState {
  let s = fakeState(90);
  s = { ...s, settings: { ...s.settings, unit: UNIT } };
  if (phase === 'spen') s = apply(s, { t: 'setPhase', phase: 'spen' }, ctx).state;
  if (every) { const k = phase === 'spen' ? 'blocksSpen' : 'blocks'; s = { ...s, settings: { ...s.settings, [k]: s.settings[k].map(b => (['th', 'th2', 'op'].includes(b.id) ? { ...b, shift: { every } } : b)) } }; }
  if (gate) s = apply(s, { t: 'addBlock', phase, name: 'Πύλη', kind: 'other', armed: true, n: 2, hrs: '08:00-20:00' }, ctx).state;
  s = apply(s, { t: 'autofill', date: D }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [20, 21, 22, 23, 24], from: '2026-10-10', to: '2026-10-14' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [30], from: '2026-10-11', to: '2026-10-13', kind: 'Περιορισμός' } }, ctx).state;
  s = apply(s, { t: 'approvePun', id: s.statuses.find(x => x.type === 'PUN')!.id }, ctx).state;
  s = apply(s, { t: 'outs', date: D, changes: [40, 41, 42].map(pid => ({ pid, from: null, to: 'OUT' as const })) }, ctx).state;
  return s;
}

// Τα κείμενα του φύλλου ως λίστα {r, c, t} (από 1)
interface Cell { r: number; c: number; t: string; v: XlValue }
const cellsOf = (rows: XlValue[][]): Cell[] => rows.flatMap((row, i) => (row || []).map((v, j) => ({ r: i + 1, c: j + 1, t: v == null ? '' : String(v), v })).filter(x => x.t !== ''));
const N0 = (t: string) => normGreek(t).replace(/\s+/g, ' ').trim();
const at = (rows: XlValue[][], r: number, c: number) => { const v = rows[r - 1]?.[c - 1]; return v == null ? '' : String(v); };
// Το Α/Α ενός πίνακα: το πιο κοντινό «Α/Α» αριστερά της επικεφαλίδας, στην ίδια γραμμή
const aaLeft = (cs: Cell[], h: Cell) => cs.filter(x => x.r === h.r && x.c < h.c && /^Α\s*\/?\s*Α\.?$/.test(N0(x.t))).sort((a, b) => b.c - a.c)[0];
// Οι γραμμές των νούμερων κάτω από μια επικεφαλίδα: «1ο», «2ο»… (ή «3η») στη στήλη του Α/Α, ως την πρώτη άλλη επικεφαλίδα
function numRows(cs: Cell[], aa: Cell, re = /^\d+(Ο|Η)$/): { n: string; r: number }[] {
  const out: { n: string; r: number }[] = [];
  for (const x of cs.filter(y => y.c === aa.c && y.r > aa.r).sort((a, b) => a.r - b.r)) { if (!re.test(N0(x.t))) break; out.push({ n: N0(x.t), r: x.r }); }
  return out;
}

function headCheck(cs: Cell[], head: string[], stop: number, why: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(head[0])!; const last = Number(/(\d+)$/.exec(head[head.length - 1])![1]);
  UNIT.forEach((u, i) => {
    const ref = i < head.length ? head[i] : m[1] + (last + i - head.length + 1);
    const r = Number(/(\d+)$/.exec(ref)![1]);
    if (r < stop) expect(cs.find(x => col(x.c) + x.r === ref)?.t, why + ' κεφαλίδα ' + ref).toBe(u);
    else expect(cs.some(x => x.t === u), why + ' περιττή γραμμή κεφαλίδας').toBe(false);
  });
}

describe('ΦΡΟΥΡΑ σε τυχαία templates', () => {
  for (const phase of ['sven', 'spen'] as const) for (let seed = 1; seed <= N; seed++) {
    it(phase + ' #' + seed, async () => {
      const gen = await genFroura(seed * 7 + (phase === 'spen' ? 1000 : 0), phase);
      const every = [0, 90, 240, 0][seed % 4]; const s = busy(phase, seed % 3 === 0, every);
      const why = [...gen.desc, every ? 'βάρδιες ' + every + '΄' : ''].filter(Boolean).join(' · ');
      const res = await fillFroura(gen.buf, s, D, phase);
      keep('froura-' + phase + '-' + seed + '.xlsx', res.data);
      const wb = await Workbook.open(res.data);
      expect(wb.sheetNames(), why).toContain(gen.sheet);
      const rows = await wb.values(gen.sheet, 400, 40); const cs = cellsOf(rows);
      const pm = seatMap(s); const g = s.guards[D]; const nm = (k: string) => (g[k] ? dutyName(pm.get(g[k])!) : '');
      // τίτλος με την ημερομηνία
      const titles = cs.filter(x => /^ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ/.test(N0(x.t)));
      expect(titles, why).toHaveLength(1); expect(titles[0].t, why).toContain('12 ΟΚΤ 2026');
      // κεφαλίδα: στα κελιά της κεφαλίδας του εντύπου και, αν έχει λιγότερες γραμμές, στα κενά από κάτω πάνω από τον τίτλο
      headCheck(cs, gen.head, titles[0].r, why);
      // Λ/Υ και Δ/Υ: μία φορά το καθένα, με το όνομα
      for (const [k, re] of [['ly', /^Λ\s*\/\s*Υ/], ['dy', /^Δ\s*\/\s*Υ/]] as const) {
        const hit = cs.filter(x => re.test(N0(x.t))); expect(hit, why + ' ' + k).toHaveLength(1);
        expect(N0(hit[0].t), why + ' ' + k).toContain(N0(pm.get(g[k])!.last));
      }
      // σκοποί: α΄ πίνακας θ1–θ4, β΄ θ5–θ8 (ΣΒΕΝ) ή οπλοφύλακες (ΣΠΕΝ)
      const tabs = cs.filter(x => /^ΘΑΛΑΜΟΦΥΛΑΚΕΣ$/.test(N0(x.t))).sort((a, b) => a.r - b.r || a.c - b.c);
      const ops = cs.filter(x => /^ΟΠΛΟΦΥΛΑΚΕΣ$/.test(N0(x.t)));
      const groups: [Cell, string][] = phase === 'sven' ? [[tabs[0], 'th1'], [tabs[1], 'th5']] : [[tabs[0], 'th1'], [ops[0], 'op1']];
      for (const [h, k0] of groups) {
        expect(h, why).toBeTruthy();
        const aa = aaLeft(cs, h); const nr = numRows(cs, aa);
        expect(nr.length, why + ' νούμερα ' + k0).toBeGreaterThanOrEqual(4);
        const base = Number(k0.slice(2)), pre = k0.slice(0, 2);
        nr.slice(0, 4).forEach((x, i) => expect(at(rows, x.r, h.c), why + ' ' + pre + (base + i)).toBe(nm(pre + (base + i))));
        // οι ώρες κάθε νούμερου στη στήλη ΩΡΕΣ, μία βάρδια ανά γραμμή (με δικές σου βάρδιες)
        const hc = cs.find(x => x.r === h.r && x.c > h.c && x.c <= h.c + 2 && N0(x.t) === 'ΩΡΕΣ');
        if (hc && every) nr.slice(0, 4).forEach((x, i) => { const sl = postBy(s, pre + (base + i))!.slots!; sl.forEach((t, j) => expect(at(rows, x.r + j, hc.c), why + ' ώρες ' + pre + (base + i)).toBe(t)); });
      }
      // μαγειρεία
      const mg = cs.find(x => /^ΜΑΓΕΙΡ(Ε)?ΙΑ$/.test(N0(x.t)))!; expect(mg, why).toBeTruthy();
      numRows(cs, aaLeft(cs, mg)).slice(0, 5).forEach((x, i) => expect(at(rows, x.r, mg.c), why + ' mg' + (i + 1)).toBe(nm('mg' + (i + 1))));
      if (phase === 'spen') {
        const sk = cs.find(x => N0(x.t) === 'ΣΚΟΠΟΙ')!; const nr = numRows(cs, aaLeft(cs, sk), /^\d+Η$/);
        expect(nr.map(x => x.n), why).toEqual(['3Η', '4Η']);
        nr.forEach(x => expect(at(rows, x.r, sk.c).split('\n').sort(), why + ' σκοποί ' + x.n).toEqual([nm('sk' + x.n[0] + 'a'), nm('sk' + x.n[0] + 'b')].filter(Boolean).sort()));
        const tae = cs.find(x => N0(x.t) === 'ΤΑΕ')!; expect(at(rows, tae.r, tae.c + 1), why + ' ΤΑΕ').toBe(nm('tae'));
      }
      // νέα υπηρεσία χωρίς κελί: δικός της πίνακας με τον τίτλο της
      if (seed % 3 === 0) { const gt = cs.find(x => N0(x.t) === 'ΠΥΛΗ'); expect(gt, why + ' Πύλη').toBeTruthy(); }
      // τιμωρημένοι και απόντες: όλοι, με τη σειρά, στη στήλη ΟΝΟΜΑΤΕΠΩΝΥΜΟ του πίνακά τους
      const want: Record<string, { n: string; k: string }[]> = {
        'ΤΙΜΩΡΗΜΕΝΟΙ': punishedOn(s, D).map(x => ({ p: pm.get(x.pid)!, x })).sort((a, b) => byName(a.p, b.p)).map(y => ({ n: dutyName(y.p), k: norm(y.x.kind || 'Ποινή') })),
        'ΑΠΟΝΤΕΣ': absentOn(s, D).map(x => ({ p: pm.get(x.pid)!, x })).sort((a, b) => byName(a.p, b.p)).map(y => ({ n: dutyName(y.p), k: absenceOf(y.x) }))
      };
      for (const [t, list] of Object.entries(want)) {
        const h = cs.find(x => N0(x.t) === t)!; expect(h, why + ' ' + t).toBeTruthy();
        const hr = cs.filter(x => x.r > h.r && x.c >= h.c && x.c <= h.c + 6 && N0(x.t) === 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').sort((a, b) => a.r - b.r)[0];
        const kc = cs.find(x => x.r === hr.r && x.c > hr.c && x.c <= hr.c + 5 && /^ΕΙΔΟΣ/.test(N0(x.t)))!;
        const got: { n: string; k: string }[] = [];
        for (let r = hr.r + 1; at(rows, r, hr.c); r++) got.push({ n: at(rows, r, hr.c), k: at(rows, r, kc.c) });
        expect(got, why + ' ' + t).toEqual(list);
      }
      // η σημείωση και οι υπογραφές του εντύπου μένουν όπως ήταν
      expect(cs.filter(x => x.t === gen.note), why + ' σημείωση').toHaveLength(1);
      for (const t of gen.sigs) expect(cs.some(x => N0(x.t) === N0(t)), why + ' υπογραφή ' + t).toBe(true);
    });
  }
});

describe('Εξοδούχοι σε τυχαία templates', () => {
  for (let seed = 1; seed <= N; seed++) {
    it('#' + seed, async () => {
      const gen = await genOuts(seed * 13);
      const s = busy(); const why = gen.desc.join(' · ');
      const res = await fillOuts(gen.buf, s, D);
      keep('outs-' + seed + '.xlsx', res.data);
      const wb = await Workbook.open(res.data);
      const { outs, stay } = outsAndStay(s, D);
      const lists = [outs.map(x => ({ p: x.p, note: outsNote(s, D, x.p.id, x.st) })), stay];
      for (const [i, title] of ['ΕΞΟΔΟΥΧΟΙ', 'ΠΑΡΑΜΕΝΟΝΤΕΣ'].entries()) {
        // το φύλλο: του template, ή (χωρίς φύλλο παραμενόντων) ένα αντίγραφο του πρώτου
        const sh = gen.sheets[i];
        const name = sh?.name ?? wb.sheetNames().find(n => N0(n).includes(title));
        expect(name, why + ' φύλλο ' + title).toBeTruthy();
        const rows = await wb.values(name!, 400, 40); const cs = cellsOf(rows);
        const t = cs.filter(x => N0(x.t).startsWith(title)); expect(t, why).toHaveLength(1); expect(t[0].t, why).toContain('12 ΟΚΤ 26');
        expect(N0(t[0].t), why).toMatch(/ΤΗΣ 12 ΟΚΤ 26$/);
        const def = gen.sheets[0];
        if (!gen.same || i === 0) headCheck(cs, def.head, t[0].r, why);
        // η γραμμή των επικεφαλίδων: η πρώτη κάτω από τον τίτλο της λίστας
        const hr = cs.filter(x => x.r > t[0].r && /^(ΒΑΘΜΟΣ|ΒΑΘΜ\.)$/.test(N0(x.t)))[0]; expect(hr, why).toBeTruthy();
        const heads = cs.filter(x => x.r === hr.r);
        const list = lists[i]; const colOf = (re: RegExp) => heads.find(x => re.test(N0(x.t)))?.c;
        const C = { rank: colOf(/^ΒΑΘΜ/), last: colOf(/^(ΕΠΙΘΕΤΟ|ΕΠΩΝΥΜΟ)$/), first: colOf(/^ΟΝΟΜΑ$/), name: colOf(/^ΟΝΟΜΑΤΕΠΩΝΥΜΟ$/), room: colOf(/^ΘΑΛ/), phone: colOf(/^(ΤΗΛΕΦΩΝΟ|ΚΙΝΗΤΟ|ΤΗΛ\.)$/), note: colOf(/^ΠΑΡ/), aa: colOf(/^Α\.?\/?Α\.?$|^ΑΑ$/) };
        list.forEach(({ p, note }, k) => {
          const r = hr.r + 1 + k; const w = why + ' ' + title + ' γραμμή ' + (k + 1);
          if (C.rank) expect(at(rows, r, C.rank), w).toBe(p.rank);
          if (C.last) expect(at(rows, r, C.last), w).toBe(p.last);
          if (C.first) expect(at(rows, r, C.first), w).toBe(p.first + fatherTxt(p));
          if (C.name) expect(N0(at(rows, r, C.name)), w).toContain(N0(p.last));
          if (C.room) expect(at(rows, r, C.room), w).toBe(p.room == null ? '' : String(p.room));
          if (C.phone) expect(at(rows, r, C.phone), w).toBe(p.phone || '');
          if (C.note) expect(at(rows, r, C.note), w).toBe(note);
        });
        // μετά τη λίστα: καμία γραμμή με στοιχεία ατόμου (οι έτοιμες κενές γραμμές που περίσσεψαν μένουν κενές)
        if (C.last) expect(at(rows, hr.r + 1 + list.length, C.last), why + ' μετά τη λίστα').toBe('');
        const pd = cs.filter(x => /^ΑΥΛΩΝΑΣ,/.test(N0(x.t))); expect(pd, why).toHaveLength(1); expect(pd[0].t, why).toContain('12-10-2026');
        expect(pd[0].r, why).toBeGreaterThan(hr.r + list.length);
        // αρίθμηση Α/Α: 1, 2, 3… (αριθμός ή τύπος)
        const ws = await wb.sheet(name!);
        if (C.aa && gen.sheets[0].aa === 'number') list.slice(0, 5).forEach((_, k) => expect(Number(at(rows, hr.r + 1 + k, C.aa!)), why + ' Α/Α').toBe(k + 1));
        if (C.aa && gen.sheets[0].aa === 'formula') list.forEach((_, k) => expect(ws.formula(col(C.aa!) + (hr.r + 1 + k)), why + ' Α/Α τύπος').toBe('ROW()-' + hr.r));
      }
    });
  }
});

describe('ΗΚΑΙ / ΗΚΑΛ σε τυχαία templates', () => {
  for (const lochos of [false, true]) for (let seed = 1; seed <= N; seed++) {
    it((lochos ? 'ΗΚΑΛ' : 'ΗΚΑΙ') + ' #' + seed, async () => {
      const gen = await genHkai(seed * 31 + (lochos ? 5000 : 0), lochos);
      let s = busy();
      // ένας λοχίας και ένας επιλοχίας (γραμμές που μπορεί να λείπουν από το template), στελέχη, οχήματα, ατυχήματα
      s = { ...s, people: s.people.map(p => (p.id === 3 ? { ...p, rank: 'ΛΧΙΑΣ' } : p.id === 4 ? { ...p, rank: 'ΕΠΙΛΧΙΑΣ' } : p)) };
      s = { ...s, settings: { ...s.settings, ...(lochos ? unitSettingsFor(s.settings, 'lochos') : {}), unitKind: lochos ? 'lochos' : undefined, cadre: { ...s.settings.cadre, 'Ίλαρχοι': 2, 'Ανθυπασπιστές': 1 }, hkai: { veh: { type: '1/4 ΤΟΝ', prov: 3, kin: 2, maint: 1, dmg: 0 }, on: ['lv'] } } };
      s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [26], from: D, to: '2026-10-15' } }, ctx).state;
      s = apply(s, { t: 'setHkaiManual', date: D, manual: { cells: {}, text: { accT: 'ΟΧΙ', accP: '1', accM: 'ΟΧΙ', loi: 'ΤΙΠΟΤΑ ΑΞΙΟΣΗΜΕΙΩΤΟ' } } }, ctx).state;
      const why = gen.desc.join(' · ');
      const res = await fillHkai(gen.buf, s, D);
      keep('hkai-' + (lochos ? 'l' : 'i') + seed + '.xlsx', res.data);
      const wb = await Workbook.open(res.data);
      const fr = await wb.sheet(gen.front); const rows = await wb.values(gen.front, 400, 60); const cs = cellsOf(rows);
      const hk = hkaiCounts(s, D);
      // τίτλος, τόπος και ημερομηνία
      const t = cs.filter(x => /^ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ/.test(N0(x.t))); expect(t, why).toHaveLength(1); expect(t[0].t, why).toMatch(/ΤΗΣ 12 ΟΚΤ 26$/);
      expect(N0(t[0].t), why).toContain(lochos ? 'ΛΟΧΟΥ' : 'ΙΛΗΣ');
      // στήλες από τις επικεφαλίδες, γραμμές από τα ονόματα των βαθμών
      const hr = cs.find(x => /^ΤΟΠΟΘΕΤΗΜΕΝΟΙ$/.test(N0(x.t)))!.r;
      const colOf: Record<string, number> = {};
      for (const x of cs.filter(y => y.r === hr)) { const k = HK_COLS.find(([kk, , re]) => kk !== 'bl' && re.test(N0(x.t).replace(/[.:]+$/, '')))?.[0]; if (k && colOf[k] == null) colOf[k] = x.c; }
      for (const [k, , re] of HK_COLS) if (gen.cols.includes(k)) expect(colOf[k], why + ' στήλη ' + k + ' ' + re).toBeTruthy();
      for (const key of [...HK_OFFICERS, ...HK_NCO]) {
        const names = [key, hkRowName(key, 'lochos')].map(N0);
        const row = cs.find(x => x.r > hr && names.includes(N0(x.t)))?.r;
        const x = hk.rank[key];
        if (!row) { expect(x.n, why + ' λείπει η γραμμή ' + key).toBe(0); continue; }
        const v = (k: string) => at(rows, row, colOf[k]);
        expect(v('placed'), why + ' ' + key).toBe(String(x.n - x.attached));
        for (const k of Object.keys(colOf)) if (!['placed', 'attached', 'sum', 'sumK', 'sumA', 'avail', 'prov', 'ab'].includes(k)) expect(v(k), why + ' ' + key + ' ' + k).toBe(x.c[k] ? String(x.c[k]) : '');
        for (const k of ['sum', 'sumK', 'sumA', 'avail']) expect(fr.formula(col(colOf[k]) + row), why + ' τύπος ' + key + ' ' + k).toBeTruthy();
      }
      // στήλες που δεν έχει το template: προειδοποίηση όταν είχαν κάτι να γράψουν
      for (const k of ['mag', 'eid', 'nos']) if (!gen.cols.includes(k) && Object.values(hk.rank).some(x => x.c[k])) expect(res.warnings.join(' '), why + ' ' + k).toMatch(/στήλη/);
      // σύνολα: ο τύπος του ΓΕΝΙΚΟΥ ΣΥΝΟΛΟΥ και της ομάδας πιάνουν και τις γραμμές που μπήκαν
      const tot = cs.find(x => N0(x.t) === 'ΣΥΝΟΛΟ ΟΠΛΙΤΩΝ')!; const f = fr.formula(col(colOf.placed) + tot.r)!;
      const m = /SUM\([A-Z]+(\d+):[A-Z]+(\d+)\)/.exec(f)!; const nco = HK_NCO.map(k => cs.find(x => x.r > hr && [k, hkRowName(k, 'lochos')].map(N0).includes(N0(x.t)))?.r).filter(Boolean) as number[];
      expect([+m[1] <= Math.min(...nco), +m[2] >= Math.max(...nco)], why + ' ' + f).toEqual([true, true]);
      // πίσω σελίδα: κάθε κείμενο δεξιά από την ετικέτα του, οι φρουρές στη στήλη «Στρατιώτες», τα όργανα κάτω από τις ετικέτες
      const brows = await wb.values(gen.back, 400, 40); const bc = cellsOf(brows);
      const bk = await wb.sheet(gen.back);
      const right = (re: RegExp) => { const x = bc.find(y => re.test(N0(y.t)))!; expect(x, why + ' ' + re).toBeTruthy(); const mm = bk.mergeAt(col(x.c) + x.r); return at(brows, x.r, (mm ? mm.c2 : x.c) + 1); };
      expect(right(/^3\.\s*ΑΔΕΙΕΣ/), why + ' άδειες').toMatch(/^1\./);
      expect(right(/^6\.\s*ΛΟΙΠΑ/), why + ' λοιπά').toBe('ΤΙΠΟΤΑ ΑΞΙΟΣΗΜΕΙΩΤΟ');
      const ux = bc.find(x => /^ΥΠΑΞΙΩΜΑΤΙΚΟΙ/.test(N0(x.t)))!;
      expect(at(brows, ux.r + 1, ux.c), why + ' Λ/Υ').toMatch(/^Λ\/Υ: /); expect(at(brows, ux.r + 2, ux.c), why + ' Δ/Υ').toMatch(/^Δ\/Υ: /);
      const night = bc.find(x => /^ΝΥΚΤΟΦΡΟΥΡ/.test(N0(x.t)))!; const st = bc.filter(x => N0(x.t) === 'ΣΤΡΑΤΙΩΤΕΣ' && x.r < night.r).sort((a, b) => b.r - a.r)[0];
      expect(Number(at(brows, night.r, st.c)), why + ' νυκτοφρουρές').toBeGreaterThan(0);
      const vh = bc.find(x => /^ΕΙΔΗ ΟΧΗΜΑΤ/.test(N0(x.t)))!; const pv = bc.find(x => N0(x.t) === 'ΠΡΟΒΛΕΠΟΝΤΑΙ' && x.r >= vh.r)!;
      const vr = bc.filter(x => x.c === vh.c && x.r > vh.r).sort((a, b) => a.r - b.r)[0].r;
      expect([at(brows, vr, vh.c), at(brows, vr, pv.c)], why + ' οχήματα').toEqual(['1/4 ΤΟΝ', '3']);
      const ol = bc.find(x => N0(x.t) === 'ΜΕΡΙΚΕΣ')!; expect(at(brows, ol.r + 2, ol.c), why + ' ατυχήματα').toBe('1');
      const pd = bc.filter(x => /^ΑΥΛΩΝΑΣ,/.test(N0(x.t))); expect(pd.length, why).toBeGreaterThan(0); for (const x of pd) expect(x.t, why).toContain('12 ΟΚΤ 26');
    });
  }
});

// Δικό σου έντυπο υπηρεσιών (αντίγραφο της ΣΠΕΝ ή της ΣΒΕΝ): ίδιο template, οι δικές του θέσεις
describe('ΦΡΟΥΡΑ δικού σου εντύπου σε τυχαία templates', () => {
  for (let seed = 1; seed <= Math.ceil(N / 3); seed++) {
    const base = seed % 2 ? 'spen' : 'sven';
    it(base + ' → ΑΣΚΗΣΗ #' + seed, async () => {
      const gen = await genFroura(seed * 13 + 77, base); const why = gen.desc.join(' · ');
      let s = busy(base);
      s = apply(s, { t: 'addPhase', name: 'Άσκηση', from: base }, ctx).state; const id = s.settings.phases!.at(-1)!.id;
      s = apply(s, { t: 'setPhase', phase: id }, ctx).state; s = apply(s, { t: 'autofill', date: D }, ctx).state;
      const res = await fillFroura(gen.buf, s, D, id);
      expect(res.name, why).toMatch(/^ΦΡΟΥΡΑ ΑΣΚΗΣΗ /);
      const wb = await Workbook.open(res.data); const txt = cellsOf(await wb.values(res.sheet!, 400, 40)).map(x => N0(x.t)).join('\n');
      const pm = seatMap(s); const g = s.guards[D] || {};
      const names = Object.entries(g).filter(([k]) => k !== 'ly' && k !== 'dy').map(([, v]) => pm.get(v)).filter(Boolean).map(p => N0(dutyName(p!)));
      expect(names.length, why).toBeGreaterThan(3);
      for (const n of names) expect(txt, why + ' ' + n).toContain(n);
      expect(res.warnings.filter(w => /δεν ανήκει/.test(w)), why).toEqual([]);
    });
  }
});

// ------------------------------------------------------------------ Έντυπα: δικά σου πρότυπα
describe('Έντυπα σε τυχαία πρότυπα', () => {
  const S = (() => { let s = busy(); s = { ...s, settings: { ...s.settings, place: 'Αυλώνας' } }; return s; })();
  for (let seed = 1; seed <= N; seed++) {
    it('πρότυπο #' + seed, async () => {
      const gen = await genReport(seed * 17 + 3); const why = gen.desc.join(' · ');
      const r = rng(seed * 101); const trim = chance(r, 0.3);
      const n = pick(r, [0, 1, 2, gen.ready, gen.ready + 1, int(r, 3, 40)]);
      const ids = shuffle(r, S.people.filter(p => p.active !== false).map(p => p.id)).slice(0, n);
      // χωρίς να του πεις φύλλο: βρίσκει μόνο του αυτό με τον πίνακα
      const insp = await inspectTemplate(gen.buf, 'people');
      expect(insp.sheet, why).toBe(gen.sheet);
      expect(insp.data, why + ' γραμμή δεδομένων').toBe(gen.data);
      for (const x of gen.cols) expect(insp.headers.find(h => h.c === x.c)?.f ?? null, why + ' στήλη ' + x.label).toBe(x.f);
      expect(insp.prepared, why + ' έτοιμες γραμμές').toBe(gen.ready);
      const rep: Report = { id: 'r', name: 'Αγγαρεία', tpl: 't', kind: 'people', sheet: insp.sheet, head: insp.head, cells: [], title: 'ΑΓΓΑΡΕΙΑ ΠΥΛΗΣ',
        cols: insp.headers.filter(h => h.f).map(h => ({ c: h.c, f: h.f!, h: h.text })), pick: defaultPick(), sort: 'name', day: 'today', out: 'file', trim };
      const res = await fillReport(gen.buf, S, rep, ids, D);
      keep('rep' + seed + '.xlsx', res.data);
      const wb = await Workbook.open(res.data); const ws = await wb.sheet(gen.sheet);
      const rows = await wb.values(gen.sheet, 200, 30); const cs = cellsOf(rows);
      const rowsOf = byIds(S, 'people', ids, D);
      // κάθε άτομο στη γραμμή του, κάθε στοιχείο στη στήλη του· άγνωστες στήλες κενές
      for (let i = 0; i < n; i++) for (const x of gen.cols) {
        const ref = col(x.c) + (gen.data + i);
        if (x.f === 'aa' && gen.aa === 'formula') { expect(ws.formula(ref), why + ' Α/Α ' + ref).toBeTruthy(); continue; }
        const want = x.f ? fieldValue(S, 'people', rowsOf[i], x.f, i, D) : null;
        expect(N0(at(rows, gen.data + i, x.c)), why + ' ' + ref + ' ' + x.f).toBe(want == null ? '' : N0(String(want)));
      }
      // ό,τι ήταν κάτω από τον πίνακα: μία φορά, κάτω από την τελευταία γραμμή, με το σύνολο να πιάνει όλες τις γραμμές
      const end = gen.data + (n > gen.ready ? n : trim ? Math.max(n, 1) : gen.ready) - 1;
      if (gen.note) { const x = cs.filter(y => y.t === gen.note!.t); expect(x.length, why + ' σημείωση').toBe(1); expect(x[0].r, why + ' σημείωση').toBe(gen.note.r + end - (gen.data + gen.ready - 1)); }
      if (gen.total) {
        const tr = gen.total.r + end - (gen.data + gen.ready - 1); const f = ws.formula(col(gen.total.of) + tr);
        expect(f, why + ' σύνολο').toBe('COUNTA(' + col(gen.total.of) + gen.data + ':' + col(gen.total.of) + end + ')');
      }
      // Α/Α: συνεχόμενα 1, 2, 3… ως το τέλος του πίνακα, χωρίς διπλά από τις έτοιμες γραμμές
      if (gen.aa === 'numbered' || gen.aa === 'number') {
        const got = Array.from({ length: end - gen.data + 1 }, (_, i) => at(rows, gen.data + i, gen.aaCol)).filter(Boolean);
        expect(got, why + ' Α/Α').toEqual(got.map((_, i) => String(i + 1)));
        expect(got.length, why + ' Α/Α').toBeGreaterThanOrEqual(n);
      }
      // ετικέτες: καμία δεν έμεινε, και γράφτηκε ό,τι λένε
      expect(cs.filter(x => /\{[^{}]+\}/.test(x.t)).map(x => x.t), why).toEqual([]);
      const txt = cs.map(x => x.t).join('\n');
      if (gen.tags.includes('title')) expect(txt, why).toContain('ΑΓΓΑΡΕΙΑ ΠΥΛΗΣ');
      if (gen.tags.includes('count')) expect(txt, why).toContain('ΣΥΝΟΛΟ: ' + n);
      if (gen.tags.includes('placeDate')) expect(txt, why).toContain('12 ΟΚΤ 26');
      if (gen.tags.includes('date')) expect(txt, why).toContain('12/10/2026');
      if (gen.tags.includes('head') || gen.tags.includes('head1')) for (const u of UNIT) expect(txt, why).toContain(u);
      // ένα φύλλο ανά θάλαμο, αντίγραφα του ίδιου προτύπου: ο καθένας στο φύλλο του θαλάμου του, μία φορά
      if (seed % 3 === 0 && n) {
        const sp = await fillReport(gen.buf, S, { ...rep, split: 'room' }, ids, D); keep('rep' + seed + '-split.xlsx', sp.data);
        const w2 = await Workbook.open(sp.data); const nc = gen.cols.find(x => x.f === 'name' || x.f === 'last')!;
        const seen: string[] = [];
        for (const sh of sp.sheets) {
          const rr = await w2.values(sh, 200, 30); const got: string[] = [];
          for (let i = 0; i < 60 && at(rr, gen.data + i, nc.c) && !/^(ΣΥΝΟΛΟ|ΟΙ ΑΝΩΤΕΡΩ)/.test(at(rr, gen.data + i, nc.c)); i++) got.push(N0(at(rr, gen.data + i, nc.c)));
          seen.push(...got);
          expect(cellsOf(rr).filter(x => /\{[^{}]+\}/.test(x.t)).length, why + ' ' + sh).toBe(0);
        }
        expect(seen.sort(), why + ' χωρισμός').toEqual(rowsOf.map(p => N0(String(fieldValue(S, 'people', p, nc.f!, 0, D)))).sort());
      }
    });
  }
});
