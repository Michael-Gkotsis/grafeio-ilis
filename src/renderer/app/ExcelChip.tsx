// The chip in the top bar that shows whether the app is writing to the Excel files.
// Purpose: `ExcelChip` listens to `window.api.onBusy` and shows «writing…», «written at hh:mm» or the write error.
// Does NOT: write anything, retry a failed write, or show anything while nothing was written yet.
// Owner layer: renderer/app. Why: Excel writes run in the background; the user must see when they start and end.
// Covering test: test/screens-main.test.ts (shell snapshots: the chip is empty until the first busy event).
import { useEffect, useState } from 'react';
import type { ExcelBusy } from '../../shared/api';
import { cx } from '../ui';

/** Top bar: Excel writes happen in the background, so this shows when it is writing and when it finished. */
export function ExcelChip() {
  const [b, setB] = useState<ExcelBusy | null>(null);
  useEffect(() => window.api.onBusy?.(setB), []);
  if (!b) return null;
  if (b.on) {
    return (
      <span
        className="xlchip is-on"
        role="status"
        data-tip="Η εφαρμογή γράφει τις αλλαγές στα αρχεία Excel. Μπορείς να συνεχίσεις κανονικά."
        data-tip-side="bottom"
      >
        <span className="xlchip__dot" />
        <span className="xlchip__txt">Γράφεται στο Excel…</span>
        <span className="xlchip__short">Excel…</span>
      </span>
    );
  }
  return (
    <span
      className={cx('xlchip', b.error && 'is-bad')}
      role="status"
      data-tip={
        b.error
          ? 'Η τελευταία εγγραφή στο Excel δεν έγινε: ' + b.error + ' (Ρυθμίσεις › Αρχεία Excel)'
          : 'Οι αλλαγές γράφτηκαν στα αρχεία Excel στις ' + b.at
      }
      data-tip-side="bottom"
    >
      <span className="xlchip__txt">{b.error ? 'Δεν γράφτηκε στο Excel' : 'Γράφτηκε ' + b.at}</span>
      {b.error && <span className="xlchip__short">Excel ✗</span>}
    </span>
  );
}
