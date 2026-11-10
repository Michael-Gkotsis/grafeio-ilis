// A new soldier as the roster import writes him, and the lists he adds.
//
// Purpose: `shapePerson` (clean a new soldier: «ΕΠΟΠ ΣΤΡ» becomes rank ΣΤΡ with origin ΕΠΟΠ), `makePerson` (with the
//   duplicate check), `twinText` and `rememberChoices` (a new rank, origin or specialty goes to the Lists, Michael
//   17/10).
// Does NOT: save the soldier.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: The form «Νέος στρατιώτης» and the quick add must produce the same person as the roster import (roster.ts), so
//   that he matches later.
// Covering tests: test/new-soldier.test.ts, test/quick-add.test.ts, test/origin.test.ts.
import { norm, normGreek } from '../lib/text';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import type { Settings } from '../model/settings';
import { itemKey, itemName, listRows, rankTxt, withOrigin } from '../people/ranks';
import type { ListId, UserLists } from '../model/lists';
import type { NewPerson } from './types';
import { personKey } from '../people/personKey';

/**
 * A new rank, origin or Ο/Σ typed by hand in the soldier form stays in the Lists (Settings › Lists), so that it is
 * suggested from now on (Michael, 17/10: «έτοιμη η εισαγωγή νέου βαθμού και να την αποθηκεύει»). In a correction
 * only if it changed: whatever came from the roster is suggested anyway.
 */
export function rememberChoices(st: Settings, p: Person, old?: Person): Settings {
  let lists = st.lists;
  for (const [id, v, was] of [
    ['soldierRanks', p.rank, old?.rank],
    ['origins', p.origin, old?.origin],
    ['specs', p.spec, old?.spec],
  ] as [ListId, string | undefined, string | undefined][]) {
    const n = itemName(v || '', id);
    if (!n || (old && itemKey(n) === itemKey(was || ''))) continue;
    if (/[,"]/.test(n) || listRows(lists, id).some((r) => itemKey(r.name) === itemKey(n))) continue;
    lists = { ...lists, [id]: { ...(lists?.[id] || {}), add: [...(lists?.[id]?.add || []), { name: n }] } };
  }
  return lists === st.lists ? st : { ...st, lists };
}
/**
 * A new soldier as the roster import writes him (roster.ts), so that he matches later; «ΕΠΟΠ ΣΤΡ» in the rank
 * becomes rank ΣΤΡ with origin ΕΠΟΠ.
 */
export function shapePerson(x: NewPerson, id: number, lists?: UserLists): Person {
  const t = (v: unknown) =>
    String(v ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const p: Person = withOrigin(
    {
      ...x,
      id,
      active: true,
      added: true,
      rank: normGreek(t(x.rank)),
      spec: normGreek(t(x.spec)),
      last: norm(t(x.last)),
      first: norm(t(x.first)),
      father: norm(t(x.father)),
      asm: t(x.asm).replace(/\s/g, ''),
      phone: t(x.phone).replace(/\s/g, ''),
      si: normGreek(t(x.si)),
      essos: t(x.essos),
      room: x.room != null && x.room > 0 ? Math.floor(x.room) : null,
      post: t(x.post) ? norm(t(x.post)) : null,
      role: t(x.role) ? norm(t(x.role)) : null,
      attached: !!x.attached,
      notes: t(x.notes),
    },
    lists,
  );
  if (!x.weapon?.trim()) delete p.weapon;
  else p.weapon = x.weapon.trim();
  if (!x.siCat?.trim()) delete p.siCat;
  else p.siCat = normGreek(t(x.siCat));
  if (!p.dn) delete p.dn;
  if (!p.offDays?.length) delete p.offDays;
  if (!(Number(x.monthMax) > 0)) delete p.monthMax;
  else p.monthMax = Math.floor(Number(x.monthMax));
  return p;
}
/** twin: same ΑΣΜ, or same full name and father name. */
export const twinText = (twin: Person, asm: string) =>
  'Υπάρχει ήδη ' +
  (twin.asm && twin.asm === asm ? 'άτομο με ΑΣΜ ' + asm + ': ' : 'ο ') +
  rankTxt(twin) +
  ' ' +
  twin.last +
  ' ' +
  twin.first +
  (twin.father ? ' του ' + twin.father : '') +
  (twin.active ? '' : ' (εκτός δύναμης)');
/**
 * A new soldier for `s`: shaped by `shapePerson` and checked for a twin. Throws the Greek messages «Γράψε επώνυμο
 * και όνομα» and `twinText`.
 */
export function makePerson(s: AppState, x: NewPerson): Person {
  const p = shapePerson(x, s.people.reduce((a, y) => Math.max(a, y.id), 0) + 1, s.settings.lists);
  if (!p.last || !p.first) throw new Error('Γράψε επώνυμο και όνομα');
  const twin = (p.asm && s.people.find((y) => y.asm === p.asm)) || s.people.find((y) => personKey(y) === personKey(p));
  if (twin) throw new Error(twinText(twin, p.asm));
  return p;
}
