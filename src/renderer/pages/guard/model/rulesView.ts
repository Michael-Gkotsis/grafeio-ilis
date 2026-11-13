// Pure rules of the «Κανόνες υπηρεσιών» dialog: the draft, its edits, the order of «Αυστηρά Άοπλοι», the numbers of
// «Τι άλλο κρίνει ποιος μπαίνει» and the steps of the fair order.
// Purpose: `RulesDraft`, `draftOf`, `withRule`, `toggleRot`, `moveKey`, `rulesInfo`, `fairSteps`, `rulesToSave`,
//   `weekToSave`, `opState` for `useRulesDialog` and its test.
// Does NOT: render anything, read the store or send a command (model/useRulesDialog.ts does).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/guard-page-view.test.ts.
import { addDays, type ISODate } from '../../../../shared/dates';
import {
  blocksOf,
  DEFAULT_NUM_ROTS,
  DEFAULT_STRICT_ORDER,
  shortName,
  type AppState,
  type Rules,
  type Settings,
} from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { activePeople, aheadDays, DEFAULT_HK_TIME, personMap } from '../../../../shared/rules';
import { strictOrderTxt } from '../../../../shared/rulesText';
import { armMargin } from '../../../../shared/armed';
import type { WeekDraft } from './weekRules';
import { WEEK_ORDER } from './weekRules';

/** Names of the built-in unarmed groups of «Αυστηρά Άοπλοι» (the name, and what it holds). */
export const KEY_NAME: Record<string, [string, string]> = {
  mg: ['Μαγειρεία', ''],
  mid: ['2ο-3ο νούμερο', 'θαλαμοφύλακας, άοπλος οπλοφύλακας'],
  edge: ['1ο-4ο νούμερο', 'θαλαμοφύλακας, άοπλος οπλοφύλακας'],
};

/** The most days a rule may be set to by hand. */
export const MAX_DAYS = 30;

/**
 * «οπλοφύλακας: ένοπλος» as it is now in the settings.
 * @returns `''` when the form has no οπλοφύλακες (they are not hidden)
 */
export function opState(state: Pick<AppState, 'settings'>): string {
  const b = blocksOf(state.settings).filter((x) => x.kind === 'op' && !x.hidden);
  return b.length ? 'οπλοφύλακας: ' + (b.every((x) => x.armed) ? 'ένοπλος' : 'άοπλος') + ' (Ρυθμίσεις)' : '';
}

/** The rules as the form edits them: the weapon margin is `before`/`after`; the old `outTime` stays until saved. */
export type RulesDraft = Rules & { before: number; after: number };

/** The first draft: the saved rules with the default ΗΚΑΙ time and the weapon margin filled in. */
export const draftOf = (rules: Rules): RulesDraft => ({
  ...rules,
  hkTime: rules.hkTime || DEFAULT_HK_TIME,
  ...armMargin(rules),
});

/** One rule changed; `undefined` removes the key (the default is not saved). */
export function withRule(r: RulesDraft, k: string, v: unknown): RulesDraft {
  const n: Record<string, unknown> = { ...r };
  if (v === undefined) delete n[k];
  else n[k] = v;
  return n as unknown as RulesDraft;
}

/**
 * Switch one number (0..3) of «Ξανά στο ίδιο νούμερο» on or off.
 * @returns the new list, sorted; `undefined` when it is the default (not saved); `null` when it would be empty (at
 *   least one number stays)
 */
export function toggleRot(rots: number[], n: number): number[] | undefined | null {
  const v = rots.includes(n) ? rots.filter((x) => x !== n) : [...rots, n].sort((a, b) => a - b);
  if (!v.length) return null;
  return v.join() === DEFAULT_NUM_ROTS.join() ? undefined : v;
}

/** The order to save: `undefined` when it is the default one. */
export const orderToSave = (v: string[]): string[] | undefined =>
  v.join() === DEFAULT_STRICT_ORDER.join() ? undefined : v;

/** `order` with the key at `i` moved by `d` places (-1 up, 1 down). */
export function moveKey(order: string[], i: number, d: number): string[] {
  const v = [...order];
  [v[i], v[i + d]] = [v[i + d], v[i]];
  return v;
}

/** What the rules dialog saves as rules: no `before`/`after`/`outTime`, the margin as `armBefore`/`armAfter`. */
export function rulesToSave(r: RulesDraft): Rules {
  const { before, after, outTime: _old, ...rest } = r;
  return { ...rest, hkTime: normTime(r.hkTime)!, armBefore: before, armAfter: after } as Rules;
}

/** The week table as `setWeekRules` takes it: all hours in the `HH:MM` form. */
export const weekToSave = (wk: WeekDraft) =>
  Object.fromEntries(
    WEEK_ORDER.map((w) => [
      w,
      {
        out: normTime(wk[w].out)!,
        backOut: normTime(wk[w].backOut)!,
        backDn: normTime(wk[w].backDn)!,
        train: wk[w].train,
      },
    ]),
  );

/** The counts of «Τι άλλο κρίνει ποιος μπαίνει». */
export interface RulesInfo {
  stat: number;
  si: number;
  caps: number;
  skips: number;
  off: number;
  post: number;
  fixed: string[];
  cadre: number;
}

const cellCount = (c?: Record<string, Record<string, unknown>>) =>
  Object.values(c || {}).reduce((n, row) => n + Object.keys(row).length, 0);

/** Cheap numbers about what else decides who is placed, read once when the dialog opens. */
export function rulesInfo(state: AppState, today: ISODate): RulesInfo {
  const act = activePeople(state);
  const end = addDays(today, 6);
  const pm = personMap(state.people);
  const fx = state.settings.fixed || {};
  const st = state.settings;
  return {
    stat: cellCount(st.lists?.stat?.cells),
    si: cellCount(st.lists?.si?.cells),
    caps: act.filter((p) => Object.values(state.caps[p.id] || {}).some((v) => typeof v === 'string')).length,
    skips: act.reduce((n, p) => n + (p.skips?.filter((k) => k.from <= end && k.to >= today).length || 0), 0),
    off: act.filter((p) => p.offDays?.length).length,
    post: act.filter((p) => p.post).length,
    fixed: (['ly', 'dy'] as const)
      .filter((k) => fx[k] && pm.get(fx[k]!))
      .map((k) => (k === 'ly' ? 'Λ/Υ ' : 'Δ/Υ ') + shortName(pm.get(fx[k]!)!)),
    cadre: (state.cadreList || []).filter((c) => c.active && c.monthMax).length,
  };
}

/** «αλλαγή / αλλαγές» of a count, or that it is the default. */
export const chg = (n: number) => (n ? n + (n === 1 ? ' αλλαγή' : ' αλλαγές') : 'όπως η προεπιλογή');

/** «άτομο / άτομα» of a count. */
export const ppl = (n: number) => n + (n === 1 ? ' άτομο' : ' άτομα');

/** One step of the fair order: the title, the on/off badge (`null`: none) and the explanation. */
export interface FairStep {
  title: string;
  on: boolean | null;
  text: string;
}

const firstSteps = (r: Rules, avgTxt: string): FairStep[] => {
  const n = aheadDays(r);
  return [
    {
      title: 'Κρατά όσους επιτρέπουν οι κανόνες',
      on: null,
      text: 'Καταστάσεις, Σ.Ι., Ποιος κάνει τι, Εξαιρέσεις, μέρες χωρίς υπηρεσία, ανάπαυση, ΣΚ μετά από ΣΚ. Κανείς δεν μπαίνει σιωπηλά παρά τον κανόνα: αν δεν βρεθεί κανείς, η θέση μένει κενή και το λέει.',
    },
    {
      title: 'Τελευταίοι: «μόνο αν δεν υπάρχει άλλος»',
      on: null,
      text: 'π.χ. ΕΑ/ΕΟ σε σκοπιά, ιατρικό «μόνο προειδοποίηση».',
    },
    {
      title: 'Κρατά τους ένοπλους για τις ένοπλες θέσεις',
      on: null,
      text: 'Σε άοπλη θέση μπαίνουν τελευταίοι όσοι χρειάζονται για να μη μείνει κενή ένοπλη θέση της μέρας.',
    },
    {
      title: 'Τελευταίοι όσοι χρωστάνε ΣΚ ή έχουν ήδη υπηρεσία μπροστά',
      on: null,
      text: n
        ? 'Τις ' +
          n +
          ' μέρες πριν από ΣΚ ή αργία κρατά στην άκρη όσους θα πάρουν το ΣΚ (οι λιγότερες αργίες)· και όποιον έβαλες ήδη με το χέρι τις επόμενες ' +
          n +
          ' μέρες. Μπαίνουν μόνο αν δεν φτάνουν οι άλλοι.'
        : 'Ισχύει μόνο με ανάπαυση: τώρα η ανάπαυση είναι «Χωρίς».',
    },
    {
      title: 'ΣΚ ή αργία: λιγότερες αργίες',
      on: null,
      text: 'Μετά όποιος έκανε αργία πιο παλιά. ΔΝ, έξοδος και θάλαμος δεν μετράνε.' + avgTxt,
    },
    {
      title: 'Καθημερινή: περισσότερες μέρες χωρίς υπηρεσία',
      on: null,
      text:
        'Οι μέρες διορθώνονται με το «πόσες αναλογούν»: όποιος έλειπε (άδεια, νοσοκομείο, ΕΥ) δεν μένει πίσω, και όποιος έκανε λιγότερες από όσες του αναλογούν προηγείται (ως 2 υπηρεσίες). Μετά λιγότερες υπηρεσίες συνολικά, μετά λιγότερες αργίες.' +
        avgTxt,
    },
  ];
};

/**
 * The steps the autofill and «Επόμενος» take, in order; read only. Each one is what the code does
 * (rules.ts: candidates, fairCompare, rotate, strictOrder, repair).
 */
export function fairSteps(r: Rules, st: Settings): FairStep[] {
  const strictOn = !!r.strictUnarmed;
  const rotOn = r.rotate !== false;
  const avgTxt = r.newAvg ? ' Οι νέοι στη δύναμη ξεκινούν από τον μέσο όρο.' : '';
  return [
    ...firstSteps(r, avgTxt),
    {
      title: 'Εναλλαγή υπηρεσιών',
      on: rotOn,
      text: rotOn
        ? 'Από όσους είναι η σειρά τους σήμερα, η θέση πάει σε όποιον χρωστά αυτή την υπηρεσία: την έχει κάνει λιγότερο από τις άλλες που μπορεί να κάνει. Όποιος χωρά μόνο σε αυτή τη θέση μπαίνει πρώτος. Μετράει και το Λ/Υ-Δ/Υ (όταν δεν έχει μόνιμο). Δεν αλλάζει τα βήματα 2-4.'
        : 'Κλειστό: μένει η σειρά των βημάτων 5-6.',
    },
    {
      title: 'Αυστηρά Άοπλοι',
      on: strictOn,
      text: strictOn
        ? 'Οι θέσεις της σειράς (' +
          strictOrderTxt(r, st) +
          ') γεμίζουν πρώτες και εκεί οι άοπλοι προηγούνται. Σκοπιά μόνο ένοπλοι. Κάθε ελεύθερος άοπλος προηγείται, ακόμα κι αν δεν είναι η σειρά του, οπότε οι άοπλοι κάνουν περισσότερες υπηρεσίες (πάντα με ανάπαυση). Για ίσες υπηρεσίες σε όλους, κλείσε τον διακόπτη. Άοπλος που χρειάζεται για ένοπλη θέση δεν παίρνει προτεραιότητα.'
        : 'Κλειστό: οι άοπλοι δεν προηγούνται, ισχύει η κανονική σειρά.',
    },
    {
      title: 'Διόρθωση στο τέλος',
      on: null,
      text: 'Αν έμεινε κενή θέση ενώ γινόταν να γεμίσει, μετακινεί ως 3 από όσους έβαλε η ίδια συμπλήρωση. Όσους έβαλες με το χέρι και τους μόνιμους Λ/Υ-Δ/Υ δεν τους αγγίζει· κανόνας δεν παραβαίνεται.',
    },
    {
      title: 'Ίσα νούμερα',
      on: rotOn,
      text: rotOn
        ? 'Όσους έβαλε η ίδια συμπλήρωση στα νούμερα του ίδιου εντύπου (2 ως 6 θέσεις) τους ανταλλάσσει ώστε να μην κάνει ο ίδιος τις ίδιες ώρες ξανά και ξανά (π.χ. πάντα τη νύχτα). Δεν αλλάζει ποιος έχει υπηρεσία σήμερα, ούτε τους κανόνες της θέσης.'
        : 'Κλειστό μαζί με την εναλλαγή.',
    },
    {
      title: 'Αργία χωρίς αρκετούς',
      on: !!r.noConsecHol,
      text: r.noConsecHol
        ? 'Αν σε αργία μείνει θέση κενή επειδή όλοι έκαναν πρόσφατα αργία, μπαίνουν όσοι την έκαναν πιο παλιά (μόνο αυτός ο κανόνας χαλαρώνει) και βγαίνει ειδοποίηση.'
        : 'Κλειστό: ισχύει μόνο όταν είναι ανοιχτό το «Όχι ΣΚ ή αργία δύο συνεχόμενες εβδομάδες».',
    },
    {
      title: 'Ισοπαλία: κλήρωση',
      on: null,
      text: 'Πρώτα λιγότερες φορές στο ίδιο είδος θέσης, μετά κλήρωση με σπόρο την ημερομηνία: την ίδια μέρα βγαίνει πάντα το ίδιο αποτέλεσμα.',
    },
  ];
}
