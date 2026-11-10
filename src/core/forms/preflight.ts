// The pre-export checks (research §3.6): what must be right before a form is written.
//
// Purpose: `preflight` (the list of `Check`s for an export kind and a day), the three form checks (`frouraChecks`,
//   `hkaiChecks`, `outsChecks`) and `hasErrors`. ✕ (`err`) blocks the export, ⚠ (`warn`) needs «Το ξέρω, συνέχισε»
//   and is written to the history.
// Does NOT: write any form, show the list (the UI does) or change the data; it only reads the state.
// Owner layer: core/forms (pure: no fs, no Electron, no React); imports core/duty, core/hkai, core/people, core/model.
// Why: it runs in the UI (to show the list) and in main (so a form with ✕ is never produced). @decision Michael 17/10:
//   never a full block for a person-level problem (two posts, a status, an out): it is a ⚠, because the user may have
//   chosen it with a reason.
// Covering tests: test/cases.test.ts, test/hkai.test.ts, test/phase5-rest.test.ts, test/note-only.test.ts,
//   test/offdays.test.ts.
import { dm, dow, pskDays, type ISODate } from '../lib/dates';
import { KIND_NAME } from '../model/duty';
import { TYPES, type TypeKey } from '../model/status';
import { postTxt } from '../model/blocks';
import { shortName } from '../model/person';
import type { AppState } from '../model/state';
import type { ExportKind } from '../model/exportKind';
import { HK, hkRowLabel } from '../model/unit';
import { normGreek } from '../lib/text';
import { activePeople, personMap, seatMap } from '../duty/indexes';
import { capBlock } from '../duty/whoDoes';
import { dutyBlock, lastResort, statusWarn } from '../duty/leaveHours';
import { hkaiCounts } from '../duty/hkaiCount';
import { outBlock, outRoomsOn, ruleBlock } from '../duty/dutyCheck';
import { postsOf } from '../duty/posts';
import { seatlessOn } from '../duty/dutyIndex';
import { statusesFrom, statusesOn } from '../duty/statuses';
import { outMinOn } from '../duty/presence';
import { hkaiDiaLines, hkaiEgrLines, hkaiLeaveLines, hkaiPunLines, hkaiReqLines, paperLines } from '../hkai/hkaiText';
import { HK_A, HK_K, hkRowList } from '../people/hkRows';
import { live, isAway, leavePhrase } from '../people/kinds';
import { rankTxt } from '../people/ranks';

/** One finding: `err` blocks the export, `warn` needs a confirmation; `go` is the screen that fixes it. */
export interface Check {
  level: 'err' | 'warn';
  text: string;
  go?: 'guard' | 'outs' | 'records' | 'settings' | 'people' | 'cadre';
}

/** All checks for an export of `kind` on `date` (ISODate); the ΠΣΚ kinds check each of their three days. */
export function preflight(kind: ExportKind, s: AppState, date: ISODate): Check[] {
  // ΠΣΚ: the checks of the three days, with the day in front
  if (kind === 'frouraPsk' || kind === 'outsPsk')
    return pskDays(date).flatMap((d) =>
      preflight(kind === 'frouraPsk' ? 'froura' : 'outs', s, d).map((c) => ({
        ...c,
        text: dow(d) + ' ' + dm(d) + ': ' + c.text,
      })),
    );
  if (kind === 'froura') return frouraChecks(s, date);
  if (kind === 'hkai') return hkaiChecks(s, date);
  if (kind === 'outs') return outsChecks(s, date);
  return [];
}

const outOn = (s: AppState, pid: number, date: ISODate) =>
  statusesOn(live(s), pid, date).find((x) => TYPES[x.type].cat === 'out');
const fromOut = (s: AppState, pid: number, date: ISODate) => statusesFrom(live(s), pid, date, outMinOn(s, date));

/** Checks of the ΦΡΟΥΡΑ of one day: empty posts, people out of the force, double posts, rules, weapons. */
export function frouraChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = [];
  const pm = seatMap(s);
  const g = s.guards[date] || {};
  const posts = postsOf(s.settings);
  const empty = posts.filter((x) => !g[x.k]);
  if (empty.length === posts.length)
    out.push({
      level: 'warn',
      text: 'Δεν έχει οριστεί καμία υπηρεσία για ' + dm(date) + '. Θα βγει κενό έντυπο.',
      go: 'guard',
    });
  else if (empty.length)
    out.push({
      level: 'warn',
      text: empty.length + ' κενές θέσεις (θα γραφτεί «ΚΕΝΗ»): ' + empty.map((x) => x.label).join(', '),
      go: 'guard',
    });
  const seen = new Map<number, string>();
  // the same day without assignments, once: otherwise the duty index is rebuilt for every post
  const without: AppState = { ...s, guards: { ...s.guards, [date]: {} } };
  for (const x of posts) {
    const pid = g[x.k];
    if (!pid) continue;
    const p = pm.get(pid);
    const name = p ? shortName(p) : 'άγνωστος';
    if (!p || !p.active) {
      out.push({ level: 'err', text: name + ' είναι εκτός δύναμης αλλά είναι ' + x.label, go: 'guard' });
      continue;
    }
    // two posts, a status, an out: ⚠, not ✕; the user may have chosen it with a reason
    // (@decision Michael 17/10: never a full block)
    if (seen.has(pid))
      out.push({
        level: 'warn',
        text: name + ' είναι σε δύο θέσεις: ' + seen.get(pid) + ' και ' + x.label,
        go: 'guard',
      });
    seen.set(pid, x.label);
    const hard = dutyBlock(live(s), date, pid, x, s.settings.lists);
    if (hard) out.push({ level: 'warn', text: name + ' (' + postTxt(x) + '): ' + hard, go: 'guard' });
    else if (outOn(s, pid, date))
      out.push({ level: 'warn', text: name + ' είναι και υπηρεσία και εξοδούχος', go: 'guard' });
    const sl = seatlessOn(s, date, pid);
    if (sl)
      out.push({
        level: 'warn',
        text:
          name +
          ' (' +
          postTxt(x) +
          '): την ίδια μέρα και ' +
          KIND_NAME[sl.kind].toLowerCase() +
          ' χωρίς θέση (από Excel), δύο υπηρεσίες',
        go: 'guard',
      });
    const soft =
      capBlock(s, date, pid, x) ||
      ruleBlock(without, date, pid, undefined, x.k) ||
      lastResort(live(s), date, pid, x, s.settings.lists) ||
      statusWarn(s, date, pid);
    if (soft) out.push({ level: 'warn', text: name + ' (' + postTxt(x) + '): ' + soft, go: 'guard' });
    if (p.cid && x.armed && !p.weapon)
      out.push({
        level: 'warn',
        text: name + ' (' + postTxt(x) + '): Ένοπλη χωρίς όπλο (γράψε τον αριθμό όπλου στην κάρτα του στελέχους)',
        go: 'cadre',
      });
  }
  return out;
}

/** Checks of the «ΗΚΑΙ» of one day: counted twice, ranks vs force, missing cadre/posts, back-page length. */
export function hkaiChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = [];
  const pm = personMap(s.people);
  const h = hkaiCounts(s, date);
  // every person in one column only
  const counted = new Map<number, number>();
  Object.values(h.cols).forEach((list) => list.forEach((p) => counted.set(p.id, (counted.get(p.id) || 0) + 1)));
  const twice = [...counted].filter(([, n]) => n > 1).map(([id]) => shortName(pm.get(id)!));
  if (twice.length) out.push({ level: 'err', text: 'Μετριούνται δύο φορές: ' + twice.join(', ') });
  // same full name in the roster and in the cadre (e.g. ΕΠΟΠ): counted twice in the force of the «ΗΚΑΙ»
  const key = (l: string, f: string) =>
    normGreek(l + ' ' + f)
      .replace(/[^Α-ΩA-Z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const sold = new Set(s.people.filter((p) => p.active).map((p) => key(p.last, p.first)));
  const both = (s.cadreList || []).filter((c) => c.active && sold.has(key(c.last, c.first)));
  if (both.length)
    out.push({
      level: 'warn',
      text:
        'Και στο Δυναμολόγιο και στα Στελέχη (μετρούν δύο φορές): ' +
        both.map((c) => rankTxt(c) + ' ' + c.last + ' ' + c.first).join(', ') +
        '. Κράτησέ τους σε ένα από τα δύο.',
      go: 'cadre',
    });
  // per rank: prevented + absent do not exceed the force
  for (const r of hkRowList(s.settings.lists)) {
    const row = h.rank[r];
    const used = [...HK_K, ...HK_A].reduce((a, [k]) => a + (row.c[k] || 0), 0);
    if (used > row.n)
      out.push({
        level: 'err',
        text:
          hkRowLabel(r, s.settings) +
          ': κωλυόμενοι και απόντες (' +
          used +
          ') περισσότεροι από τη δύναμη (' +
          row.n +
          ')',
      });
  }
  const sum = Object.values(h.rank).reduce((a, r) => a + r.n, 0);
  if (sum !== h.total)
    out.push({ level: 'err', text: 'Το σύνολο ανά βαθμό (' + sum + ') δεν συμφωνεί με τη δύναμη (' + h.total + ')' });
  if (h.avail !== h.total - h.apo) out.push({ level: 'err', text: 'Διαθέσιμοι ≠ Δύναμη − Απόντες' });
  // cadre: from the Στελέχη card or, without it, from the numbers per rank (UX Π6: it used to warn every day even when
  // the Στελέχη card had people and the «ΗΚΑΙ» counted them correctly)
  if (!(s.cadreList || []).some((c) => c.active) && !Object.values(s.settings.cadre).some((n) => n > 0))
    out.push({
      level: 'warn',
      text: 'Δεν υπάρχουν στελέχη: πέρασέ τα στην καρτέλα Στελέχη (ή γράψε πόσοι είναι ανά βαθμό στην ' + HK() + ').',
      go: 'cadre',
    });
  if (!Object.keys(s.guards[date] || {}).length)
    out.push({
      level: 'warn',
      text: 'Δεν έχουν οριστεί υπηρεσίες για ' + dm(date) + ': η στήλη «Υπηρεσία» θα είναι 0.',
      go: 'guard',
    });
  for (const [ls, what] of [
    [hkaiEgrLines(s, date), '1. Εγγραφές'],
    [hkaiDiaLines(s, date), '2. Διαγραφές'],
    [hkaiLeaveLines(s, date), '3. Άδειες'],
    [hkaiPunLines(s, date), '4. Ποινές'],
    [hkaiReqLines(s, date), '5. Αιτήσεις'],
  ] as const) {
    const n = paperLines(ls);
    if (n > 10)
      out.push({
        level: 'warn',
        text:
          what +
          ': περίπου ' +
          n +
          ' γραμμές στην πίσω σελίδα. Θα χωρέσει με μικρότερα γράμματα ή θα περάσει σε δεύτερη σελίδα.',
      });
  }
  if (!activePeople(s).length)
    out.push({ level: 'err', text: 'Δεν υπάρχει προσωπικό. Κάνε πρώτα εισαγωγή Δυναμολογίου.', go: 'settings' });
  return out;
}

/** Checks of the Εξοδούχοι of one day: nobody out, out but blocked, ΔΝ without the right, rooms that may not go out. */
export function outsChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = [];
  const pm = personMap(s.people);
  const outs = activePeople(s)
    .map((p) => ({ p, st: outOn(s, p.id, date) }))
    .filter((x) => x.st);
  if (!outs.length)
    out.push({
      level: 'warn',
      text: 'Κανένας εξοδούχος για ' + dm(date) + ': θα βγουν όλοι παραμένοντες.',
      go: 'outs',
    });
  for (const { p, st } of outs) {
    const r = outBlock(s, date, p.id);
    if (r) out.push({ level: 'warn', text: shortName(p) + ' είναι εξοδούχος αλλά δεν βγαίνει: ' + r, go: 'outs' });
    const away = fromOut(s, p.id, date).find(
      (x) => x !== st && isAway(x, s.settings.lists) && TYPES[x.type].cat !== 'out',
    );
    if (away)
      out.push({
        level: 'warn',
        text:
          shortName(p) +
          ' είναι εξοδούχος και ' +
          (away.type === 'LEAVE' ? leavePhrase(away) : TYPES[away.type].long).toLowerCase(),
        go: 'outs',
      });
  }
  // ΔΝ without the right: only once the ΔΝ right is marked on at least one person (as in the Εξοδούχοι screen)
  if (s.people.some((p) => p.dn))
    for (const { p, st } of outs)
      if (st!.type === 'DN' && !p.dn)
        out.push({
          level: 'warn',
          text: shortName(p) + ": ΔΝ χωρίς δικαίωμα ΔΝ (βάλ' το στην καρτέλα του ή άλλαξέ το σε έξοδο)",
          go: 'outs',
        });
  const rooms = outRoomsOn(s.rules, date);
  if (rooms) {
    const wrong = outs.filter((x) => x.p.room != null && !rooms.includes(x.p.room) && x.st!.type !== ('DN' as TypeKey));
    if (wrong.length)
      out.push({
        level: 'warn',
        text:
          'Βγαίνουν από θαλάμους που σήμερα μένουν (βγαίνουν οι ' +
          rooms.join(',') +
          '): ' +
          wrong.map((x) => shortName(x.p) + ' Θ' + x.p.room).join(', '),
        go: 'outs',
      });
  }
  void pm;
  return out;
}

/** True when at least one check blocks the export (`err`). */
export const hasErrors = (cs: Check[]) => cs.some((c) => c.level === 'err');
