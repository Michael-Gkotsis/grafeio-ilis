// A link inside the rules dialog that closes it and does something on the Υπηρεσίες screen.
// Purpose: `TabLink`, e.g. «Άνοιγμα» of «Ποιος κάνει τι» or «Όρισε» of the permanent Λ/Υ-Δ/Υ.
// Does NOT: close the dialog by itself: it asks the same question as `GoLink` when there are unsaved changes.
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/ux-names.test.ts.
import type { ReactNode } from 'react';
import { useContext } from 'react';
import { Button, DialogLeave } from '../../../shared/ui';

/** Props of {@link TabLink}. */
export interface TabLinkProps {
  /** What to do once the dialog is allowed to close. */
  onGo: () => void;
  children?: ReactNode;
}

/** The link-button. */
export function TabLink({ onGo, children }: TabLinkProps) {
  const leave = useContext(DialogLeave);
  return (
    <Button variant="link" className="golink" onClick={() => (leave ? leave(onGo) : onGo())}>
      {children}
    </Button>
  );
}
