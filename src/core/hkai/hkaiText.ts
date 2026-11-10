// ΗΚΑΙ, back page: the «Αποφάσεις Διοικητή» (1. ΕΓΓΡΑΦΕΣ, 2. ΔΙΑΓΡΑΦΕΣ, 3. ΑΔΕΙΕΣ, 4. ΠΟΙΝΕΣ, 5. ΑΙΤΗΣΕΙΣ) as numbered
// sentences, one per line, «1. …» (Michael, 17/10).
//
// Purpose: the lines of each part (`hkaiEgrLines`, `hkaiDiaLines`, `hkaiLeaveLines`, `hkaiCadreLeaveLines`,
//   `hkaiSoldierLeaveLines`, `hkaiPunLines`, `hkaiReqLines`), the pieces they are made of (`Run`, `Line`, `leaveHk`,
//   `leaveDest`, `hkRange`, `personLine`), the measure of the paper (`paperLines`, `HK_LINE_CHARS`) and the duty
//   organs (`hkOrgans`).
// Does NOT: write the Excel or Word file (src/main/exports.ts does), save the free text of the ΗΚΑΙ screen, or
//   decide how a sentence is split into pages.
// Owner layer: core/hkai (no fs, no Electron, no React); imports core/cadre, core/statuses (punish), core/people and
//   core/duty.
// Why: the preview on the screen and the Excel (main/exports.ts) must show the same lines, so they come from one pure
//   function per part.
// Covering tests: test/hkai.test.ts, test/hkai-auto.test.ts, test/leave-text.test.ts, test/hd.test.ts.
import { hkDay, type ISODate } from '../lib/dates';
import { OUT_NOTE, type Person } from '../model/person';
import { hkLvOn, type AppState } from '../model/state';
import type { PersonRequest } from '../model/records';
import type { Status } from '../model/status';
import { dutyBlock } from '../duty/leaveHours';
import { personMap } from '../duty/indexes';
import { postBy } from '../duty/posts';
import { hkWho, punGroupKey, punText } from '../statuses/punish';
import { collator, upper } from '../lib/text';
import { genitive } from '../lib/greek';
import { HK } from '../model/unit';
import { live, cadreAbsOf, cadreLeaveKey, leaveName, leavePhrase, leaveTextOf } from '../people/kinds';
import { rankTxt } from '../people/ranks';
import type { UserLists } from '../model/lists';
import { cadreStatusOf, orderedCadre } from '../cadre/cadre';

/** A piece of text; `u` = underlined (the duration of a penalty). */
export interface Run {
  t: string;
  u?: boolean;
}
/** One line of the ΗΚΑΙ: a list of runs. */
export type Line = Run[];

/** Order by last name, then first name. */
export const byName = (a: Person, b: Person) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);
// «1. », «2. » in front of every sentence
const numbered = (ls: Line[]): Line[] => ls.map((l, i) => [{ ...l[0], t: i + 1 + '. ' + l[0].t }, ...l.slice(1)]);

/**
 * 4. ΠΟΙΝΕΣ: the penalties imposed on this day (the date of the penalty, otherwise the start). They are valid at once,
 * without approval. The same penalty for many people is one sentence with all of them:
 * «1. Ο ΣΤΡ (ΠΖ) … ΤΙΜΩΡΗΘΗΚΕ ΤΗΝ 12 ΟΚΤ 26 ΑΠΟ ΤΟΝ … ΜΕ <u>ΔΥΟ (02) ΗΜΕΡΕΣ ΚΡΑΤΗΣΗ</u>, ΔΙΟΤΙ ….»
 */
export function hkaiPunLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  const groups = new Map<string, { st: Status; ps: Person[] }>();
  for (const x of s.statuses) {
    if (x.type !== 'PUN' || (x.on || x.from) !== d || !pm.has(x.pid)) continue;
    const k = punGroupKey(x, s.settings.lists);
    const g = groups.get(k);
    if (g) g.ps.push(pm.get(x.pid)!);
    else groups.set(k, { st: x, ps: [pm.get(x.pid)!] });
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, ps: g.ps.sort(byName) }))
    .sort((a, b) => byName(a.ps[0], b.ps[0]));
  return numbered(
    list.map(({ st, ps }) => {
      const t = punText(ps, st, s.settings.lists);
      return [{ t: t.before }, { t: t.dur, u: true }, { t: t.after }];
    }),
  );
}

/**
 * What a request asks for: «ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26 <reason>» or the text of the request. With `lists`:
 * the «Κείμενο στην ΗΚΑΙ» of the kind and the destination (`leaveHk`, `leaveDest`).
 */
export const reqWhat = (x: PersonRequest, lists?: UserLists) =>
  x.leave
    ? leaveHk(x.leave, lists) + ' ' + hkRange(x.leave) + leaveDest(x.leave, lists) + (x.text ? ' ' + x.text : '')
    : x.text;
/**
 * 5. ΑΙΤΗΣΕΙΣ: «1. ΣΤΡ (ΔΒ-ΗΠ) ΔΕΜΕΛΗΣ ΑΝΑΣΤΑΣΙΟΣ: ΑΙΤΕΙΤΑΙ …», and at the end whatever was written freely on the
 * ΗΚΑΙ screen.
 */
export function hkaiReqLines(s: AppState, d: ISODate): Line[] {
  const pm = personMap(s.people);
  const out: Line[] = numbered(
    s.requests
      .filter((x) => x.date === d && pm.has(x.pid))
      .map((x) => ({ x, p: pm.get(x.pid)! }))
      .sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
      .map(({ x, p }) => [{ t: upper(hkWho(p) + ': αιτείται ' + reqWhat(x, s.settings.lists) + '.') }]),
  );
  const free = s.hkaiManual?.[d]?.text?.ait?.trim();
  if (free) out.push([{ t: free }]);
  return out;
}

export { leavePhrase, leaveName };
/**
 * How the kind is written on the ΗΚΑΙ (3. ΑΔΕΙΕΣ, 5. ΑΙΤΗΣΕΙΣ): the «Κείμενο στην ΗΚΑΙ» set in the Λίστες, otherwise
 * the name of the kind. The Εξοδούχοι, the Έντυπα and the Φρουρά always say the kind (`leavePhrase`).
 */
export const leaveHk = (st: Pick<Status, 'type' | 'kind'>, lists?: UserLists): string =>
  upper(leaveTextOf(st, lists)?.t?.trim() || leavePhrase(st));
/**
 * « ΜΕ ΚΑΤΕΥΘΥΝΣΗ ΚΟΡΙΝΘΟ»: only when the kind has the setting and the leave has a destination (otherwise empty).
 */
export const leaveDest = (st: Pick<Status, 'type' | 'kind' | 'dest'>, lists?: UserLists): string => {
  const d = st.dest?.trim();
  return d && leaveTextOf(st, lists)?.dest ? upper(' ΜΕ ΚΑΤΕΥΘΥΝΣΗ ' + d) : '';
};
/**
 * The help under the field «Κατεύθυνση» (Δήλωση, Αίτηση, Ώρες και κατεύθυνση): written or not on the ΗΚΑΙ, depending
 * on the kind.
 */
export function destNote(st: Pick<Status, 'type' | 'kind'>, dest: string, lists?: UserLists): string {
  if (!dest.trim()) return 'Προαιρετικό · κενό = δεν γράφεται πουθενά.';
  if (leaveTextOf(st, lists)?.dest) return 'Γράφεται στην ' + HK() + '.';
  return (
    'Φαίνεται στις Άδειες και στο Excel. Δεν γράφεται στην ' +
    HK() +
    ' για «' +
    (st.type === 'HON' ? 'Τιμητική' : st.type === 'SICK' ? 'Αναρρωτική' : st.kind?.trim() || 'Κανονική') +
    '»: άνοιξέ το στις Λίστες › Είδη άδειας.'
  );
}
/** Cadre member: the «Κείμενο στην ΗΚΑΙ» of the status (Σ:code), otherwise «Κανονική άδεια»… */
export const cadreLeaveHk = (kind: string, label: string, lists?: UserLists): string => {
  const code = cadreAbsOf(kind, lists)?.[0];
  const t = code ? lists?.leaveText?.[cadreLeaveKey(code)]?.t?.trim() : '';
  return t ? upper(t) : leaveName({ type: 'LEAVE', kind: label });
};
/** «ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26» or «ΑΠΟ ΠΑΡ 16 ΟΚΤ 26 ΕΩΣ ΚΥΡ 18 ΟΚΤ 26», with the hours when they were written. */
export function hkRange(x: Pick<Status, 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>): string {
  const a = hkDay(x.from) + (x.fromTime ? ' ' + x.fromTime : ''),
    back = x.toTime && !x.open ? ' ' + x.toTime : '';
  if (x.open) return 'ΑΠΟ ' + a + ' (ΧΩΡΙΣ ΛΗΞΗ)';
  if (x.from === x.to && !x.fromTime && !back) return 'ΓΙΑ ΤΗΝ ' + a;
  // one day with only one hour: «ΓΙΑ ΤΗΝ ΠΑΡ 16 ΟΚΤ 26 ΑΠΟ 14:00» / «… ΕΩΣ 22:00»
  if (x.from === x.to && !(x.fromTime && back))
    return 'ΓΙΑ ΤΗΝ ' + hkDay(x.from) + (x.fromTime ? ' ΑΠΟ ' + x.fromTime : ' ΕΩΣ' + back);
  return 'ΑΠΟ ' + a + ' ΕΩΣ ' + (x.from === x.to ? back.trim() : hkDay(x.to) + back);
}
// 3. ΑΔΕΙΕΣ: leaves and sick leaves that start on the day. Those that were asked for with a request are not written
// again: on the back page only the request stays, once, and it is simply approved (Michael, 18/10).
// «1. ΣΤΡ (ΔΒ-ΗΠ) ΔΕΜΕΛΗΣ ΑΝΑΣΤΑΣΙΟΣ: ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ ΑΠΟ … ΕΩΣ ….» They are written only if «Άδειες στο 3. Άδειες» is
// open for the day (hkLvOn: the day's, otherwise the default; Michael 24/10). First the cadre in force (order of
// hierarchy) with a leave in the columns Κ.Άδ., Ειδ. or Αναρρωτική of the ΗΚΑΙ, then the soldiers in force, with one
// numbering; at the end the free text of the screen, without a number.
const CADRE_LEAVE_COLS = ['ka', 'eid', 'an'];
// the lines without numbering, apart for cadre and soldiers (the Ημερήσια Διαταγή wants them in two tables)
function leaveParts(s: AppState, d: ISODate, force = false): { cadre: Line[]; soldiers: Line[] } {
  if (!force && !hkLvOn(s, d)) return { cadre: [], soldiers: [] };
  const pm = personMap(s.people);
  const leave = (x: Status) => x.type === 'LEAVE' || x.type === 'HON' || x.type === 'SICK';
  const cadre = orderedCadre(s.cadreList || [])
    .filter((c) => c.active)
    .flatMap((c) =>
      (s.cadreAbs || [])
        .filter((a) => a.cid === c.id && a.from === d)
        .map((a) => ({ c, st: cadreStatusOf(a, s.settings.lists) }))
        .filter((x) => CADRE_LEAVE_COLS.includes(x.st.col))
        .sort((a, b) => a.st.abs.id.localeCompare(b.st.abs.id)),
    );
  return {
    cadre: cadre.map(
      ({ c, st }): Line => [
        {
          t: upper(
            [rankTxt(c), c.spec ? '(' + c.spec + ')' : '', c.last, c.first].filter(Boolean).join(' ') +
              ': ' +
              cadreLeaveHk(st.abs.kind, st.label, s.settings.lists) +
              ' ' +
              hkRange(st.abs) +
              '.',
          ),
        },
      ],
    ),
    soldiers: s.statuses
      .filter((x) => leave(x) && pm.get(x.pid)?.active && !x.req && x.from === d)
      .map((x) => ({ x, p: pm.get(x.pid)! }))
      .sort((a, b) => byName(a.p, b.p) || a.x.id.localeCompare(b.x.id))
      .map(
        ({ x, p }): Line => [
          {
            t: upper(
              hkWho(p) + ': ' + leaveHk(x, s.settings.lists) + ' ' + hkRange(x) + leaveDest(x, s.settings.lists) + '.',
            ),
          },
        ],
      ),
  };
}
/** 3. ΑΔΕΙΕΣ of the ΗΚΑΙ: cadre first, then soldiers, one numbering, then the free text; empty when closed. */
export function hkaiLeaveLines(s: AppState, d: ISODate): Line[] {
  if (!hkLvOn(s, d)) return [];
  const { cadre, soldiers } = leaveParts(s, d);
  const out = numbered([...cadre, ...soldiers]);
  const free = s.hkaiManual?.[d]?.text?.lv?.trim();
  if (free) out.push([{ t: free }]);
  return out;
}
/**
 * Ημερήσια Διαταγή: the leaves of the cadre, and of the soldiers (with the free text of the ΗΚΑΙ), each with its own
 * numbering. They are always written, whatever the choice «Άδειες στο 3. Άδειες» of the ΗΚΑΙ is: the ΗΔ announces the
 * leaves of the day.
 */
export const hkaiCadreLeaveLines = (s: AppState, d: ISODate): Line[] => numbered(leaveParts(s, d, true).cadre);
/** The leaves of the soldiers for the Ημερήσια Διαταγή, numbered, with the free text of the ΗΚΑΙ at the end. */
export function hkaiSoldierLeaveLines(s: AppState, d: ISODate): Line[] {
  const out = numbered(leaveParts(s, d, true).soldiers);
  const free = s.hkaiManual?.[d]?.text?.lv?.trim();
  if (free) out.push([{ t: free }]);
  return out;
}

/**
 * 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ: the person as written in the line, with the data of the Δυναμολόγιο:
 * «ΣΤΡ (ΠΖ) ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΤΟΥ ΠΑΤΡΩΝΥΜΟΥ, ΑΣΜ …, ΕΣΣΟ …».
 */
export function personLine(p: Person): string {
  return upper(
    [rankTxt(p), p.spec ? '(' + p.spec + ')' : '', p.last, p.first, p.father ? 'του ' + genitive(p.father) : '']
      .filter(Boolean)
      .join(' ') +
      (p.asm ? ', ΑΣΜ ' + p.asm : '') +
      (p.essos ? ', ΕΣΣΟ ' + p.essos : ''),
  );
}
/** The reason of a deletion: from the sheet «ΕΚΤΟΣ ΔΥΝΑΜΗΣ» («Εκτός δύναμης: μετάθεση») or the notes of the person. */
export const outReason = (p: Person) =>
  (p.notes.startsWith(OUT_NOTE) ? p.notes.slice(OUT_NOTE.length).replace(/^[:\s]+/, '') : p.notes).trim();
/** The people who entered (`inOn`) or left (`outOn`) the force on day `d`, by name. */
export const movesOn = (s: AppState, field: 'inOn' | 'outOn', d: ISODate) =>
  s.people.filter((p) => p[field] === d).sort(byName);
// the people who moved, and then whatever was written freely on the ΗΚΑΙ screen: «1. ΣΤΡ (ΠΖ) …: <reason>.»
function moveLines(s: AppState, d: ISODate, field: 'inOn' | 'outOn', free: 'egr' | 'dia'): Line[] {
  const out = numbered(
    movesOn(s, field, d).map((p) => {
      const why = field === 'outOn' ? outReason(p) : '';
      return [{ t: personLine(p) + (why ? ': ' + upper(why.replace(/[.\s]+$/, '')) : '') + '.' }];
    }),
  );
  const t = s.hkaiManual?.[d]?.text?.[free]?.trim();
  if (t) out.push([{ t }]);
  return out;
}
/** 1. ΕΓΓΡΑΦΕΣ: the people who entered the force on the day, then the free text. */
export const hkaiEgrLines = (s: AppState, d: ISODate) => moveLines(s, d, 'inOn', 'egr');
/** 2. ΔΙΑΓΡΑΦΕΣ: the people who left the force on the day, with the reason, then the free text. */
export const hkaiDiaLines = (s: AppState, d: ISODate) => moveLines(s, d, 'outOn', 'dia');

/** The text of a line, without the underlining. */
export const lineText = (l: Line) => l.map((r) => r.t).join('');
/** The text of many lines, one per row. */
export const linesText = (ls: Line[]) => ls.map(lineText).join('\n');
/** Characters per line in the cell of the template (G11:K11): about 130. */
export const HK_LINE_CHARS = 130;
/** The lines that the cell takes on paper (each line takes at least one). */
export const paperLines = (ls: Line[], chars = HK_LINE_CHARS) =>
  ls.reduce((a, l) => a + Math.max(1, Math.ceil(lineText(l).length / chars)), 0);

/**
 * Όργανα υπηρεσίας › Λ/Υ and Δ/Υ: whoever is in the post on the day (by hand or from the auto-fill). If the post is
 * empty, the permanent Λ/Υ or Δ/Υ, when in force and not held by a status.
 * @decision Michael 17/10: the permanent Λ/Υ or Δ/Υ fills an empty post.
 */
export function hkOrgans(s: AppState, d: ISODate): { ly?: number; dy?: number } {
  const g = s.guards[d] || {};
  const pm = personMap(s.people);
  const out: { ly?: number; dy?: number } = {};
  for (const k of ['ly', 'dy'] as const) {
    const f = s.settings.fixed?.[k];
    const post = postBy(s, k);
    const id = g[k] ?? (f && pm.get(f)?.active && !dutyBlock(live(s), d, f, post, s.settings.lists) ? f : undefined);
    if (id != null) out[k] = id;
  }
  return out;
}
