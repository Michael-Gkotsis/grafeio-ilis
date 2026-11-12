// The changes the buttons of the «Λίστες» card make, as pure functions from the current lists to the new ones.
// Purpose: `listsPlans`: each returns a `ListChange` (the new lists and the history text) or, for a box that can be
//   refused, an `{ ok: false, error }`; `useLists` only saves them.
// Does NOT: render anything, touch React or call `run` (model/useLists.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/lists.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-lists-view.test.ts.
import type { TypeKey } from '../../../../shared/domain';
import { normGreek, upper } from '../../../../shared/text';
import {
  LEAVE_NO_COL,
  itemKey,
  leaveNameKey,
  weaponBack,
  type LeaveText,
  type ListId,
  type ListItem,
  type ListRow,
  type UserLists,
} from '../../../../shared/ranks';
import { punAcc } from '../../../../shared/punish';
import { HK } from '../../../../shared/unit';
import { codeOk, keyOf, optLbl, type Pick } from './listsView';

/** What a button saves: the new lists and the history text (after «λίστα <όνομα>: »). */
export interface ListChange {
  next: UserLists;
  text: string;
}
/** A box that can be refused: the change to save, or the `error` to show. */
export type Checked = { ok: true; change: ListChange } | { ok: false; error: string };
type Editable = { add: ListItem[]; hide: string[] };

/** The lists with the list `id` changed by `fn` (on a copy of its `add` and `hide`). */
export function withList(lists: UserLists, id: ListId, fn: (u: Editable) => void): UserLists {
  const u = { add: [...(lists[id]?.add || [])], hide: [...(lists[id]?.hide || [])] };
  fn(u);
  return { ...lists, [id]: u };
}
// Replaces the own item `r` by `edit(item)`; the other items stay.
const editItem = (lists: UserLists, id: ListId, r: ListRow, edit: (x: ListItem) => ListItem): UserLists =>
  withList(lists, id, (u) => {
    u.add = u.add.map((x) => (itemKey(x.name) !== itemKey(r.name) ? x : edit(x)));
  });

/** «Απόκρυψη» / «Εμφάνιση». */
export const toggleChange = (lists: UserLists, id: ListId, r: ListRow): ListChange => ({
  next: withList(lists, id, (u) => {
    u.hide = r.hidden ? u.hide.filter((x) => itemKey(x) !== itemKey(r.name)) : [...u.hide, r.name];
  }),
  text: (r.hidden ? 'ξανά το ' : 'κρυφό το ') + r.name,
});
/** «✕»: an own item nobody has is deleted. */
export const removeChange = (lists: UserLists, id: ListId, r: ListRow): ListChange => ({
  next: withList(lists, id, (u) => {
    u.add = u.add.filter((x) => itemKey(x.name) !== itemKey(r.name));
    u.hide = u.hide.filter((x) => itemKey(x) !== itemKey(r.name));
  }),
  text: 'σβήστηκε το ' + r.name,
});
/** One field (`hk`, `col`, `code`, `back`) of an own item; an empty value removes the field. */
export const setRowChange = (
  lists: UserLists,
  id: ListId,
  r: ListRow,
  f: 'hk' | 'col' | 'code' | 'back',
  v: string,
  text: string,
): ListChange => ({
  next: editItem(lists, id, r, (x) => {
    const y = { ...x, [f]: v };
    if (!v) delete y[f];
    return y;
  }),
  text: r.name + ': ' + text,
});
/** The ΗΚΑΙ choice of an own item. The ticks «Μπαίνει σε υπηρεσίες» / «Βγαίνει έξοδο» hold only for «Πουθενά». */
export function pickChange(lists: UserLists, id: ListId, pick: Pick, r: ListRow, v: string): ListChange {
  if (id !== 'leaveKinds' || v === LEAVE_NO_COL || (!r.duty && !r.out))
    return setRowChange(lists, id, r, pick.f, v, 'στην ' + HK() + ': ' + optLbl(pick, v));
  return {
    next: editItem(lists, id, r, (x) => {
      const y: ListItem = { ...x, col: v };
      delete y.duty;
      delete y.out;
      return y;
    }),
    text: r.name + ': στην ' + HK() + ': ' + optLbl(pick, v),
  };
}
// Sets (or removes) one boolean field of an own item.
const setFlag = (
  lists: UserLists,
  id: ListId,
  r: ListRow,
  f: 'duty' | 'out' | 'warn' | 'noteBadge' | 'noteXl',
  on: boolean,
) =>
  editItem(lists, id, r, (x) => {
    const y: ListItem = { ...x, [f]: true };
    if (!on) delete y[f];
    return y;
  });
/** The ticks «Μπαίνει σε υπηρεσίες» / «Βγαίνει έξοδο» of an own leave kind. */
export const flagChange = (lists: UserLists, id: ListId, r: ListRow, f: 'duty' | 'out', on: boolean): ListChange => ({
  next: setFlag(lists, id, r, f, on),
  text:
    r.name +
    ': ' +
    (f === 'duty'
      ? on
        ? 'μπαίνει σε υπηρεσίες'
        : 'δεν μπαίνει σε υπηρεσίες'
      : on
        ? 'βγαίνει έξοδο'
        : 'δεν βγαίνει έξοδο'),
});
/** «Μόνο προειδοποίηση» of an own medical (Michael, 18/10): what it does in the duties stays. */
export const warnChange = (lists: UserLists, id: ListId, r: ListRow, on: boolean): ListChange => ({
  next: setFlag(lists, id, r, 'warn', on),
  text: r.name + ': ' + (on ? 'μόνο προειδοποίηση' : 'χωρίς προειδοποίηση'),
});
/** «Μόνο σημείωση» of an own medical (Michael, 4/11): a note never warns, so «μόνο προειδοποίηση» is removed. */
export const noteChange = (lists: UserLists, id: ListId, r: ListRow, on: boolean): ListChange => ({
  next: editItem(lists, id, r, (x) => {
    const y: ListItem = { ...x, note: true };
    if (on) delete y.warn;
    else {
      delete y.note;
      delete y.noteBadge;
      delete y.noteXl;
    }
    return y;
  }),
  text: r.name + ': ' + (on ? 'μόνο σημείωση' : 'όχι πια μόνο σημείωση'),
});
/** The ticks «σαν σήμα» / «στο Excel ΕΑ-ΕΥ» of a note-only medical. */
export const noteFlagChange = (
  lists: UserLists,
  id: ListId,
  r: ListRow,
  f: 'noteBadge' | 'noteXl',
  on: boolean,
): ListChange => ({
  next: setFlag(lists, id, r, f, on),
  text:
    r.name +
    ': ' +
    (f === 'noteBadge'
      ? on
        ? 'φαίνεται και σαν σήμα στις οθόνες'
        : 'δεν φαίνεται σαν σήμα'
      : on
        ? 'γράφεται και στο Excel ΕΑ-ΕΥ'
        : 'δεν γράφεται στο Excel ΕΑ-ΕΥ'),
});
/**
 * «Κείμενο στην ΗΚΑΙ» of a leave kind: key, patch. An empty text and no direction removes the entry (all as before).
 */
export function leaveTextChange(lists: UserLists, lk: string, patch: Partial<LeaveText>, text: string): ListChange {
  const cur = { ...(lists.leaveText?.[lk] || {}), ...patch } as LeaveText;
  if (!cur.t) delete cur.t;
  if (!cur.dest) delete cur.dest;
  const all = { ...(lists.leaveText || {}) };
  if (Object.keys(cur).length) all[lk] = cur;
  else delete all[lk];
  const next: UserLists = { ...lists };
  if (Object.keys(all).length) next.leaveText = all;
  else delete next.leaveText;
  return { next, text };
}
/** The code box of an own item. `null`: nothing changed. */
export function codeChange(lists: UserLists, id: ListId, r: ListRow, v: string): Checked | null {
  const c = v.trim().toUpperCase();
  if (c === (r.code || '')) return null;
  if (!codeOk(c)) return { ok: false, error: 'Ο κωδικός του «' + r.name + '» θέλει τελεία ή κάθετο, π.χ. Ε.Γ.' };
  return { ok: true, change: setRowChange(lists, id, r, 'code', c, c ? 'κωδικός ' + c : 'κωδικός του βασικού') };
}
/** The «Λόγος εισαγωγής» box of an own weapon exit reason. `null`: nothing changed. */
export function backChange(lists: UserLists, id: ListId, r: ListRow, v: string): ListChange | null {
  const b = v.trim().replace(/\s+/g, ' ').toUpperCase();
  if (b === (r.back || '')) return null;
  return setRowChange(lists, id, r, 'back', b, 'εισαγωγή ' + (b || weaponBack(r.name)));
}

/** The boxes of the «Νέο» form. */
export interface AddForm {
  name: string;
  choice: string | null;
  acc: string;
  max: string;
  code: string;
  warn: boolean;
  note: boolean;
  nBadge: boolean;
  nXl: boolean;
  back: string;
  ltext: string;
  lduty: boolean;
  lout: boolean;
}
/** What the «Πρόσθεσε» button reads. */
export interface AddInput {
  id: ListId;
  lists: UserLists;
  rows: ListRow[];
  pick?: Pick;
  /** The shown choice (the typed one, else the current/first option); '' when the list has none. */
  curChoice: string;
  /** The typed name as the list keeps it. */
  n: string;
  form: AddForm;
}

// The new item, with the fields this list uses. A new medical starts as ΕΑΡΒ (no limits); the Υπηρεσίες και αργίες
// card says what it does.
function newItem({ id, pick, curChoice, n, form }: AddInput, m: number): ListItem {
  const { acc, code, warn, note, nBadge, nXl, back, lduty, lout } = form;
  const cd = code.trim().toUpperCase();
  const medLike =
    id === 'medKinds'
      ? {
          like: 'EARV' as TypeKey,
          ...(warn && !note ? { warn: true } : {}),
          ...(note ? { note: true, ...(nBadge ? { noteBadge: true } : {}), ...(nXl ? { noteXl: true } : {}) } : {}),
        }
      : {};
  const item0: ListItem = {
    name: n,
    ...(pick && curChoice ? { [pick.f]: curChoice } : {}),
    ...medLike,
    ...(id === 'punKinds' && acc.trim() ? { acc: acc.trim() } : {}),
    ...(id === 'punKinds' && m > 0 ? { max: m } : {}),
    ...((id === 'medKinds' || id === 'leaveKinds') && cd ? { code: cd } : {}),
    ...(id === 'leaveKinds' && curChoice === LEAVE_NO_COL
      ? { ...(lduty ? { duty: true } : {}), ...(lout ? { out: true } : {}) }
      : {}),
    ...(id === 'weaponOut' && back.trim() ? { back: back.trim().replace(/\s+/g, ' ').toUpperCase() } : {}),
  };
  // Without empty fields.
  return Object.fromEntries(Object.entries(item0).filter(([, v]) => v !== undefined)) as unknown as ListItem;
}

// Why the typed name or code cannot be added, or `null`.
function addProblem({ id, rows, n, form }: AddInput, cd: string): string | null {
  const key = keyOf(id);
  if (/[,"]/.test(n)) return 'Χωρίς κόμμα ή εισαγωγικά: το Excel τα χρησιμοποιεί για να χωρίζει τις τιμές της λίστας.';
  if (id === 'siUnarmed' && normGreek(n).replace(/[^Α-ΩA-Z0-9]/g, '').length < 2)
    return 'Γράψε ολόκληρο το Σ.Ι. (π.χ. Ι5): ένα γράμμα μόνο θα έκανε άοπλους σχεδόν όλους.';
  if ((id === 'medKinds' || id === 'leaveKinds') && !codeOk(cd))
    return 'Ο κωδικός θέλει τελεία ή κάθετο, π.χ. Ε.Γ, για να μη μοιάζει με κωδικό υπηρεσίας (ως 8 χαρακτήρες).';
  const same = rows.find((r) => key(r.name) === key(n));
  if (same && !same.hidden) return 'Το «' + same.name + '» υπάρχει ήδη στη λίστα.';
  const m = Math.floor(+form.max);
  if (form.max.trim() && !(m > 0)) return 'Οι ανώτατες ημέρες θέλουν αριθμό πάνω από 0 (ή άφησέ το κενό).';
  return null;
}

// The history text after the name: what was chosen, per list.
function addWhat(input: AddInput, next: UserLists, m: number): string {
  const { id, pick, curChoice, n, form } = input;
  const { warn, note, ltext } = form;
  const cd = form.code.trim().toUpperCase();
  const lt = ltext.trim().replace(/\s+/g, ' ');
  if (id === 'leaveKinds' && lt)
    return (
      ' (' + HK() + ': ' + (pick && curChoice ? optLbl(pick, curChoice) + ', ' : '') + 'κείμενο «' + upper(lt) + '»)'
    );
  if (id === 'weaponOut') return ' (εισαγωγή: ' + weaponBack(n, next) + ')';
  if (id === 'medKinds')
    return [warn && !note && 'μόνο προειδοποίηση', note && 'μόνο σημείωση', cd && 'κωδικός ' + cd]
      .filter(Boolean)
      .join(', ')
      .replace(/^(.+)$/, ' ($1)');
  if (pick && curChoice) return ' (' + HK() + ': ' + optLbl(pick, curChoice) + ')';
  if (id === 'punKinds') return ' (κείμενο «' + punAcc(n, next) + '»' + (m > 0 ? ', ως ' + m + ' ημ.' : '') + ')';
  return '';
}

/**
 * «Πρόσθεσε»: the new (or shown again) item.
 * @returns `null` when the name is empty; `{ ok: false, error }` when it is refused; else the change to save
 */
export function planAdd(input: AddInput): Checked | null {
  const { id, lists, rows, n, form } = input;
  if (!n) return null;
  const cd = form.code.trim().toUpperCase();
  const error = addProblem(input, cd);
  if (error) return { ok: false, error };
  const key = keyOf(id);
  const k = itemKey(n);
  const same = rows.find((r) => key(r.name) === key(n));
  const m = Math.floor(+form.max);
  const item = newItem(input, m);
  // A hidden item shows again (an own one with what was chosen now).
  const withItem = withList(lists, id, (u) => {
    u.hide = u.hide.filter((x) => itemKey(x) !== k);
    // A medical that existed keeps its base type, so what was set in Υπηρεσίες και αργίες still holds.
    const was = u.add.find((x) => itemKey(x.name) === k);
    if (id === 'medKinds' && was?.like) item.like = was.like;
    if (!same?.builtin) {
      u.add = u.add.filter((x) => itemKey(x.name) !== k);
      u.add.push(item);
    }
  });
  // A new leave kind with «Κείμενο στην ΗΚΑΙ».
  const lt = form.ltext.trim().replace(/\s+/g, ' ');
  const lk = leaveNameKey(n);
  const next: UserLists =
    id === 'leaveKinds' && lt
      ? {
          ...withItem,
          leaveText: { ...(withItem.leaveText || {}), [lk]: { ...(withItem.leaveText?.[lk] || {}), t: lt } },
        }
      : withItem;
  return { ok: true, change: { next, text: '+ ' + n + addWhat(input, next, m) } };
}
