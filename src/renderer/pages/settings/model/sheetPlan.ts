// What the «ανανέωση από Excel» dialog of the sheet kinds shows and sends: one plan per kind.
// Purpose: `sheetPlan` turns the sheet and the app state into the command to apply, the number tiles, the lists and the
//   notes of posts, out of strength, abilities, cadres, cadre absences and the duty check.
// Does NOT: render anything, touch React or call `window.api` (useSheetImport.ts sends `cmd`).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6) so the plans are
//   testable without a render.
// Covering test: test/settings-sources-view.test.ts, test/sources.test.ts.
import type { Command } from '../../../../shared/commands';
import type { ISODate } from '../../../../shared/dates';
import { shortName, type AppState } from '../../../../shared/domain';
import type { RawSheet } from '../../../../shared/roster';
import { planCadreAbs, planCadres } from '../../../../shared/cadreSource';
import { seatMap } from '../../../../shared/rules';
import {
  KIND,
  capAcc,
  dutiesCmd,
  planCaps,
  planDuties,
  planOutside,
  planPosts,
  type DutiesPlan,
  type ListKind,
  type SheetPerson,
  type SourceBinding,
} from '../../../../shared/sources';
import { hkRowLabel } from '../../../../shared/unit';

/** The part of the sheet people every plan has and the dialog reads. */
export interface SheetPeople {
  unmatched: SheetPerson[];
  dup: number;
}

/** One plan: the command, the numbers and the text blocks of the dialog. */
export interface SheetRes {
  sp: SheetPeople;
  /** Changes the button will pass. */
  n: number;
  cmd: Command;
  tiles: [number, string][];
  lists: { title: string; items: string[] }[];
  notes: string[];
  /** Cadre absences removed from the Excel (only for `cadreAbs`). */
  removed?: string[];
  /** The duty-check plan (only for `duties`). */
  duties?: DutiesPlan;
  /** Cells the app has now seen (only for `duties`). */
  keys?: string[];
}

/** What the plans read besides the sheet. */
export interface PlanEnv {
  b: SourceBinding;
  state: AppState;
  /** Row number → person id (null: skip). */
  choices: Record<number, number | null>;
  /** `YYYY-MM` of the duty-check sheet. */
  month: string;
  today: ISODate;
  /** Name of the Excel file (stored in the history text). */
  bookName: string;
  /** Cells the app saw last time. */
  synced: string[];
  /** Keys and base values of the last read. */
  meta: { keys: string[]; base: Record<string, string> };
  /** Whether cadre absences removed from the Excel are removed from the app too. */
  del: boolean;
}

const EMPTY_SP: SheetPeople = { unmatched: [], dup: 0 };

/** Posts and out of strength: the people fields that change. */
function peoplePlan(list: 'posts' | 'outside', sheet: RawSheet, e: PlanEnv): SheetRes {
  const p = (list === 'posts' ? planPosts : planOutside)(sheet, e.b, e.state, e.choices);
  const cmd: Command = {
    t: 'setPeopleFields',
    changes: p.changes.map((c) => ({ pid: c.pid, patch: c.patch })),
    source: e.bookName,
    what: KIND[list].label.toLowerCase(),
  };
  return {
    sp: p.sp,
    n: p.changes.length,
    cmd,
    tiles: [
      [p.changes.length, 'Αλλάζουν'],
      [p.same, 'Ίδιοι'],
      [p.listed, 'Στο φύλλο'],
      [p.sp.unmatched.length, 'Χωρίς άτομο'],
    ],
    lists: [{ title: 'Τι αλλάζει', items: p.changes.map((c) => c.who + ': ' + c.what) }],
    notes: [],
  };
}

/** Abilities: «δεν κάνει …» / «κάνει …» per person. */
function capsPlan(sheet: RawSheet, e: PlanEnv): SheetRes {
  const p = planCaps(sheet, e.b, e.state, e.choices);
  const cmd: Command = {
    t: 'importCaps',
    changes: p.changes.map((c) => ({ pid: c.pid, kind: c.kind, reason: c.reason })),
    source: e.bookName,
  };
  const by = new Map<string, string[]>();
  for (const c of p.changes)
    by.set(c.who, [
      ...(by.get(c.who) || []),
      (c.reason ? 'δεν κάνει ' : 'κάνει ') +
        capAcc(c.kind, e.state.settings) +
        (c.reason && c.reason !== 'Από Excel' ? ' (' + c.reason.replace(/^Από Excel:\s*/, '') + ')' : ''),
    ]);
  return {
    sp: p.sp,
    n: p.changes.length,
    cmd,
    tiles: [
      [p.changes.length, 'Αλλαγές'],
      [p.listed, 'Στο φύλλο'],
      [p.same, 'Ίδιοι'],
      [p.sp.unmatched.length, 'Χωρίς άτομο'],
    ],
    lists: [{ title: 'Τι αλλάζει', items: [...by].map(([w, l]) => w + ': ' + l.join(', ')) }],
    notes: ['Όσοι δεν είναι στο φύλλο δεν αλλάζουν. Τα αυτόματα (πόστο, Σ.Ι. Ι4 ή άοπλος) ισχύουν πάντα.'],
  };
}

/** Cadre members: new ones, changed ones and the skipped rows. */
function cadresPlan(sheet: RawSheet, e: PlanEnv): SheetRes {
  const p = planCadres(sheet, e.b, e.state, e.meta);
  const cmd: Command = {
    t: 'importCadres',
    adds: p.adds.map((a) => a.cadre),
    updates: p.updates.map((u) => ({ id: u.id, patch: u.patch })),
    source: e.bookName,
  };
  const n = p.adds.length + p.updates.length;
  return {
    sp: EMPTY_SP,
    n,
    cmd,
    tiles: [
      [n, 'Αλλαγές'],
      [p.adds.length, 'Νέα στελέχη'],
      [p.same, 'Ίδια'],
      [p.listed, 'Στο φύλλο'],
    ],
    lists: [
      {
        title: 'Νέα στελέχη',
        items: p.adds.map((a) => a.who + ' · γραμμή ΗΚΑΙ: ' + hkRowLabel(a.cadre.hk, e.state.settings)),
      },
      {
        title: 'Αλλάζουν',
        items: p.updates.map(
          (u) => u.who + ': ' + u.what.join(', ') + (u.conflict ? ' (άλλαξε και στην εφαρμογή· περνά του Excel)' : ''),
        ),
      },
      {
        title: 'Παραλείπονται',
        items: [
          ...p.skipped.map((x) => 'Γραμμή ' + (x.r + 1) + ' ' + x.who + ': ' + x.why),
          ...p.amb.map((x) => 'Γραμμή ' + (x.r + 1) + ' ' + x.who + ': ίδιο ονοματεπώνυμο με άλλο στέλεχος, βάλε ΑΜ'),
        ],
      },
    ],
    notes: [
      ...p.warn,
      p.appOnly.length
        ? p.appOnly.length +
          (p.appOnly.length === 1 ? ' στέλεχος της εφαρμογής δεν είναι' : ' στελέχη της εφαρμογής δεν είναι') +
          ' στο Excel (' +
          p.appOnly.slice(0, 4).join(', ') +
          (p.appOnly.length > 4 ? '…' : '') +
          '). Δεν σβήνονται· γράφονται στο Excel. Για να φύγει κάποιος από τη δύναμη βάλε ΟΧΙ στη στήλη «Σε δύναμη».'
        : '',
    ].filter(Boolean),
  };
}

/** Cadre absences: new, changed and (when `del`) removed. */
function cadreAbsPlan(sheet: RawSheet, e: PlanEnv): SheetRes {
  const p = planCadreAbs(sheet, e.b, e.state, e.meta);
  const rm = e.del ? p.removed : [];
  const cmd: Command = {
    t: 'importCadreAbs',
    adds: p.adds.map((a) => a.abs),
    updates: p.updates.map((u) => ({ id: u.id, note: u.note })),
    deletes: rm.map((x) => x.id),
    source: e.bookName,
  };
  const n = p.adds.length + p.updates.length + rm.length;
  return {
    sp: EMPTY_SP,
    n,
    cmd,
    tiles: [
      [n, 'Αλλαγές'],
      [p.adds.length, 'Νέες καταστάσεις'],
      [p.same, 'Ίδιες'],
      [p.listed, 'Στο φύλλο'],
    ],
    lists: [
      {
        title: 'Νέες καταστάσεις',
        items: p.adds.map((a) => a.who + ': ' + a.text + (a.abs.note ? ' · ' + a.abs.note : '')),
      },
      { title: 'Αλλάζουν', items: p.updates.map((u) => u.who + ': ' + u.text) },
      { title: 'Παραλείπονται', items: p.skipped.map((x) => 'Γραμμή ' + (x.r + 1) + ' ' + x.who + ': ' + x.why) },
    ],
    removed: p.removed.map((x) => x.who + ': ' + x.text),
    notes: [
      p.appOnly
        ? p.appOnly +
          (p.appOnly === 1 ? ' κατάσταση της εφαρμογής δεν είναι' : ' καταστάσεις της εφαρμογής δεν είναι') +
          ' στο Excel· δεν σβήνονται, γράφονται στο Excel.'
        : '',
      'Κατάσταση που πέφτει πάνω σε άλλη του ίδιου στελέχους παίρνει τη θέση της (μία κατάσταση τη μέρα).',
    ].filter(Boolean),
  };
}

/** The duty check: days that pass, days written back to the Excel, and the notes about rows and bare letters. */
function dutiesPlan(sheet: RawSheet, e: PlanEnv): SheetRes {
  const p = planDuties(sheet, e.b, e.state, e.month, e.today, e.choices, e.synced);
  const cmd: Command = { t: 'importDuties', ...dutiesCmd(p), source: e.bookName };
  const pm = seatMap(e.state);
  const notes = [
    p.noRow.length
      ? 'Δεν έχουν γραμμή σε αυτό το φύλλο, οπότε οι υπηρεσίες τους δεν γράφονται εκεί: ' +
        p.noRow.map((id) => (pm.get(id) ? shortName(pm.get(id)!) : '?')).join(', ') +
        '.'
      : '',
    p.days.some((d) => d.adds.some((a) => !a.k))
      ? 'Το σκέτο γράμμα (Θ, Μ, Σ…), ή θέση που έχει ήδη άλλος στην εφαρμογή, περνά ως υπηρεσία χωρίς θέση: μετρά στα σύνολα, στην ανάπαυση και στις αργίες, όχι στον κανόνα του ίδιου νούμερου.'
      : '',
  ].filter(Boolean);
  const write = p.days.filter((d) => d.extra.length || d.differ.length || d.gone.length).length;
  return {
    sp: p.sp,
    n: p.changes,
    cmd,
    duties: p,
    keys: p.keys,
    tiles: [
      [p.changes, 'Υπηρεσίες που περνούν'],
      [write, 'Μέρες που γράφονται στο Excel'],
      [p.same, 'Ίδιες μέρες'],
      [p.sp.rows.length, 'Άτομα'],
      [p.sp.unmatched.length, 'Χωρίς άτομο'],
    ],
    lists: [],
    notes,
  };
}

/**
 * The plan of the sheet dialog for `list`.
 * @param list - the sheet kind (`posts`, `outside`, `caps`, `cadres`, `cadreAbs` or `duties`)
 * @param sheet - the sheet of the binding, or null when the file has no such sheet
 * @param e - the binding, the state, the sergeant's choices and the duty-check month
 * @returns null without a sheet; otherwise the command with the numbers and text of the dialog
 */
export function sheetPlan(list: ListKind, sheet: RawSheet | undefined, e: PlanEnv): SheetRes | null {
  if (!sheet) return null;
  if (list === 'posts' || list === 'outside') return peoplePlan(list, sheet, e);
  if (list === 'caps') return capsPlan(sheet, e);
  if (list === 'cadres') return cadresPlan(sheet, e);
  if (list === 'cadreAbs') return cadreAbsPlan(sheet, e);
  return dutiesPlan(sheet, e);
}
