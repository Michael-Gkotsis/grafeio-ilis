// Sweep 17/11 (Michael: «πάρα πολλά τεστ, edge cases και κανονικά, και να επιβεβαιώνεις ότι το αποτέλεσμα είναι σωστό»):
// cadre leaves, απαλλαγές and the monthly leave planner (#341, #342). Every check compares the app's answer with a tiny independent
// model (a day → kind map), over many random sequences of the real commands, plus hand-made edge cases.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { addDays, type ISODate } from '../src/shared/dates';
import { type AppState, type Cadre } from '../src/shared/domain';
import { cadreStatusOn } from '../src/shared/cadre';
import { cadreAbsOn, isHol } from '../src/shared/rules';
import { apalCard, apalLedger, daysInYear, leaveCfgOf, leaveOverdraft, leaveSheets, quotaBalances } from '../src/shared/cadreBalance';
import { clearRange, monthIndex, planCode, planSheet, setNoDuty, shiftMonth } from '../src/shared/cadrePlan';
import { upper } from '../src/shared/text';
import { fakeState } from './fixtures';

const T = '2026-11-17';
let n = 0;
const ctx = () => ({ today: T, newId: () => 'z' + ++n });
const run = (s: AppState, c: Command) => apply(s, c, ctx()).state;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = <T,>(r: () => number, l: T[]): T => l[Math.floor(r() * l.length)];
const span = (a: ISODate, b: ISODate) => { const o: ISODate[] = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };

function base(nCadre = 3): { s: AppState; cs: Cadre[] } {
  let s = fakeState(6);
  const who = [['ΛΧΙΑΣ', 'Λοχίες', 'ΑΛΦΑ'], ['ΥΠΛΓΟΣ', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΒΗΤΑ'], ['ΕΠΧΙΑΣ', 'Επιλοχίες', 'ΓΑΜΜΑ'], ['ΤΧΗΣ', 'Ίλαρχοι-Λοχαγοί', 'ΔΕΛΤΑ']];
  for (const [rank, hk, last] of who.slice(0, nCadre)) s = run(s, { t: 'saveCadre', cadre: { rank, hk, last, first: 'ΤΕΣΤ' } as any });
  return { s, cs: s.cadreList };
}
const KINDS = ['ka', 'amd', 'apal', 'an', 'nos', 'yp', 'ey', 'eid'];

describe('Καταστάσεις στελεχών: τυχαίες σειρές εντολών ταιριάζουν με απλό μοντέλο μέρα → είδος', () => {
  it('300 τυχαίες σειρές (νέα, αλλαγή, σβήσιμο, «Σβήσε» διαστήματος): ποτέ δύο καταστάσεις την ίδια μέρα, κάθε μέρα όπως στο μοντέλο', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed); let { s, cs } = base(2);
      const model = new Map<string, string>();   // cid|day → kind
      const set = (cid: string, a: ISODate, b: ISODate, k?: string) => { for (const d of span(a, b)) { if (k) model.set(cid + '|' + d, k); else model.delete(cid + '|' + d); } };
      for (let step = 0; step < 12; step++) {
        const c = pick(r, cs); const from = addDays('2026-12-20', Math.floor(r() * 25)); const to = addDays(from, Math.floor(r() * 8));
        const op = r();
        if (op < 0.55) {
          const kind = pick(r, KINDS);
          const clash = s.cadreAbs.some(a => a.cid === c.id && a.from <= to && from <= a.to);
          if (clash && r() < 0.3) { expect(() => apply(s, { t: 'addCadreAbs', abs: { cid: c.id, kind, from, to } }, ctx())).toThrow(); continue; }
          s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind, from, to }, replace: true }); set(c.id, from, to, kind);
        } else if (op < 0.75) {
          const mine = s.cadreAbs.filter(a => a.cid === c.id); if (!mine.length) continue;
          const old = pick(r, mine); const kind = pick(r, KINDS);
          s = run(s, { t: 'addCadreAbs', abs: { id: old.id, cid: c.id, kind, from, to }, replace: true });
          set(c.id, old.from, old.to); set(c.id, from, to, kind);
        } else if (op < 0.88) {
          const mine = s.cadreAbs.filter(a => a.cid === c.id); if (!mine.length) continue;
          const old = pick(r, mine); s = run(s, { t: 'deleteCadreAbs', id: old.id }); set(c.id, old.from, old.to);
        } else {
          const has = s.cadreAbs.some(a => a.cid === c.id && a.from <= to && from <= a.to) || (s.cadreNoDuty || []).some(a => a.cid === c.id && a.from <= to && from <= a.to);
          if (!has) { expect(() => apply(s, { t: 'clearCadrePlan', cid: c.id, from, to }, ctx())).toThrow(); continue; }
          s = run(s, { t: 'clearCadrePlan', cid: c.id, from, to }); set(c.id, from, to);
        }
        // invariants after every step
        for (const x of cs) {
          const mine = s.cadreAbs.filter(a => a.cid === x.id).sort((p, q) => p.from.localeCompare(q.from));
          for (let i = 1; i < mine.length; i++) expect(mine[i].from > mine[i - 1].to, 'seed ' + seed + ' overlap').toBe(true);
          for (const a of mine) expect(a.from <= a.to).toBe(true);
          expect(new Set(s.cadreAbs.map(a => a.id)).size).toBe(s.cadreAbs.length);
        }
      }
      for (const x of cs) for (const d of span('2026-12-15', '2027-02-05')) expect(cadreAbsOn(s, x.id, d)?.kind, 'seed ' + seed + ' ' + d).toBe(model.get(x.id + '|' + d));
      // the planner's month index says the same as cadreStatusOn on every day of both months
      for (const ym of ['2026-12', '2027-01']) {
        const ix = monthIndex(s, ym);
        for (const x of cs) for (const d of ix.days) expect(ix.cells.get(x.id)?.[d.n - 1]?.kind).toBe(cadreStatusOn(s, x.id, d.d)?.abs.kind);
      }
    }
  });

  it('«Δεν θέλει υπηρεσία»: 300 τυχαίες σειρές, χωρίς επικαλύψεις, γειτονικές με ίδια παρατήρηση ενώνονται, κάθε μέρα όπως στο μοντέλο', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(1000 + seed); let list: { id: string; cid: string; from: ISODate; to: ISODate; note?: string }[] = [];
      const model = new Map<string, string>(); let k = 0;
      for (let step = 0; step < 10; step++) {
        const cid = pick(r, ['a', 'b']); const from = addDays('2026-12-01', Math.floor(r() * 20)); const to = addDays(from, Math.floor(r() * 5));
        const note = pick(r, [undefined, '', 'ΓΙΑΤΡΟΣ', ' ΓΙΑΤΡΟΣ ', 'ΣΧΟΛΗ']);
        if (r() < 0.8) { list = setNoDuty(list, cid, from, to, note, () => 'n' + ++k); for (const d of span(from, to)) model.set(cid + '|' + d, note?.trim() || ''); }
        else { const st = clearRange({ cadreAbs: [], cadreNoDuty: list }, cid, from, to, () => 'n' + ++k); list = st.cadreNoDuty!; for (const d of span(from, to)) model.delete(cid + '|' + d); }
        for (const cid2 of ['a', 'b']) {
          const mine = list.filter(x => x.cid === cid2).sort((p, q) => p.from.localeCompare(q.from));
          for (let i = 1; i < mine.length; i++) {
            expect(mine[i].from > mine[i - 1].to, 'seed ' + seed).toBe(true);
          }
        }
        expect(new Set(list.map(x => x.id)).size).toBe(list.length);
      }
      for (const cid of ['a', 'b']) for (const d of span('2026-11-25', '2027-01-05')) {
        const hit = list.find(x => x.cid === cid && x.from <= d && d <= x.to);
        expect(hit ? hit.note || '' : undefined, 'seed ' + seed + ' ' + d).toBe(model.get(cid + '|' + d));
      }
    }
  });
});

describe('Υπόλοιπα αδειών: ίδια με μέτρημα μέρα-μέρα', () => {
  const quotas = [
    { id: 'ka', name: 'Κανονική άδεια', perYear: 30, kinds: ['ka'], all: true },
    { id: 'amd', name: 'Άδεια μικρής διάρκειας', perYear: 10, kinds: ['amd'], all: true },
    { id: 'q3', name: 'Γονική', perYear: 0, kinds: ['eid'], all: false }
  ];
  it('200 τυχαίες χρονιές, ημερολογιακές και εργάσιμες μέρες, με αλλαγή χρονιάς και έξτρα/μεταφορά', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(5000 + seed); let { s, cs } = base(1); const c = cs[0];
      const count = r() < 0.5 ? 'calendar' : 'working';
      s = { ...s, settings: { ...s.settings, cadreLeave: { quotas, count } as any, holidays: { '2026-12-10': 'ΓΙΟΡΤΗ' } } };
      for (let i = 0; i < 6; i++) {
        const from = addDays('2026-11-20', Math.floor(r() * 60)); const to = addDays(from, Math.floor(r() * 12));
        s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(r, ['ka', 'amd', 'eid', 'an']), from, to }, replace: true });
      }
      if (r() < 0.5) s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'q3', days: 5, kind: 'extra' } as any });
      if (r() < 0.5) s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2027, quota: 'ka', days: 7, kind: 'carry' } as any });
      for (const year of [2026, 2027]) {
        const bal = quotaBalances(s, c.id, year);
        for (const b of bal) {
          let used = 0;
          for (const d of span(year + '-01-01', year + '-12-31')) {
            const a = cadreAbsOn(s, c.id, d); if (!a || !b.quota.kinds.includes(a.kind)) continue;
            if (count === 'working' && isHol(s.settings, d)) continue;
            used++;
          }
          expect(b.used, 'seed ' + seed + ' ' + year + ' ' + b.quota.id).toBe(used);
          const g = (s.cadreGrants || []).filter(x => x.year === year && x.quota === b.quota.id).reduce((a, x) => a + x.days, 0);
          expect(b.entitled).toBe((b.quota.all ? b.quota.perYear : 0) + g);
          expect(b.left).toBe(b.entitled - b.used);
        }
        // Γονική (all: false) only appears when it was granted that year
        expect(bal.some(b => b.quota.id === 'q3')).toBe((s.cadreGrants || []).some(x => x.year === year && x.quota === 'q3'));
      }
    }
  });
  it('η προειδοποίηση υπέρβασης λέει το ίδιο με «γράψε και μέτρα»', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(7000 + seed); let { s, cs } = base(1); const c = cs[0];
      for (let i = 0; i < 4; i++) { const from = addDays('2026-01-05', Math.floor(r() * 300)); s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(r, ['ka', 'amd']), from, to: addDays(from, Math.floor(r() * 14)) }, replace: true }); }
      const from = addDays('2026-01-01', Math.floor(r() * 380)); const cand = { kind: pick(r, ['ka', 'amd', 'an']), from, to: addDays(from, Math.floor(r() * 30)) };
      const warn = leaveOverdraft(s, c.id, cand);
      const after = run(s, { t: 'addCadreAbs', abs: { cid: c.id, ...cand }, replace: true });
      const exp: { name: string; year: number; left: number }[] = [];
      for (let y = +cand.from.slice(0, 4); y <= +cand.to.slice(0, 4); y++) for (const b of quotaBalances(after, c.id, y)) if (b.left < 0 && b.quota.kinds.includes(cand.kind)) exp.push({ name: b.quota.name, year: y, left: b.left });
      expect(warn, 'seed ' + seed).toEqual(exp);
    }
  });
  it('edge: κατάσταση 31/12–2/1 μετρά 1 μέρα στη μία χρονιά και 2 στην άλλη· 29/2 σε δίσεκτο', () => {
    const st = base(1).s.settings;
    expect(daysInYear({ from: '2026-12-31', to: '2027-01-02' }, 2026, 'calendar', st)).toBe(1);
    expect(daysInYear({ from: '2026-12-31', to: '2027-01-02' }, 2027, 'calendar', st)).toBe(2);
    expect(daysInYear({ from: '2028-02-28', to: '2028-03-01' }, 2028, 'calendar', st)).toBe(3);
    expect(daysInYear({ from: '2026-12-24', to: '2026-12-27' }, 2026, 'working', st)).toBe(1);   // 24 Πέμ, 25 Χριστούγεννα, 26 Σάβ, 27 Κυρ
    expect(daysInYear({ from: '2027-03-01', to: '2026-03-01' }, 2026, 'calendar', st)).toBe(0);
  });
});

describe('Καρτέλα απαλλαγών: ίδια με απλό μέτρημα', () => {
  it('200 τυχαίες καρτέλες: +1 ανά υπηρεσία (που έγινε ως σήμερα), +έξτρα σε ΣΚ/αργία, −1 ανά μέρα απαλλαγής, αρχικό υπόλοιπο, λήξη στο τέλος της χρονιάς', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(9000 + seed); let { s, cs } = base(1); const c = cs[0];
      const per = pick(r, [1, 1, 2, 0]); const hx = pick(r, [0, 1]); const expire = r() < 0.5 ? 'year' : 'never';
      s = { ...s, settings: { ...s.settings, cadreDuty: { groups: [{ id: 'g', name: 'ΑΥΔΜ', services: [{ id: 'v', name: 'ΑΥΔΜ', short: 'Α', perDay: 1, h24: true, hkCol: '' }] }] } as any, cadreLeave: { apalPerDuty: per, apalHolExtra: hx, apalExpire: expire } as any } };
      const duties: ISODate[] = [];
      for (let i = 0; i < 8; i++) { const d = addDays('2026-10-01', Math.floor(r() * 120)); if (duties.includes(d)) continue; duties.push(d); s = run(s, { t: 'saveCadreDuty', duty: { cid: c.id, svc: 'v', date: d } }); }
      for (let i = 0; i < 3; i++) { const d = addDays('2026-10-01', Math.floor(r() * 120)); s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: 'apal', from: d, to: addDays(d, Math.floor(r() * 2)) }, replace: true }); }
      const start = Math.floor(r() * 5) - 1;
      if (start) s = run(s, { t: 'saveCadreGrant', grant: { cid: c.id, year: 2026, quota: 'apal', days: start, kind: 'start' } as any });
      const today = pick(r, ['2026-11-17', '2027-01-31']);
      // model
      type E = { d: ISODate; v: number; o: number };
      const ev: E[] = [];
      for (const d of duties) if (d <= today && per + (isHol(s.settings, d) ? hx : 0) > 0) ev.push({ d, v: per + (isHol(s.settings, d) ? hx : 0), o: 1 });
      for (const a of s.cadreAbs.filter(x => x.kind === 'apal')) for (const d of span(a.from, a.to)) ev.push({ d, v: -1, o: 2 });
      if (start) ev.push({ d: '2026-01-01', v: start, o: 0 });
      ev.sort((a, b) => a.d.localeCompare(b.d) || a.o - b.o);
      const bal: Record<number, number> = {}; let cur = 0; let y = ev.length ? +ev[0].d.slice(0, 4) : 0;
      for (const e of ev) { const ey = +e.d.slice(0, 4); if (expire === 'year' && ey > y) { bal[y] = cur; if (cur > 0) cur = 0; else cur = 0; } y = ey; cur += e.v; bal[ey] = cur; }
      const rows = apalLedger(s, c, today);
      for (const year of [2026, 2027]) {
        const card = apalCard(rows, year, leaveCfgOf(s.settings).apalExpire);
        const exp = expire === 'never' ? ev.filter(e => +e.d.slice(0, 4) <= year).reduce((a, e) => a + e.v, 0) : ev.filter(e => +e.d.slice(0, 4) === year).reduce((a, e) => a + e.v, 0);
        expect(card.left, 'seed ' + seed + ' ' + year + ' ' + expire).toBe(exp);
        expect(card.earned - card.taken + card.opening).toBe(card.left);
      }
    }
  });
});

describe('Πρόγραμμα αδειών: Excel και κωδικοί', () => {
  it('κάθε κελί του προγράμματος είναι κεφαλαία, μία στήλη ανά μέρα, και το υπόμνημα εξηγεί κάθε κωδικό που εμφανίζεται', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(12000 + seed); let { s, cs } = base(4);
      for (let i = 0; i < 10; i++) { const c = pick(r, cs); const from = addDays('2026-11-25', Math.floor(r() * 40)); s = run(s, { t: 'addCadreAbs', abs: { cid: c.id, kind: pick(r, KINDS), from, to: addDays(from, Math.floor(r() * 6)) }, replace: true }); }
      for (let i = 0; i < 3; i++) { const c = pick(r, cs); const from = addDays('2026-12-01', Math.floor(r() * 30)); s = run(s, { t: 'setCadreNoDuty', cid: c.id, from, to: addDays(from, 2) }); }
      for (const ym of ['2026-12', '2027-01']) {
        const sh = planSheet(s, ym);
        expect(sh.days.length).toBe(+ym.slice(5) === 12 || +ym.slice(5) === 1 ? 31 : sh.days.length);
        const codes = new Set(sh.legend.map(l => l.code));
        for (const row of sh.rows) {
          expect(row.cells.length).toBe(sh.days.length);
          for (const v of [row.rank, row.name, row.left, ...row.cells]) expect(v).toBe(upper(v));
          for (const v of row.cells) for (const part of v.split('/').filter(Boolean)) expect(codes.has(part), seed + ' ' + ym + ' ' + v).toBe(true);
        }
      }
    }
  });
  it('edge: δύο δικά σου είδη με τον ίδιο σύντομο κωδικό δεν μπερδεύονται στο υπόμνημα', () => {
    let { s, cs } = base(2);
    const lists = { ...s.settings.lists, cadreAbs: { add: [{ name: 'Άδεια αιμοδοσίας', col: 'ka' }, { name: 'Άδεια ασθενείας', col: 'an' }] } };
    s = { ...s, settings: { ...s.settings, lists } as any };
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[0].id, kind: 'Άδεια αιμοδοσίας', from: '2026-12-02', to: '2026-12-03' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[1].id, kind: 'Άδεια ασθενείας', from: '2026-12-02', to: '2026-12-03' } });
    const a = planCode('Άδεια αιμοδοσίας', s.settings), b = planCode('Άδεια ασθενείας', s.settings);
    expect(a.code).not.toBe(b.code);
    const sh = planSheet(s, '2026-12');
    expect(new Set(sh.legend.map(l => l.code)).size).toBe(sh.legend.length);
    expect(sh.legend.map(l => l.name)).toEqual(expect.arrayContaining(['ΑΔΕΙΑ ΑΙΜΟΔΟΣΙΑΣ', 'ΑΔΕΙΑ ΑΣΘΕΝΕΙΑΣ']));
  });
  it('edge: δικό σου είδος που θα έπαιρνε κωδικό ίδιο με βασικό (π.χ. «Εκτός Υπηρεσίας» → ΕΥ) παίρνει άλλον', () => {
    let { s, cs } = base(2);
    s = { ...s, settings: { ...s.settings, lists: { ...s.settings.lists, cadreAbs: { add: [{ name: 'Εκτός Υπηρεσίας', col: 'os' }] } } } as any };
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[0].id, kind: 'Εκτός Υπηρεσίας', from: '2026-12-02', to: '2026-12-02' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[1].id, kind: 'ey', from: '2026-12-02', to: '2026-12-02' } });
    const sh = planSheet(s, '2026-12');
    expect(planCode('Εκτός Υπηρεσίας', s.settings).code).not.toBe(planCode('ey', s.settings).code);
    expect(planCode('ey', s.settings).code).toBe('ΕΥ');   // the built-in keeps its code
    expect(sh.legend).toHaveLength(2);
  });
  it('το Excel υπολοίπων: μία γραμμή ανά ενεργό στέλεχος, σωστά νούμερα, κεφαλαία στις επικεφαλίδες', () => {
    let { s, cs } = base(3);
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[0].id, kind: 'ka', from: '2026-03-02', to: '2026-03-11' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: cs[0].id, kind: 'amd', from: '2026-12-30', to: '2027-01-02' } });
    s = run(s, { t: 'saveCadre', cadre: { ...cs[2], active: false } });
    const sh = leaveSheets(s, 2026, T, cs[0].id);
    expect(sh[0].rows).toHaveLength(2);
    for (const h of sh[0].head) expect(h).toBe(upper(h));
    const row = sh[0].rows.find(x => x[3] === 'ΑΛΦΑ')!;
    expect(row.slice(5, 11)).toEqual([30, 10, 20, 10, 2, 8]);
    expect(sh[1].rows).toEqual([['Κανονική άδεια', 30, 10, 20], ['Άδεια μικρής διάρκειας', 10, 2, 8]]);
  });
  it('shiftMonth για πολλά χρόνια μπρος-πίσω', () => {
    for (let i = -40; i <= 40; i++) {
      const t = 2026 * 12 + 10 + i; expect(shiftMonth('2026-11', i)).toBe(Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'));
    }
  });
});
