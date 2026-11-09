// Post codes: the default codes of the built-in forms, filling missing codes, and the comparison key of a code.
//
// Purpose: `withCodes` (settings rev 3), `defaultCode`, `codeKey`.
// Does NOT: read the duty-check Excel (core/excel-in) or decide aliases (Settings.dutyCodeAliases).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: codes like Θ1α, Μ2, ΛΥ are exact and printed in outputs; the same key function is used when reading Excel files.
// Covering tests: test/codes.test.ts, test/codes-followups.test.ts.
import { normGreek } from '../lib/text';
import { DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN } from './defaultBlocks';
import type { BasePhase, BlockDef } from './duty';
import { KIND_CODE } from './duty';
import type { Settings } from './settings';
import { everyBlock } from './settingsAccess';

/**
 * Post codes (rev 3): posts without a code get the form's default (Θ1α…Θ4β in ΣΒΕΝ; Θ1…Θ4, ΟΠ1…ΟΠ4, Σ3α… in ΣΠΕΝ;
 * Μ1…Μ5, ΛΥ, ΔΥ, ΤΑΕ); the user's own duties get a letter + number (Υ1, Υ2…) that never lands on an existing code.
 * The form codes of both built-in forms first, then the user's own: otherwise a room-guard duty of the user's in ΣΒΕΝ
 * would take Θ1, Θ2 of ΣΠΕΝ and the room guards of ΣΠΕΝ would become Θ3…Θ6.
 */
export function withCodes(st: Settings): Settings {
  const owner = new Map<string, string>(); // code key → the post that has it
  for (const b of everyBlock(st)) for (const p of b.posts) if (p.code) owner.set(codeKey(p.code), p.k);
  const free = (c: string, k: string) => {
    const o = owner.get(codeKey(c));
    return o == null || o === k;
  };
  const fill = (ph: BasePhase, list: BlockDef[] | undefined, own: boolean) =>
    (list || []).map((b) => ({
      ...b,
      posts: b.posts.map((p, i) => {
        if (p.code) return p;
        let c = defaultCode(ph, b.id, p.k);
        if (!c || !free(c, p.k)) {
          if (!own) return p;
          let n = i + 1;
          do c = KIND_CODE[b.kind] + n++;
          while (!free(c, p.k));
        }
        owner.set(codeKey(c), p.k);
        return { ...p, code: c };
      }),
    }));
  const blocks = fill('sven', st.blocks, false),
    blocksSpen = fill('spen', st.blocksSpen, false);
  const own = (st.phases || []).map((x) => ({ ...x, blocks: fill(x.base, x.blocks, false) }));
  return {
    ...st,
    blocks: fill('sven', blocks, true),
    blocksSpen: fill('spen', blocksSpen, true),
    ...(st.phases ? { phases: own.map((x) => ({ ...x, blocks: fill(x.base, x.blocks, true) })) } : {}),
  };
}
// The form's code for a post (ΣΒΕΝ/ΣΠΕΝ, duty, post), as in the defaults
const DEF_CODES = new Map<string, string>();
for (const [ph, list] of [
  ['sven', DEFAULT_BLOCKS],
  ['spen', DEFAULT_BLOCKS_SPEN],
] as const)
  for (const b of list) for (const p of b.posts) if (p.code) DEF_CODES.set(ph + '|' + b.id + '|' + p.k, p.code);
/** The default code of a post of a built-in form, or undefined. */
export const defaultCode = (ph: BasePhase, block: string, k: string) => DEF_CODES.get(ph + '|' + block + '|' + k);
/** Comparison key of codes: capitals, no accents, Latin look-alikes → Greek, no spaces and dashes. */
export const codeKey = (raw: unknown) => normGreek(raw).replace(/[\s\-–—]+/g, '');
