// Small formatters of the update UI.
// Purpose: megabytes with a decimal comma, and the local clock time / ISO day of a millisecond timestamp.
// Does NOT: read the clock (callers pass the timestamp).
// Owner layer: renderer/features/update. Why: moved verbatim from renderer/update.ts (Phase 5.3b).
// Covering test: test/auto-update.test.ts.

/** Bytes to «12,3» megabytes. */
export const mb = (n: number) => (n / 1048576).toFixed(1).replace('.', ',');

/** «HH:MM» of a timestamp (ms since the epoch), local time. */
export const hmOf = (t: number) => {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

/** ISODate of a timestamp (ms since the epoch), local time. */
export const dayOf = (t: number) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
