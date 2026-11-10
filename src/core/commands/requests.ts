// Text helpers of the requests: leave destination and request text.
//
// Purpose: `cleanDest` (destination of a leave without double spaces) and `reqText` (the request text without
//   «αιτείται» and the final dot).
// Does NOT: validate a request.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: The ΗΚΑΙ sentence adds «αιτείται» and the dot by itself.
// Covering tests: test/requests-approve.test.ts.

/**
 * «αιτείται μετάθεση.» → «μετάθεση»: the ΗΚΑΙ sentence adds «αιτείται» and the dot by itself. Leave destination: no
 * double spaces, empty = none.
 */
export const cleanDest = (d: string | undefined): string => (d || '').trim().replace(/\s+/g, ' ');
/**
 * The text of a request without the «αιτείται» in front and the dots at the end: «αιτείται μετάθεση.» → «μετάθεση».
 * The ΗΚΑΙ sentence adds «αιτείται» and the dot by itself.
 */
export const reqText = (t: string) =>
  t
    .trim()
    .replace(/^αιτ[εέ][ιί]ται\s+/i, '')
    .replace(/[.\s]+$/, '')
    .trim();
