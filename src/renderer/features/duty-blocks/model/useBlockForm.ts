// The state of the service-block form, shared by «Νέα υπηρεσία» and «Επεξεργασία».
// Purpose: `useBlockForm` holds the form, reshapes the posts the way they will be saved and checks the codes.
// Does NOT: draw the form (`BlockForm` does) or run the save (the two dialogs do).
// Owner layer: renderer/features/duty-blocks. Why: moved verbatim from renderer/blockForm.ts (Phase 6, Ρυθμίσεις S3).
// Covering test: test/duty-blocks-view.test.ts, test/screens-dialogs-forms.test.ts.
import { useMemo, useState } from 'react';
import { codeErrors } from '../../../../shared/codes';
import {
  blocksOf,
  dutyStartOf,
  everyBlock,
  reshapeBlock,
  withBlocks,
  type BlockDef,
  type Phase,
} from '../../../../shared/domain';
import { useStore } from '../../../shared/model';
import { SEED_BLOCK, blockCommand, blockWhy, initialForm, isRotating, numberLabels, type BlockF } from './view';

/** What `useBlockForm` returns: the form, the reshaped posts, the code errors and the command to save. */
export type BlockFormState = ReturnType<typeof useBlockForm>;

/**
 * The form of one service (Michael, 4/11): the same for «Νέα υπηρεσία» and «Επεξεργασία». The shape (numbers × people)
 * comes from `reshapeBlock`, exactly as it will be saved.
 * @param b - the block to edit; `undefined` for a new one
 * @param phase - the ΦΡΟΥΡΑ the block belongs to
 */
export function useBlockForm(b: BlockDef | undefined, phase: Phase) {
  const { state } = useStore();
  const st = state.settings;
  const start = dutyStartOf(st);
  const rotB = isRotating(b);
  const [f, setF] = useState<BlockF>(() => initialForm(b));
  const set = (patch: Partial<BlockF>) => setF((x) => ({ ...x, ...patch }));
  const used = useMemo(() => new Set(everyBlock(st).flatMap((x) => x.posts.map((p) => p.k))), [st]);
  const seed: BlockDef = b || SEED_BLOCK;
  const posts = useMemo(
    () => reshapeBlock(seed, f.nums, f.per, f.name.trim() || seed.name || 'Νέα', used),
    [b, f.nums, f.per, f.name, used],
  );
  const shown = posts.filter((p) => !p.hidden);
  // why: code errors of THIS service as they would be after the save (same code elsewhere, a bare letter…) block the
  // save; errors of other services are only shown. New members without a code get one by themselves (a temporary code
  // for the check).
  const [errs, others] = useMemo(() => {
    if (!b) return [[] as string[], [] as string[]];
    const ps = posts.map((p, i) => ({ ...p, code: (f.codes[p.k] || '').trim() || p.code || 'ΧΧ' + (i + 1) }));
    const list = blocksOf(st, phase).map((x) => (x.id === b.id ? { ...x, posts: ps } : x));
    const t = withBlocks(st, phase, list);
    const mine = codeErrors(t, { phase, id: b.id });
    return [mine, codeErrors(t).filter((x) => !mine.includes(x))];
  }, [f.codes, posts, st, phase, b]);
  const { nums, labels } = numberLabels(b, f.nums, f.per);
  const why = blockWhy(f, errs);
  const cmd = () => blockCommand(b, phase, f, rotB);
  return { b, phase, f, set, posts, shown, errs, others, labels, nums, rotB, start, why, cmd };
}
