// Label and badge tone of each audit source, shared by the «Σήμερα» and «Ιστορικό» screens.
// Purpose: `SRC`, the Greek name and Badge tone of where an action came from (app, Excel, import, automatic).
// Does NOT: read the audit log or draw anything.
// Owner layer: renderer/shared/lib. Why: moved down from screens/today.ts (Phase 6) so pages/history needs no screen.
// Covering test: test/history-view.test.ts.

/** Label and badge tone of each audit source (app, Excel, import, automatic); the History screen shows the same. */
export const SRC: Record<string, [string, string]> = {
  app: ['Εφαρμογή', 'outline'],
  excel: ['Excel', 'info'],
  import: ['Εισαγωγή', 'ey'],
  auto: ['Αυτόματα', 'ok'],
};
