// Handlers: the cadre («Στελέχη»): save, delete, order, absences and the Excel imports.
//
// Purpose: The handlers of `saveCadre`, `importCadres`, `importCadreAbs`, `orderCadre`, `deleteCadre`, `addCadreAbs`,
//   `deleteCadreAbs`. Each one is the old `case` body of `run`, unchanged.
// Does NOT: touch the soldiers (people.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/stelexi.test.ts, test/cadre-tab.test.ts, test/cadre-excel.test.ts,
//   test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { addDays, dm } from '../../lib/dates';
import { normGreek, upper } from '../../lib/text';
import type { AppState } from '../../model/state';
import type { Cadre, CadreAbs } from '../../model/cadreRecord';
import { nextCadrePid } from '../../duty/indexes';
import { cadreAbsOf } from '../../people/kinds';
import { guessHk } from '../../people/hkRows';
import { itemKey, itemName, listRows, rankTxt, withOrigin } from '../../people/ranks';
import { insertCadre, isManualOrder } from '../../cadre/cadre';
import { normPos, normRack, normWeapon } from '../../weapons/weaponKeys';
import { normPersonal, PKEYS } from '../../people/personal';
import type { CommandOf, Ctx, Result } from '../types';
import { run } from '../run';
import { range } from '../statusText';

/** Handler of the command `saveCadre`. */
export function handleSaveCadre(s: AppState, c: CommandOf<'saveCadre'>, ctx: Ctx): Result {
  const c0 = c.cadre;
  const last = normGreek(c0.last || '').trim(),
    first = normGreek(c0.first || '').trim();
  if (!last) throw new Error('Γράψε επώνυμο');
  const old = c0.id ? s.cadreList.find((x) => x.id === c0.id) : undefined;
  const ro = withOrigin(
    { rank: (c0.rank || '').trim().replace(/\s+/g, ' ').toUpperCase(), origin: c0.origin },
    s.settings.lists,
  );
  const x: Cadre = {
    id: old?.id || 's' + ctx.newId(),
    rank: ro.rank,
    ...(ro.origin ? { origin: ro.origin } : {}),
    hk: c0.hk,
    last,
    first,
    active: c0.active ?? old?.active ?? true,
  };
  if (c0.spec?.trim()) x.spec = itemName(c0.spec, 'specs');
  if (c0.am?.trim()) x.am = c0.am.trim().toUpperCase();
  if (c0.phone?.trim()) x.phone = c0.phone.trim();
  if (c0.role?.trim()) x.role = c0.role.trim();
  if (old?.pos != null) x.pos = old.pos;
  // specialty (Δυναμολόγιο-Παρουσιολόγιο of the cadre)
  if (c0.eid?.trim()) x.eid = upper(c0.eid.trim().replace(/\s+/g, ' '));
  // extra data: they change only from their tab (setPersonal)
  for (const k of ['iban', 'amka', 'afm'] as const) if (old?.[k]) x[k] = old[k];
  // ΕΠΟΠ/ΟΒΑ with duties in the month: the post number once (negative), and it stays even if you delete the limit
  const mx = Math.floor(Number(c0.monthMax));
  if (mx > 0) x.monthMax = mx;
  if (old?.pid != null) x.pid = old.pid;
  else if (mx > 0) x.pid = nextCadrePid(s.cadreList);
  // cadre weapon (armed posts): same normalization as Weapons
  const wv = {
    weapon: normWeapon,
    wtype: (v: unknown) =>
      String(v ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase(),
    rack: normRack,
    wpos: normPos,
  } as const;
  for (const f of ['weapon', 'wtype', 'rack', 'wpos'] as const) {
    const v = wv[f](c0[f]);
    if (v) x[f] = v;
  }
  // went out of strength: leaves the duties from today on (like the soldier)
  let guards = s.guards;
  if (old?.active && !x.active && x.pid != null)
    for (const d of Object.keys(guards))
      if (d >= ctx.today && Object.values(guards[d] || {}).includes(x.pid)) {
        const g = { ...guards[d] };
        for (const k in g) if (g[k] === x.pid) delete g[k];
        guards = { ...guards, [d]: g };
      }
  // in manual order the new one goes below the same or higher ranks (then he moves it where he wants)
  const cadreList = old
    ? s.cadreList.map((y) => (y === old ? x : y))
    : isManualOrder(s.cadreList)
      ? insertCadre(s.cadreList, x)
      : [...s.cadreList, x];
  // new origin typed by hand: stays in the Lists, as with the soldier
  const o = x.origin;
  const lists0 = s.settings.lists;
  const settings =
    o &&
    !/[,"]/.test(o) &&
    itemKey(o) !== itemKey(old?.origin || '') &&
    !listRows(lists0, 'origins').some((r) => itemKey(r.name) === itemKey(o))
      ? {
          ...s.settings,
          lists: {
            ...lists0,
            origins: { ...(lists0?.origins || {}), add: [...(lists0?.origins?.add || []), { name: o }] },
          },
        }
      : s.settings;
  return {
    state: { ...s, cadreList, guards, settings },
    text:
      (old ? 'Άλλαξαν τα στοιχεία στελέχους: ' : 'Νέο στέλεχος: ') +
      rankTxt(x) +
      ' ' +
      x.last +
      ' ' +
      x.first +
      (x.monthMax ? ' (υπηρεσίες ' + x.monthMax + ' τον μήνα)' : ''),
    files: guards !== s.guards ? [HK(), 'Υπηρεσίες', 'Έλεγχος υπηρεσιών'] : [HK()],
  };
}
/** Handler of the command `importCadres`. */
export function handleImportCadres(s: AppState, c: CommandOf<'importCadres'>, ctx: Ctx): Result {
  // every cadre member goes through saveCadre (normalization, origin, ΗΚΑΙ, order); IBAN/ΑΜΚΑ/ΑΦΜ come after, as in
  // setPersonal
  let st = s;
  let nAdd = 0,
    nUpd = 0;
  const personal = (id: string, src: Partial<Cadre>) => {
    const o = st.cadreList.find((x) => x.id === id);
    if (!o) return;
    const q: Cadre = { ...o };
    for (const k of PKEYS) {
      if (!(k in src)) continue;
      const v = normPersonal(k, src[k]);
      if (v) q[k] = v;
      else delete q[k];
    }
    if (PKEYS.some((k) => q[k] !== o[k])) st = { ...st, cadreList: st.cadreList.map((x) => (x === o ? q : x)) };
  };
  for (const a of c.adds || []) {
    if (!String(a?.last || '').trim()) continue;
    const known = new Set(st.cadreList.map((x) => x.id));
    const r = run(
      st,
      { t: 'saveCadre', cadre: { ...a, hk: a.hk || guessHk(a.rank || '', st.settings.lists, a.origin) } },
      ctx,
    );
    st = r.state;
    nAdd++;
    const nu = st.cadreList.find((x) => !known.has(x.id));
    if (nu) personal(nu.id, a);
  }
  for (const u of c.updates || []) {
    const old = st.cadreList.find((x) => x.id === u.id);
    if (!old) continue;
    const r = run(st, { t: 'saveCadre', cadre: { ...old, ...u.patch } as Cadre }, ctx);
    st = r.state;
    personal(u.id, u.patch);
    nUpd++;
  }
  if (!nAdd && !nUpd) return { state: s, text: '', files: [] };
  return {
    state: st,
    text:
      'Από Excel (' +
      c.source +
      '), στελέχη: ' +
      [nAdd && nAdd + (nAdd === 1 ? ' νέο' : ' νέα'), nUpd && nUpd + (nUpd === 1 ? ' αλλαγή' : ' αλλαγές')]
        .filter(Boolean)
        .join(', '),
    files: [HK()],
    source: 'excel',
  };
}
/** Handler of the command `importCadreAbs`. */
export function handleImportCadreAbs(s: AppState, c: CommandOf<'importCadreAbs'>, ctx: Ctx): Result {
  let st = s;
  let nAdd = 0,
    nUpd = 0,
    nDel = 0;
  for (const id of c.deletes || []) {
    if (!st.cadreAbs.some((a) => a.id === id)) continue;
    st = { ...st, cadreAbs: st.cadreAbs.filter((a) => a.id !== id) };
    nDel++;
  }
  for (const u of c.updates || []) {
    const a = st.cadreAbs.find((x) => x.id === u.id);
    if (!a) continue;
    const note = String(u.note || '').trim();
    st = {
      ...st,
      cadreAbs: st.cadreAbs.map((x) => {
        if (x !== a) return x;
        const { note: _o, ...rest } = x;
        return note ? { ...rest, note } : rest;
      }),
    };
    nUpd++;
  }
  for (const a of c.adds || []) {
    if (
      !st.cadreList.some((x) => x.id === a.cid) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.from || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.to || '') ||
      a.to < a.from
    )
      continue;
    st = run(
      st,
      {
        t: 'addCadreAbs',
        abs: { cid: a.cid, kind: a.kind, from: a.from, to: a.to, ...(a.note ? { note: a.note } : {}) },
        replace: true,
      },
      ctx,
    ).state;
    nAdd++;
  }
  if (!nAdd && !nUpd && !nDel) return { state: s, text: '', files: [] };
  return {
    state: st,
    text:
      'Από Excel (' +
      c.source +
      '), καταστάσεις στελεχών: ' +
      [
        nAdd && nAdd + (nAdd === 1 ? ' νέα' : ' νέες'),
        nUpd && nUpd + (nUpd === 1 ? ' αλλαγή' : ' αλλαγές'),
        nDel && nDel + ' σβήστηκαν',
      ]
        .filter(Boolean)
        .join(', '),
    files: [HK()],
    source: 'excel',
  };
}
/** Handler of the command `orderCadre`. */
export function handleOrderCadre(s: AppState, c: CommandOf<'orderCadre'>): Result {
  const ids = new Set(c.ids);
  const by = new Map(s.cadreList.map((x) => [x.id, x]));
  if (ids.size !== c.ids.length || c.ids.length !== s.cadreList.length || c.ids.some((id) => !by.has(id)))
    throw new Error('Άλλαξε η λίστα των στελεχών, δοκίμασε ξανά');
  return {
    state: { ...s, cadreList: c.ids.map((id, pos) => ({ ...by.get(id)!, pos })) },
    text: 'Άλλαξε η σειρά των στελεχών',
    files: [],
  };
}
/** Handler of the command `deleteCadre`. */
export function handleDeleteCadre(s: AppState, c: CommandOf<'deleteCadre'>): Result {
  const x = s.cadreList.find((y) => y.id === c.id);
  if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
  if (
    x.pid != null &&
    (Object.values(s.guards).some((g) => Object.values(g || {}).includes(x.pid!)) ||
      Object.values(s.dutyLog || {}).some((l) => l.some((e) => e.pid === x.pid)))
  )
    throw new Error(
      'Ο ' +
        rankTxt(x) +
        ' ' +
        x.last +
        " έχει υπηρεσίες στο ημερολόγιο. Βάλ' τον «εκτός δύναμης» από τα «Στοιχεία», για να μείνει το ιστορικό.",
    );
  return {
    state: {
      ...s,
      cadreList: s.cadreList.filter((y) => y !== x),
      cadreAbs: s.cadreAbs.filter((a) => a.cid !== x.id),
    },
    text: 'Διαγράφηκε το στέλεχος ' + rankTxt(x) + ' ' + x.last,
    files: [HK()],
  };
}
/** Handler of the command `addCadreAbs`. */
export function handleAddCadreAbs(s: AppState, c: CommandOf<'addCadreAbs'>, ctx: Ctx): Result {
  const x = s.cadreList.find((y) => y.id === c.abs.cid);
  if (!x) throw new Error('Δεν βρέθηκε το στέλεχος');
  if (c.abs.to < c.abs.from) throw new Error('Το «έως» είναι πριν από το «από»');
  const old = c.abs.id ? s.cadreAbs.find((a) => a.id === c.abs.id) : undefined;
  if (c.abs.id && !old) throw new Error('Δεν βρέθηκε η κατάσταση');
  // one status per day (one column in the ΗΚΑΙ): the screen asks first, and with «replace» the new one cuts the old
  // ones on those days
  const clash = s.cadreAbs.filter((a) => a !== old && a.cid === x.id && a.from <= c.abs.to && c.abs.from <= a.to);
  if (clash.length && !c.replace)
    throw new Error(x.last + ' έχει ήδη κατάσταση ' + dm(clash[0].from) + '–' + dm(clash[0].to));
  const abs: CadreAbs = { ...c.abs, id: old?.id || 'a' + ctx.newId() };
  if (!abs.note) delete abs.note;
  const cut = clash.flatMap((a) => {
    const parts: CadreAbs[] = [];
    if (a.from < abs.from) parts.push({ ...a, to: addDays(abs.from, -1) });
    if (a.to > abs.to) parts.push({ ...a, id: parts.length ? 'a' + ctx.newId() : a.id, from: addDays(abs.to, 1) });
    return parts;
  });
  const base = s.cadreAbs.filter((a) => !clash.includes(a));
  const cadreAbs = old ? [...base.map((a) => (a === old ? abs : a)), ...cut] : [...base, ...cut, abs];
  const lbl = cadreAbsOf(abs.kind, s.settings.lists)?.[1] || abs.kind;
  return {
    state: { ...s, cadreAbs },
    text:
      'Στέλεχος: ' +
      rankTxt(x) +
      ' ' +
      x.last +
      ', ' +
      lbl.toLowerCase() +
      ' ' +
      range(abs.from, abs.to) +
      (old ? ' (αλλαγή)' : '') +
      (clash.length ? ', στη θέση ' + (clash.length === 1 ? 'άλλης' : clash.length + ' άλλων') : ''),
    files: [HK()],
  };
}
/** Handler of the command `deleteCadreAbs`. */
export function handleDeleteCadreAbs(s: AppState, c: CommandOf<'deleteCadreAbs'>): Result {
  const a = s.cadreAbs.find((y) => y.id === c.id);
  if (!a) throw new Error('Δεν βρέθηκε η κατάσταση');
  const x = s.cadreList.find((y) => y.id === a.cid);
  return {
    state: { ...s, cadreAbs: s.cadreAbs.filter((y) => y !== a) },
    text: 'Διαγράφηκε κατάσταση στελέχους' + (x ? ': ' + rankTxt(x) + ' ' + x.last : ''),
    files: [HK()],
  };
}
