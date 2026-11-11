// A link to another screen (or a Ρυθμίσεις tab) that is safe to use inside a dialog.
// Purpose: `GoLink` goes to `view` with `params`; inside a dialog it closes the dialog first, and it asks about unsaved
// changes the same way the ✕ does (UX Χ5, 22/10: it used to be plain text).
// Does NOT: know which screens exist (the route table is in app/).
// Owner layer: renderer/shared/ui. Why: moved down from renderer/common.ts (Phase 5.3b); screens and features (hk-rows) use it.
// Covering test: test/ux-names.test.ts.
import { useContext, type ReactNode } from 'react';
import { requestLeave } from '../lib/pending';
import { useNav } from '../model/nav';
import { Button } from './Button';
import { DialogLeave } from './Dialog';

/** Props of `GoLink`. */
export interface GoLinkProps {
  view: string;
  params?: Record<string, unknown>;
  children: ReactNode;
}

/**
 * «Ρυθμίσεις › …» ως σύνδεσμος που ανοίγει το σωστό σημείο. Μέσα σε παράθυρο το κλείνει πρώτα· αν έχει αλλαγές, ρωτά όπως το ✕.
 * Στην ίδια οθόνη (π.χ. άλλη ενότητα των Ρυθμίσεων) ρωτά για όσα δεν αποθηκεύτηκαν.
 */
export function GoLink({ view, params, children }: GoLinkProps) {
  const nav = useNav();
  const leave = useContext(DialogLeave);
  const go = () => {
    if (view === nav.view) requestLeave(() => nav.go(view, params));
    else nav.go(view, params);
  };
  return (
    <Button variant="link" className="golink" onClick={() => (leave ? leave(go) : go())}>
      {children}
    </Button>
  );
}
