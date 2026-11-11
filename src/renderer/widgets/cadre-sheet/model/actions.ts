// The two writes of the cadre sheet.
// Purpose: `deleteAbs` removes one status of the member, `deleteMember` removes the member; both toast with an undo.
// Does NOT: ask for confirmation (the sheet's «Διαγραφή στελέχους…» dialog does).
// Owner layer: renderer/widgets/cadre-sheet. Why: moved verbatim from screens/cadre.ts (Phase 5.3c).
// Covering test: test/cadre.test.ts.
import { rankTxt } from '../../../../shared/ranks';
import type { Cadre, CadreAbs } from '../../../../shared/domain';
import type { CadreSheetModel } from './useCadreSheet';

/** Delete one status of the member; the toast offers undo. */
export async function deleteAbs({ run, toast, undoMark }: CadreSheetModel, a: CadreAbs) {
  if (await run({ t: 'deleteCadreAbs', id: a.id }, false))
    toast({ text: 'Διαγράφηκε η κατάσταση', actions: [undoMark()] });
}

/** Close the sheet and delete the member; the toast offers undo. */
export async function deleteMember({ run, toast, undoMark, setDel }: CadreSheetModel, c: Cadre, onClose: () => void) {
  setDel(false);
  onClose();
  if (await run({ t: 'deleteCadre', id: c.id }, false))
    toast({ text: 'Διαγράφηκε: ' + rankTxt(c) + ' ' + c.last, actions: [undoMark()] });
}
