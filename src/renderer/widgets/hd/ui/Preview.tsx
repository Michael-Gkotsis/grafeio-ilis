// The page of the Ημερήσια Διαταγή as it comes out in Word.
// Purpose: `Preview`, draws the HTML of the page (small next to the form, large in the dialog).
// Does NOT: build the page (shared/hd.ts `hdPageHtml` does).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/hd.test.ts.

/** Props of `Preview`. */
export interface PreviewProps {
  /** The page HTML from `hdPageHtml`; it is built from the app's own data and escaped there. */
  html: string;
}

export function Preview({ html }: PreviewProps) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: hdPageHtml builds it from the app's own escaped data
  return <div className="hd__page" dangerouslySetInnerHTML={{ __html: html }} />;
}
