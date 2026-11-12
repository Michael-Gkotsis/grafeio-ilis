// The body of a "what happened, then why" toast: a bold lead, a space and the reason.
// Purpose: `leadText(lead, text)` builds `<span><b>lead</b> text</span>` for the toasts of a failed copy or print.
// Does NOT: show the toast (the caller does) or add a render boundary: it is a plain function, not a component.
// Owner layer: renderer/shared/lib. Why: written once instead of twice (Phase 6, Ρυθμίσεις S4) so that moving
//   `useUsbCopy` from htm to TSX does not make the first-load chunk bigger (JSX expands to more bytes than htm did).
// Covering test: test/screens-settings-guide.test.ts (the USB toast text), test/reports-flow.test.ts.

/**
 * @param lead - bold first words, Greek («Δεν έγινε.»)
 * @param text - the reason, shown after one space (the toast of a copy with a warning has it set; typed as optional)
 * @returns the toast body; the children are exactly the bold lead, the space and the reason
 */
export function leadText(lead: string, text: string | undefined) {
  return (
    <span>
      <b>{lead}</b> {text}
    </span>
  );
}
