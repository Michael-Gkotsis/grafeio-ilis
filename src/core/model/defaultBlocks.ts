// The default duty forms: «ΦΡΟΥΡΑ ΣΒΕΝ» and «ΦΡΟΥΡΑ ΣΠΕΝ».
//
// Purpose: DEFAULT_BLOCKS (ΣΒΕΝ) and DEFAULT_BLOCKS_SPEN with the exact post codes of the real forms.
// Does NOT: apply user changes (settings do) or build posts (blocks.ts).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: a new installation starts from the real forms, and migrations compare against these codes.
// Covering tests: test/codes.test.ts, test/own-phases.test.ts, golden «ΦΡΟΥΡΑ» outputs.
import type { BlockDef, PostDef } from './duty';

/**
 * Default = the real form «ΦΡΟΥΡΑ ΣΒΕΝ» (sample 01): Λ/Υ, Δ/Υ, 2 blocks of room guards 4×3, kitchen ×5.
 * Which posts are armed needs the sergeant's confirmation: it is a setting.
 */
export const DEFAULT_BLOCKS: BlockDef[] = [
  {
    id: 'ly',
    kind: 'ly',
    name: 'Λ/Υ και Δ/Υ',
    armed: false,
    posts: [
      { k: 'ly', label: 'Λ/Υ', short: 'Λ/Υ', hrs: '14:00 → 14:00', code: 'ΛΥ' },
      { k: 'dy', label: 'Δ/Υ', short: 'Δ/Υ', hrs: '14:00 → 14:00', code: 'ΔΥ' },
    ],
  },
  {
    id: 'th',
    kind: 'th',
    name: 'Θαλαμοφύλακες (α΄ πίνακας)',
    armed: false,
    posts: [0, 1, 2, 3].map((i) => ({
      k: 'th' + (i + 1),
      label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (α΄)',
      short: i + 1 + 'ος',
      rot: i,
      code: 'Θ' + (i + 1) + 'α',
    })),
  },
  {
    id: 'th2',
    kind: 'th',
    name: 'Θαλαμοφύλακες (β΄ πίνακας)',
    armed: false,
    posts: [0, 1, 2, 3].map((i) => ({
      k: 'th' + (i + 5),
      label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος (β΄)',
      short: i + 1 + 'ος',
      rot: i,
      code: 'Θ' + (i + 1) + 'β',
    })),
  },
  {
    id: 'mg',
    kind: 'mg',
    name: 'Μαγειρεία',
    armed: false,
    posts: [1, 2, 3, 4, 5].map((i) => ({
      k: 'mg' + i,
      label: 'Μαγειρεία ' + i + 'ος',
      short: i + 'ος',
      hrs: 'ημέρα',
      code: 'Μ' + i,
    })),
  },
];
// «ΦΡΟΥΡΑ ΣΠΕΝ» (the clerk's photo, 10/10): room guards, weapon guards, kitchen ×5, ΤΑΕ, sentries of the 3rd and 4th
// sentry post in pairs. Weapon guards and sentries are armed by default; changed in Settings.
const skPost = (n: number, ab: string, rot: number): PostDef => ({
  k: 'sk' + n + ab,
  label: 'Σκοπός ' + n + 'ης σκοπιάς (' + (ab === 'a' ? 'α' : 'β') + ')',
  short: n + 'η ' + (ab === 'a' ? 'α' : 'β'),
  rot,
  code: 'Σ' + n + (ab === 'a' ? 'α' : 'β'),
});
/** Default blocks of «ΦΡΟΥΡΑ ΣΠΕΝ»; the Λ/Υ-Δ/Υ and kitchen blocks are shared with ΣΒΕΝ. */
export const DEFAULT_BLOCKS_SPEN: BlockDef[] = [
  DEFAULT_BLOCKS[0],
  {
    id: 'th',
    kind: 'th',
    name: 'Θαλαμοφύλακες',
    armed: false,
    posts: [0, 1, 2, 3].map((i) => ({
      k: 'th' + (i + 1),
      label: 'Θαλαμοφύλακας ' + (i + 1) + 'ος',
      short: i + 1 + 'ος',
      rot: i,
      code: 'Θ' + (i + 1),
    })),
  },
  {
    id: 'op',
    kind: 'op',
    name: 'Οπλοφύλακες',
    armed: true,
    posts: [0, 1, 2, 3].map((i) => ({
      k: 'op' + (i + 1),
      label: 'Οπλοφύλακας ' + (i + 1) + 'ος',
      short: i + 1 + 'ος',
      rot: i,
      code: 'ΟΠ' + (i + 1),
    })),
  },
  {
    id: 'sk',
    kind: 'sk',
    name: 'Σκοποί',
    armed: true,
    posts: [skPost(3, 'a', 2), skPost(3, 'b', 2), skPost(4, 'a', 3), skPost(4, 'b', 3)],
  },
  DEFAULT_BLOCKS[3],
  // ΤΑΕ: armed, no fixed hours (sergeant, 10/10)
  {
    id: 'tae',
    kind: 'tae',
    name: 'ΤΑΕ',
    armed: true,
    posts: [{ k: 'tae', label: 'ΤΑΕ', short: 'ΤΑΕ', hrs: '', code: 'ΤΑΕ' }],
  },
];
