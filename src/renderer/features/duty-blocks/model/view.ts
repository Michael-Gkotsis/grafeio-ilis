// Pure rules of the service-block dialogs («Νέα υπηρεσία», «Επεξεργασία», «Νέο έντυπο υπηρεσιών»).
// Purpose: the starting form, number labels, validation message, shape preview facts, the saved command and the phase
//   naming, as plain functions that a test can call without React.
// Does NOT: read the store, render, or run commands (the hook `useBlockForm` and the dialogs do).
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from renderer/blockForm.ts and screens/guard.ts
//   (Phase 6, Ρυθμίσεις S3); the logic is the same, only split out of the markup.
// Covering test: test/duty-blocks-view.test.ts, test/ux-names.test.ts, test/screens-dialogs-forms.test.ts.
import { normTime } from '../../../../shared/hours';
import {
  MAX_NUMS,
  blockGroups,
  blockShape,
  type BasePhase,
  type BlockDef,
  type Phase,
  type Settings,
  type ShiftDef,
} from '../../../../shared/domain';
import type { Command } from '../../../../shared/commands';
import { shiftForm, shiftOf, shiftWhy, type HoursMode, type ShiftForm } from '../../../common';

/** Greek letters that name the people of one number («Θ1α», «Θ1β»…): `GR.slice(0, per)`. */
export const GR = [...'αβγδεζηθικ'];

/**
 * Boxes of the ΦΡΟΥΡΑ template per kind of service; beyond them the table grows downward (exports.ts `extendFroura`).
 * The key is `BlockDef.kind`. Used only for the hint under «Νούμερα».
 */
export const TPL_BOXES: Record<string, number> = { th: 4, op: 4, mg: 5, sk: 2, tae: 1 };

/** The form of one service block, as the dialogs edit it. */
export interface BlockF {
  name: string;
  nums: number;
  per: number;
  armed: boolean;
  weapon: 'own' | 'post';
  active: boolean;
  mode: HoursMode;
  sh: ShiftForm;
  hrs: string[];
  codes: Record<string, string>;
}

const real = (h?: string) => (h && h !== 'ημέρα' ? h : '');

/** A count typed in «Νούμερα» or «Άτομα»: a whole number from 1 to `max` (empty or text gives 1). */
export const clampCount = (v: number, max: number) => Math.max(1, Math.min(max, Math.floor(v) || 1));

/** Is `b` one of the built-in «σκοπιά» services (numbers start at 3η)? A custom block never is. */
export const isSk = (b?: BlockDef) => !!b && b.kind === 'sk' && !b.custom;

/** Does any post of `b` rotate (θαλαμοφύλακες…)? Those blocks only take shifts, never fixed hours. */
export const isRotating = (b?: BlockDef) => !!b && b.posts.some((p) => p.rot != null);

/** The form a dialog opens with: blank for a new service, the saved values for an existing one. */
export function initialForm(b: BlockDef | undefined): BlockF {
  if (!b) {
    return {
      name: '',
      nums: 1,
      per: 1,
      armed: false,
      weapon: 'own',
      active: true,
      mode: 'day',
      sh: shiftForm(),
      hrs: [''],
      codes: {},
    };
  }
  const shape = blockShape(b);
  const hrs = blockGroups(b.posts).map((g) => (g[0].rot == null ? real(g[0].hrs) : ''));
  const mode: HoursMode = isRotating(b) || b.shift ? 'shift' : hrs.some(Boolean) ? 'fixed' : 'day';
  return {
    name: b.name,
    nums: shape.nums,
    per: shape.per,
    armed: b.armed,
    weapon: b.armWeapon === 'post' ? 'post' : 'own',
    active: !b.hidden,
    mode,
    sh: shiftForm(b),
    hrs,
    codes: Object.fromEntries(b.posts.map((x) => [x.k, x.code || ''])),
  };
}

/** The placeholder block that `reshapeBlock` grows a new service from. */
export const SEED_BLOCK: BlockDef = {
  id: 'new',
  kind: 'other',
  name: '',
  armed: false,
  custom: true,
  posts: [{ k: 'new_1', label: '', short: '', hrs: 'ημέρα' }],
};

/**
 * The numbers of the shape preview: «1ος, 2ος…», or «3η, 4η…» for the built-in σκοπιά (numbered from its first post).
 * `labels` adds the people of each number: «1ος (α + β)».
 */
export function numberLabels(b: BlockDef | undefined, nums: number, per: number): { nums: string[]; labels: string[] } {
  const sk = isSk(b);
  const first = sk ? +(/\d+/.exec(b!.posts[0]?.short || '')?.[0] || 3) : 1;
  const names = Array.from({ length: nums }, (_, i) => (sk ? first + i + 'η' : i + 1 + 'ος'));
  const labels = names.map((x) => x + (per > 1 ? ' (' + GR.slice(0, per).join(' + ') + ')' : ''));
  return { nums: names, labels };
}

/** Why «Αποθήκευση» is off ('' = it is on): no name, a code error of this service, or bad shifts. */
export function blockWhy(f: BlockF, codeErrs: string[]): string {
  return !f.name.trim() ? 'Λείπει: Όνομα' : codeErrs[0] || (f.mode === 'shift' ? shiftWhy(f.sh) : '');
}

/** Facts for the shape line under the three fields: total posts, template boxes and which hints show. */
export function shapeInfo(b: BlockDef | undefined, f: BlockF) {
  const total = f.nums * f.per;
  const boxes = b && !b.custom ? TPL_BOXES[b.kind] : undefined;
  return {
    total,
    boxes,
    /** Name of the Excel table, in capitals. */
    tableName: b ? b.name.toUpperCase() : '',
    /** Posts leave the shape: they keep their history but stop showing in «Θέσεις». */
    dropsPosts: !!b && total < b.posts.filter((p) => !p.hidden).length,
    /** More numbers than the template has boxes for. */
    overBoxes: boxes != null && f.nums > boxes,
    /** Fewer numbers than boxes: the last boxes stay empty. */
    underBoxes: !!b && !b.custom && f.nums < (boxes || 0),
  };
}

/** The shifts saved with the block: `null` when the mode is not «shift», or a rotating block left at its defaults. */
export function shiftOut(f: BlockF, rotating: boolean): ShiftDef | null {
  if (f.mode !== 'shift') return null;
  const untouched = rotating && !f.sh.own && f.sh.every === 120 && !normTime(f.sh.from) && !normTime(f.sh.to);
  return untouched ? null : shiftOf(f.sh);
}

/** Hours per number for «editBlock»: none for «day», one per number for «fixed» (empty ones copy the first). */
export function hoursPerNumber(f: BlockF): string[] | undefined {
  if (f.mode === 'day') return Array.from({ length: MAX_NUMS }, () => '');
  if (f.mode === 'fixed') return Array.from({ length: f.nums }, (_, i) => f.hrs[i] ?? f.hrs[0] ?? '');
  return undefined;
}

/** The command a save runs: «editBlock» for an existing block, «addBlock» for a new one. */
export function blockCommand(b: BlockDef | undefined, phase: Phase, f: BlockF, rotating: boolean): Command {
  if (!b) {
    return {
      t: 'addBlock',
      phase,
      name: f.name,
      kind: 'other',
      armed: f.armed,
      n: f.nums,
      per: f.per,
      hrs: f.mode === 'fixed' ? f.hrs[0] || '' : '',
      off: !f.active,
      shift: f.mode === 'shift' ? shiftOf(f.sh) : null,
      armWeapon: f.weapon,
    };
  }
  const hrsNum = hoursPerNumber(f);
  return {
    t: 'editBlock',
    phase,
    id: b.id,
    name: f.name,
    nums: f.nums,
    per: f.per,
    hrs: {},
    ...(hrsNum ? { hrsNum } : {}),
    codes: f.codes,
    shift: shiftOut(f, rotating),
    armed: f.armed,
    armWeapon: f.weapon,
    hidden: !f.active,
  };
}

/** The toast after «Προσθήκη» of a service: inactive, in the current ΦΡΟΥΡΑ, or in another one. */
export function addedToastText(f: BlockF, inCurrentPhase: boolean, phaseLabel: string): string {
  const tail = !f.active
    ? '. Είναι ανενεργή: την ενεργοποιείς στις Ρυθμίσεις › Υπηρεσίες.'
    : inCurrentPhase
      ? '. Τη βλέπεις στις θέσεις και στο έντυπο.'
      : '. Τη βλέπεις όταν ισχύει η ΦΡΟΥΡΑ ' + phaseLabel + '.';
  return 'Προστέθηκε: ' + f.name + tail;
}

/** Value of the last option of the phase list: «+ Νέο έντυπο υπηρεσιών…». */
export const NEW_PHASE = '__new';

/** Tip of the ΦΡΟΥΡΑ built-ins, shown on the phase select. */
export const PHASE_TIP: Record<string, string> = {
  sven: '2 πίνακες θαλαμοφυλάκων και μαγειρεία',
  spen: 'Θαλαμοφύλακες, οπλοφύλακες, σκοποί, ΤΑΕ, μαγειρεία',
};

/** Tip of the phase select: a custom form says which template it uses, a built-in has its own text. */
export const phaseTip = (cur: { id: Phase; custom: boolean; base: BasePhase }, baseName: Record<BasePhase, string>) =>
  cur.custom
    ? 'Δικό σου έντυπο υπηρεσιών, βγαίνει στο Excel με το έντυπο της ' + baseName[cur.base]
    : PHASE_TIP[cur.id];

/** Why «Προσθήκη» / «Αποθήκευση» of a phase is off ('' = on): the name is empty. */
export const phaseWhy = (name: string) => (!name.trim() ? 'Λείπει: Όνομα' : '');

/** The id of the phase a save added: the one that was not there before (`undefined` for a rename). */
export function addedPhaseId(before: Set<Phase>, settings: Settings): Phase | undefined {
  return (settings.phases || []).find((x) => !before.has(x.id))?.id;
}
