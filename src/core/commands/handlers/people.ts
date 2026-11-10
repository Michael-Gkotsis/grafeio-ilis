// Handlers: the soldiers: add, update, baselines, personal data and ΗΚΑΙ moves.
//
// Purpose: The handlers of `updatePerson`, `addPerson`, `addPeople`, `setBaseline`, `setBaselines`, `setPersonal`,
//   `setPersonMove`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: import from Excel (imports.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/new-soldier.test.ts, test/personal.test.ts, test/origin.test.ts, test/namesakes.test.ts,
//   test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { dm } from '../../lib/dates';
import { OUT_NOTE, shortName, type Person } from '../../model/person';
import { KIND_NAME, type DutyKind } from '../../model/duty';
import type { AppState, Baseline } from '../../model/state';
import type { Cadre } from '../../model/cadreRecord';
import { rankTxt, withOrigin } from '../../people/ranks';
import { normExtra, normPersonal, XKEYS } from '../../people/personal';
import type { CommandOf, Ctx, SeatMap, Result } from '../types';
import { rememberChoices, makePerson } from '../personShape';
import { setGuard } from '../guards';

/** Handler of the command `updatePerson`. */
export function handleUpdatePerson(s: AppState, c: CommandOf<'updatePerson'>, ctx: Ctx, pm: SeatMap): Result {
  const old = pm.get(c.person.id);
  if (!old) throw new Error('Δεν βρέθηκε το άτομο');
  // service limit per month (ΕΠΟΠ/ΟΒΑ): an integer above 0, otherwise no limit
  const person: Person = withOrigin({ ...c.person }, s.settings.lists);
  const mx = Math.floor(Number(person.monthMax));
  if (mx > 0) person.monthMax = mx;
  else delete person.monthMax;
  // out of strength from the card (4/11): the note becomes «Εκτός δύναμης: <reason>», like those who came from the
  // ΕΚΤΟΣ ΔΥΝΑΜΗΣ sheet, so that it is written in the ΕΚΤΟΣ ΔΥΝΑΜΗΣ sheet and does not return to strength with the next
  // roster import (mergeRow). Back in strength: only the word goes, the reason stays in the note.
  const nt = (person.notes || '').trim();
  if (old.active && !person.active && !nt.startsWith(OUT_NOTE)) person.notes = OUT_NOTE + (nt ? ': ' + nt : '');
  else if (!old.active && person.active && nt.startsWith(OUT_NOTE))
    person.notes = nt.slice(OUT_NOTE.length).replace(/^[:\s]+/, '');
  let next: AppState = {
    ...s,
    people: s.people.map((p) => (p.id === person.id ? person : p)),
    settings: rememberChoices(s.settings, person, old),
  };
  // went out of strength: leaves the duties from today on (the past ones stay as they were)
  const gone =
    old.active && !person.active
      ? Object.keys(s.guards)
          .filter((d) => d >= ctx.today)
          .flatMap((d) =>
            Object.entries(s.guards[d] || {})
              .filter(([, pid]) => pid === old.id)
              .map(([k]) => ({ d, k })),
          )
      : [];
  gone.forEach((x) => {
    next = setGuard(next, x.d, x.k, null);
  });
  const text =
    old.active && !person.active
      ? shortName(person) +
        ': εκτός δύναμης' +
        (gone.length ? ' (βγήκε από ' + gone.length + (gone.length === 1 ? ' υπηρεσία' : ' υπηρεσίες') + ')' : '')
      : !old.active && person.active
        ? shortName(person) + ': ξανά σε δύναμη'
        : 'Άλλαξαν τα στοιχεία: ' + shortName(person);
  return { state: next, text, files: gone.length ? ['Υπηρεσίες', 'Έλεγχος υπηρεσιών'] : [] };
}
/** Handler of the command `addPerson`. */
export function handleAddPerson(s: AppState, c: CommandOf<'addPerson'>): Result {
  const p = makePerson(s, c.person);
  return {
    state: { ...s, people: [...s.people, p], settings: rememberChoices(s.settings, p) },
    text: 'Νέος στρατιώτης: ' + (rankTxt(p) ? rankTxt(p) + ' ' : '') + p.last + ' ' + p.first,
    files: [],
  };
}
/** Handler of the command `addPeople`. */
export function handleAddPeople(s: AppState, c: CommandOf<'addPeople'>): Result {
  // Quick add (Νέα ΕΣΣΟ): all together, one undo and one entry in the Δυναμολόγιο; if one does not go in, none does
  if (!c.people.length) throw new Error('Δεν έγραψες κανέναν στρατιώτη');
  let st = s;
  const added: Person[] = [];
  c.people.forEach((x, i) => {
    let p: Person;
    try {
      p = makePerson(st, x);
    } catch (e) {
      throw new Error('Γραμμή ' + (i + 1) + ': ' + (e instanceof Error ? e.message : String(e)));
    }
    added.push(p);
    st = { ...st, people: [...st.people, p], settings: rememberChoices(st.settings, p) };
  });
  const names =
    added
      .slice(0, 5)
      .map((p) => p.last + ' ' + p.first)
      .join(', ') + (added.length > 5 ? ' και άλλοι ' + (added.length - 5) : '');
  return {
    state: st,
    text: (added.length === 1 ? 'Νέος στρατιώτης: ' : added.length + ' νέοι στρατιώτες: ') + names,
    files: [],
  };
}
/** Handler of the command `setBaseline`. */
export function handleSetBaseline(s: AppState, c: CommandOf<'setBaseline'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  const clean: Baseline = {};
  let any = false;
  for (const [k, n] of Object.entries(c.baseline)) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v) {
      (clean as Record<string, number>)[k] = v;
      any = true;
    }
  }
  const baseline = { ...s.baseline };
  if (any) baseline[c.pid] = clean;
  else delete baseline[c.pid];
  const txt =
    Object.entries(clean)
      .map(([k, n]) => (k === 'hol' ? 'αργίες' : KIND_NAME[k as DutyKind] || k) + ' ' + n)
      .join(', ') || 'καμία';
  // typed by hand: the check after the upgrade (for those the old Excel reading put) is not needed
  const settings = s.settings.baselineReviewed ? s.settings : { ...s.settings, baselineReviewed: true };
  return {
    state: { ...s, baseline, settings },
    text: 'Προηγούμενες υπηρεσίες ' + shortName(p) + ': ' + txt,
    files: ['Έλεγχος υπηρεσιών'],
  };
}
/** Handler of the command `setBaselines`. */
export function handleSetBaselines(s: AppState, c: CommandOf<'setBaselines'>, _ctx: Ctx, pm: SeatMap): Result {
  // the check of the previous duties after the upgrade: all together, one undo
  const baseline = { ...s.baseline };
  let n = 0;
  for (const [id, b] of Object.entries(c.baselines)) {
    const pid = Number(id);
    if (!pm.has(pid) && !baseline[pid]) continue;
    const clean: Baseline = {};
    for (const [k, v] of Object.entries(b || {})) {
      const x = Math.max(0, Math.floor(Number(v) || 0));
      if (x) (clean as Record<string, number>)[k] = x;
    }
    if (JSON.stringify(clean) === JSON.stringify(baseline[pid] || {})) continue;
    if (Object.keys(clean).length) baseline[pid] = clean;
    else delete baseline[pid];
    n++;
  }
  const settings = s.settings.baselineReviewed ? s.settings : { ...s.settings, baselineReviewed: true };
  if (!n && settings === s.settings) return { state: s, text: '', files: [] };
  return {
    state: { ...s, baseline: n ? baseline : s.baseline, settings },
    text: n
      ? 'Προηγούμενες υπηρεσίες: άλλαξαν σε ' + n + (n === 1 ? ' άτομο' : ' άτομα')
      : 'Προηγούμενες υπηρεσίες: έμειναν όπως ήταν',
    files: n ? ['Έλεγχος υπηρεσιών'] : [],
  };
}
/** Handler of the command `setPersonal`. */
export function handleSetPersonal(s: AppState, c: CommandOf<'setPersonal'>): Result {
  // Extra data (IBAN, ΑΜΚΑ, ΑΦΜ, e-mail, blood group): written by themselves in the Δυναμολόγιο/ΣΤΕΛΕΧΗ
  // (kindsForPeople); not the numbers in the action history
  const keys = ['iban', 'amka', 'afm'] as const;
  const patch = <T extends Person | Cadre>(o: T): T => {
    const q: T = { ...o };
    for (const k of keys) {
      if (c[k] === undefined) continue;
      const v = normPersonal(k, c[k]);
      if (v) q[k] = v;
      else delete q[k];
    }
    return q;
  };
  const same = (a: Person | Cadre, b: Person | Cadre) =>
    keys.every((k) => a[k] === b[k]) && XKEYS.every((k) => (a as Person)[k] === (b as Person)[k]);
  if (c.cid) {
    const o = s.cadreList.find((x) => x.id === c.cid);
    if (!o) throw new Error('Δεν βρέθηκε το στέλεχος');
    const q = patch(o);
    if (same(o, q)) return { state: s, text: '', files: [] };
    return {
      state: { ...s, cadreList: s.cadreList.map((x) => (x === o ? q : x)) },
      text: 'Έξτρα στοιχεία: ' + rankTxt(o) + ' ' + o.last,
      files: [],
    };
  }
  const o = c.pid != null ? s.people.find((x) => x.id === c.pid) : undefined;
  if (!o) throw new Error('Δεν βρέθηκε το άτομο');
  const q = patch(o);
  for (const k of XKEYS) {
    if (c[k] === undefined) continue;
    const v = normExtra(k, c[k]);
    if (v) q[k] = v;
    else delete q[k];
  }
  if (same(o, q)) return { state: s, text: '', files: [] };
  return {
    state: { ...s, people: s.people.map((x) => (x === o ? q : x)) },
    text: 'Έξτρα στοιχεία: ' + shortName(o),
    files: [],
  };
}
/** Handler of the command `setPersonMove`. */
export function handleSetPersonMove(s: AppState, c: CommandOf<'setPersonMove'>, _ctx: Ctx, pm: SeatMap): Result {
  const p = pm.get(c.pid);
  if (!p) throw new Error('Δεν βρέθηκε το άτομο');
  if (c.date && !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) throw new Error('Λάθος ημερομηνία');
  const q: Person = { ...p };
  if (c.date) q[c.field] = c.date;
  else delete q[c.field];
  const what = c.field === 'inOn' ? '1. Εγγραφές' : '2. Διαγραφές';
  return {
    state: { ...s, people: s.people.map((x) => (x === p ? q : x)) },
    text: HK() + ' ' + what + ': ' + shortName(p) + (c.date ? ' στις ' + dm(c.date) : ', να μη γραφτεί'),
    files: [HK()],
  };
}
