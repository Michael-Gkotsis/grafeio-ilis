// Προέλεγχος πριν από κάθε έντυπο (έρευνα §3.6): ✕ μπλοκάρει, ⚠ θέλει «Το ξέρω, συνέχισε» και γράφεται στο ιστορικό.
// Τρέχει και στο UI (για να δείξει τη λίστα) και στο main (για να μη βγει ποτέ έντυπο με ✕).
import { dm, type ISODate } from './dates';
import { TYPES, postTxt, shortName, type AppState, type TypeKey } from './domain';
import {
  activePeople, capBlock, dutyBlock, lastResort, hkaiCounts, outBlock, outRoomsOn, personMap, postsOf, ruleBlock, statusesOn, HK_A, HK_K, HK_NCO, HK_OFFICERS
} from './rules';
import type { ExportKind } from './api';

export interface Check { level: 'err' | 'warn'; text: string; go?: 'guard' | 'outs' | 'records' | 'settings' | 'people' }

export function preflight(kind: ExportKind, s: AppState, date: ISODate): Check[] {
  if (kind === 'froura') return frouraChecks(s, date);
  if (kind === 'hkai') return hkaiChecks(s, date);
  if (kind === 'outs') return outsChecks(s, date);
  return [];
}

const outOn = (s: AppState, pid: number, date: ISODate) => statusesOn(s.statuses, pid, date).find(x => TYPES[x.type].cat === 'out');

export function frouraChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = []; const pm = personMap(s.people);
  const g = s.guards[date] || {}; const posts = postsOf(s.settings);
  const empty = posts.filter(x => !g[x.k]);
  if (empty.length === posts.length) out.push({ level: 'warn', text: 'Δεν έχει οριστεί καμία υπηρεσία για ' + dm(date) + '. Θα βγει κενό έντυπο.', go: 'guard' });
  else if (empty.length) out.push({ level: 'warn', text: empty.length + ' κενές θέσεις (θα γραφτεί «ΚΕΝΗ»): ' + empty.map(x => x.label).join(', '), go: 'guard' });
  const seen = new Map<number, string>();
  for (const x of posts) {
    const pid = g[x.k]; if (!pid) continue;
    const p = pm.get(pid); const name = p ? shortName(p) : 'άγνωστος';
    if (!p || !p.active) { out.push({ level: 'err', text: name + ' είναι εκτός δύναμης αλλά είναι ' + x.label, go: 'guard' }); continue; }
    if (seen.has(pid)) out.push({ level: 'err', text: name + ' είναι σε δύο θέσεις: ' + seen.get(pid) + ' και ' + x.label, go: 'guard' });
    seen.set(pid, x.label);
    const hard = dutyBlock(s.statuses, date, pid, x);
    if (hard) out.push({ level: 'err', text: name + ' (' + postTxt(x) + '): ' + hard, go: 'guard' });
    else if (outOn(s, pid, date)) out.push({ level: 'err', text: name + ' είναι και υπηρεσία και εξοδούχος', go: 'guard' });
    const soft = capBlock(s, pid, x) || ruleBlock({ ...s, guards: { ...s.guards, [date]: {} } }, date, pid, undefined, x.k) || lastResort(s.statuses, date, pid, x);
    if (soft) out.push({ level: 'warn', text: name + ' (' + postTxt(x) + '): ' + soft, go: 'guard' });
  }
  return out;
}

export function hkaiChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = []; const pm = personMap(s.people);
  const h = hkaiCounts(s, date);
  // κάθε άτομο σε μία μόνο στήλη
  const counted = new Map<number, number>();
  Object.values(h.cols).forEach(list => list.forEach(p => counted.set(p.id, (counted.get(p.id) || 0) + 1)));
  const twice = [...counted].filter(([, n]) => n > 1).map(([id]) => shortName(pm.get(id)!));
  if (twice.length) out.push({ level: 'err', text: 'Μετριούνται δύο φορές: ' + twice.join(', ') });
  // ανά βαθμό: κωλυόμενοι + απόντες δεν ξεπερνούν τη δύναμη
  for (const r of [...HK_OFFICERS, ...HK_NCO]) {
    const row = h.rank[r]; const used = [...HK_K, ...HK_A].reduce((a, [k]) => a + (row.c[k] || 0), 0);
    if (used > row.n) out.push({ level: 'err', text: r + ': κωλυόμενοι και απόντες (' + used + ') περισσότεροι από τη δύναμη (' + row.n + ')' });
  }
  const sum = Object.values(h.rank).reduce((a, r) => a + r.n, 0);
  if (sum !== h.total) out.push({ level: 'err', text: 'Το σύνολο ανά βαθμό (' + sum + ') δεν συμφωνεί με τη δύναμη (' + h.total + ')' });
  if (h.avail !== h.total - h.apo) out.push({ level: 'err', text: 'Διαθέσιμοι ≠ Δύναμη − Απόντες' });
  if (!Object.values(s.settings.cadre).some(n => n > 0)) out.push({ level: 'warn', text: 'Τα στελέχη ανά βαθμό είναι όλα 0. Συμπλήρωσέ τα στις Ρυθμίσεις.', go: 'settings' });
  if (!Object.keys(s.guards[date] || {}).length) out.push({ level: 'warn', text: 'Δεν έχουν οριστεί υπηρεσίες για ' + dm(date) + ': η στήλη «Υπηρεσία» θα είναι 0.', go: 'guard' });
  const late = s.statuses.filter(x => x.type === 'PUN' && x.pending && x.from < date && pm.get(x.pid)?.active);
  if (late.length) out.push({ level: 'warn', text: 'Ποινές που αιτούνται ακόμα αλλά έπρεπε να έχουν ξεκινήσει: ' + late.map(x => shortName(pm.get(x.pid)!) + ' (από ' + dm(x.from) + ')').join(', ') + '. Αν εγκρίθηκαν, πάτα «Εγκρίθηκε».', go: 'records' });
  if (!activePeople(s).length) out.push({ level: 'err', text: 'Δεν υπάρχει προσωπικό. Κάνε πρώτα εισαγωγή Δυναμολογίου.', go: 'settings' });
  return out;
}

export function outsChecks(s: AppState, date: ISODate): Check[] {
  const out: Check[] = []; const pm = personMap(s.people);
  const outs = activePeople(s).map(p => ({ p, st: outOn(s, p.id, date) })).filter(x => x.st);
  if (!outs.length) out.push({ level: 'warn', text: 'Κανένας εξοδούχος για ' + dm(date) + ': θα βγουν όλοι παραμένοντες.', go: 'outs' });
  for (const { p, st } of outs) {
    const r = outBlock(s, date, p.id);
    if (r) out.push({ level: 'err', text: shortName(p) + ' είναι εξοδούχος αλλά δεν βγαίνει: ' + r, go: 'outs' });
    const away = statusesOn(s.statuses, p.id, date).find(x => x !== st && TYPES[x.type].away && TYPES[x.type].cat !== 'out');
    if (away) out.push({ level: 'err', text: shortName(p) + ' είναι εξοδούχος και ' + TYPES[away.type].long.toLowerCase(), go: 'outs' });
  }
  const rooms = outRoomsOn(s.rules, date);
  if (rooms) {
    const wrong = outs.filter(x => x.p.room != null && !rooms.includes(x.p.room) && x.st!.type !== ('DN' as TypeKey));
    if (wrong.length) out.push({ level: 'warn', text: 'Βγαίνουν από θαλάμους που σήμερα μένουν (βγαίνουν οι ' + rooms.join(',') + '): ' + wrong.map(x => shortName(x.p) + ' Θ' + x.p.room).join(', '), go: 'outs' });
  }
  void pm;
  return out;
}

export const hasErrors = (cs: Check[]) => cs.some(c => c.level === 'err');
