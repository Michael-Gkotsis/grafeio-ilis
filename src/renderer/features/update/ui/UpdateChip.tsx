// The «Νέα έκδοση» button in the top bar.
// Purpose: `UpdateChip` shows that a new version exists, is being installed or is ready; nothing when there is none.
// Does NOT: open the dialog itself (`onOpen` does).
// Owner layer: renderer/features/update. Why: moved verbatim from renderer/update.ts (Phase 5.3b).
// Covering test: test/auto-update.test.ts.
import type { UpdInfo } from '../../../../shared/api';
import { Button } from '../../../shared/ui';

/** Props of `UpdateChip`. */
export interface UpdateChipProps {
  u: UpdInfo | null;
  onOpen: () => void;
}

/** The chip, or null when there is nothing to show. */
export function UpdateChip({ u, onOpen }: UpdateChipProps) {
  if (!u || (!u.avail && u.phase === 'idle')) return null;
  const ready = u.phase === 'ready',
    work = u.phase === 'working';
  return (
    <Button
      variant="outline"
      size="sm"
      className="updchip"
      data-tip={
        ready
          ? 'Η ενημέρωση είναι έτοιμη'
          : work
            ? 'Γίνεται ενημέρωση…'
            : 'Υπάρχει νέα έκδοση (' + u.avail!.version + ')'
      }
      data-tip-side="bottom"
      onClick={onOpen}
    >
      ↑ <span className="updchip__long">{ready ? 'Έτοιμη ενημέρωση' : work ? 'Ενημέρωση…' : 'Νέα έκδοση'}</span>
      <span className="updchip__short">{ready ? 'Έτοιμη' : work ? '…' : 'Νέα'}</span>
    </Button>
  );
}
