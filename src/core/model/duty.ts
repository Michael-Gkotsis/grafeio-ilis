// Duty kinds and the shape of a duty form: posts, blocks and phases (the types and the label tables).
//
// Purpose: `DutyKind` with its labels and codes, the capability kinds, `PostDef`, `BlockDef`, `PhaseDef`, `Post`.
// Does NOT: build posts from blocks (blocks.ts), hold the default forms (defaultBlocks.ts) or read Settings.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: posts and blocks are the layout of «ΦΡΟΥΡΑ»; their codes (Θ1α, Μ2, ΛΥ…) are exact and frozen.
// Covering tests: test/own-phases.test.ts, test/codes.test.ts.
import type { ShiftDef } from './shifts';

/** Kind of a duty: Λ/Υ-Δ/Υ, room guard, weapon guard, sentry, kitchen, ΤΑΕ, other. */
export type DutyKind = 'ly' | 'th' | 'op' | 'sk' | 'mg' | 'tae' | 'other';
export const KIND_LBL: Record<DutyKind, string> = {
  ly: 'Λ/Υ',
  th: 'Θαλ.',
  op: 'Οπλ.',
  sk: 'Σκοπ.',
  mg: 'Μαγ.',
  tae: 'ΤΑΕ',
  other: 'Άλλη',
};
export const KIND_NAME: Record<DutyKind, string> = {
  ly: 'Λ/Υ - Δ/Υ',
  th: 'Θαλαμοφύλακας',
  op: 'Οπλοφύλακας',
  sk: 'Σκοπιά',
  mg: 'Μαγειρεία',
  tae: 'ΤΑΕ',
  other: 'Άλλη υπηρεσία (π.χ. πύλη)',
};
// Code in the duty check (sample 03) and in the prevented calendar (sample 14)
export const KIND_CODE: Record<DutyKind, string> = {
  ly: 'ΛΥ',
  th: 'Θ',
  op: 'ΟΠ',
  sk: 'Σ',
  mg: 'Μ',
  tae: 'Τ',
  other: 'Υ',
};
// Kinds set per person in «Δυνατότητα υπηρεσιών» (sample 02)
export const CAP_KINDS: [DutyKind, string][] = [
  ['th', 'Θαλαμοφύλακας'],
  ['op', 'Οπλοφύλακας'],
  ['mg', 'Μαγειρεία'],
  ['sk', 'Σκοπιά'],
  ['tae', 'ΤΑΕ'],
  ['other', 'Άλλες (πύλη κ.λπ.)'],
];
export const CAP_ACC: Partial<Record<DutyKind, string>> = {
  th: 'θαλαμοφύλακα',
  op: 'οπλοφύλακα',
  mg: 'μαγειρεία',
  sk: 'σκοπιά',
  tae: 'ΤΑΕ',
  other: 'άλλη υπηρεσία',
};
/**
 * A post of a duty. code: the post code in the duty check (Θ1α, Μ2, ΛΥ…), changed in Settings.
 * grp (Michael, 4/11): number (from 0) in duties without rot that have 2+ people in the same number; posts with the
 * same
 * grp = one number, with the same hours.
 */
export interface PostDef {
  k: string;
  label: string;
  short: string;
  rot?: number | null;
  grp?: number;
  hrs?: string;
  hidden?: boolean;
  code?: string;
}
/**
 * A block of posts (one duty). armWeapon (Michael, 24/10): in armed duties, «own» (default, no field) = each person
 * draws
 * his own weapon in his number; «post» = one weapon of the post, handed from hand to hand at the changes (armed.ts).
 */
export interface BlockDef {
  id: string;
  kind: DutyKind;
  name: string;
  armed: boolean;
  posts: PostDef[];
  custom?: boolean;
  hidden?: boolean;
  shift?: ShiftDef | null;
  armWeapon?: 'own' | 'post';
}
// Duty form: ΣΒΕΝ, ΣΠΕΝ or the user's own (Michael, 22/10: «dropdown και λίστα»). His own has duties of its own and is
// written to Excel with the ΣΒΕΝ or ΣΠΕΝ form (base), under its own name.
export type BasePhase = 'sven' | 'spen';
export type Phase = string;
export const PHASE_NAME: Record<BasePhase, string> = { sven: 'ΣΒΕΝ', spen: 'ΣΠΕΝ' };
export interface PhaseDef {
  id: string;
  name: string;
  base: BasePhase;
  blocks: BlockDef[];
}
/** A post resolved for a day: its block, kind, armed flag and the hours (slots) it works. */
export interface Post extends PostDef {
  block: string;
  kind: DutyKind;
  armed: boolean;
  slots: string[] | null;
  hours: string;
  cyc?: number;
}
