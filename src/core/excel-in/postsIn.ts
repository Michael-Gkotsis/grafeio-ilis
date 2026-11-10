// Reading the sheets «ΠΟΣΤΑ» and «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» of the roster.
//
// Purpose: `planPosts` (a post per person) and `planOutside` (out of strength with a reason).
// Does NOT: write the sheets back (postsBack.ts) or apply the changes (the commands in src/shared/commands.ts do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/lib,
//   core/excel-in/sheetPeople.
// Why: these sheets are read together with the roster; what the sheet says wins, and a person missing from it loses
//   the post or returns to strength, except when a row that did not match might be that person.
// Covering tests: test/sources.test.ts, test/excel-misc.test.ts, test/linked.test.ts.
import { norm } from '../lib/text';
import { OUT_NOTE } from '../model/person';
import type { AppState } from '../model/state';
import type { RawSheet } from './roster';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';
import { type FieldsPlan, sheetPeople, nameOf, maybeIn } from './sheetPeople';
export { OUT_NOTE };

/** Posts: those in the sheet get their post; those who have a post in the app and are not in the sheet lose it. */
export function planPosts(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  choices: Record<number, number | null> = {},
): FieldsPlan {
  const sp = sheetPeople(sheet, b, s.people, choices);
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const plan: FieldsPlan = { changes: [], same: 0, listed: 0, sp };
  const has = new Set<number>();
  for (const row of sp.rows) {
    const post = norm(cellText(row.v.post));
    if (!post) continue;
    const p = pm.get(row.pid)!;
    has.add(p.id);
    plan.listed++;
    if ((p.post || '') === post) plan.same++;
    else
      plan.changes.push({
        pid: p.id,
        patch: { post },
        who: nameOf(p),
        what: (p.post ? p.post + ' → ' : 'πόστο ') + post,
      });
  }
  const maybe = maybeIn(sp);
  for (const p of s.people)
    if (p.post && !has.has(p.id) && !maybe.has(p.id))
      plan.changes.push({
        pid: p.id,
        patch: { post: null },
        who: nameOf(p),
        what: 'χωρίς πόστο (δεν είναι στο φύλλο)',
      });
  return plan;
}
/**
 * Out of strength: those in the sheet go out of strength with their reason; those who went out that way and are no
 * longer in the sheet return to strength.
 */
export function planOutside(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  choices: Record<number, number | null> = {},
): FieldsPlan {
  const sp = sheetPeople(sheet, b, s.people, choices);
  const pm = new Map(s.people.map((p) => [p.id, p]));
  const plan: FieldsPlan = { changes: [], same: 0, listed: 0, sp };
  const has = new Set<number>();
  for (const row of sp.rows) {
    const p = pm.get(row.pid)!;
    has.add(p.id);
    plan.listed++;
    const why = cellText(row.v.remarks);
    const notes = OUT_NOTE + (why ? ': ' + why : '');
    if (!p.active && p.notes === notes) {
      plan.same++;
      continue;
    }
    plan.changes.push({
      pid: p.id,
      patch: { active: false, notes },
      who: nameOf(p),
      what: p.active ? 'εκτός δύναμης' + (why ? ' (' + why + ')' : '') : 'λόγος: ' + (why || '—'),
    });
  }
  const maybe = maybeIn(sp);
  for (const p of s.people)
    if (!p.active && p.notes.startsWith(OUT_NOTE) && !has.has(p.id) && !maybe.has(p.id))
      plan.changes.push({
        pid: p.id,
        patch: { active: true, notes: '' },
        who: nameOf(p),
        what: 'ξανά σε δύναμη (δεν είναι πια στο φύλλο)',
      });
  return plan;
}
