// Handlers: settings, the ΗΚΑΙ rows the user added and the «printed» mark.
//
// Purpose: The handlers of `setSettings`, `setHkRows`, `printed`. Each one is the old `case` body of `run`,
//   unchanged.
// Does NOT: handle the duty forms and their blocks (phases.ts).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/lists.test.ts, test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import type { AppState } from '../../model/state';
import { guessHk, hkClaimOf, hkRowList } from '../../people/hkRows';
import type { CommandOf, Result } from '../types';

/** Handler of the command `setSettings`. */
export function handleSetSettings(s: AppState, c: CommandOf<'setSettings'>): Result {
  return { state: { ...s, settings: { ...s.settings, ...c.settings } }, text: 'Ρυθμίσεις: ' + c.text, files: [] };
}
/** Handler of the command `setHkRows`. */
export function handleSetHkRows(s: AppState, c: CommandOf<'setHkRows'>): Result {
  const before = s.settings.lists;
  const lists = { ...(before || {}), hkRows: c.rows };
  const rows = new Set(hkRowList(lists));
  // other names: only for rows that exist, without blanks
  const names = Object.fromEntries(
    Object.entries(c.names || before?.hkNames || {})
      .map(([k, v]) => [k, (v || '').trim().replace(/\s+/g, ' ')])
      .filter(([k, v]) => v && rows.has(k)),
  );
  if (Object.keys(names).length) lists.hkNames = names;
  else delete lists.hkNames;
  const cadreList = s.cadreList.map((x) => {
    const claim = hkClaimOf(lists, x.rank, x.origin);
    if (claim) return claim === x.hk ? x : { ...x, hk: claim };
    // his row was deleted or no longer collects his rank: he goes where he would go without it
    return !rows.has(x.hk) || hkClaimOf(before, x.rank, x.origin) === x.hk
      ? { ...x, hk: guessHk(x.rank, lists, x.origin) }
      : x;
  });
  const only = (o: Record<string, number> | undefined) =>
    o && Object.fromEntries(Object.entries(o).filter(([k]) => rows.has(k)));
  const hkai = s.settings.hkai?.prov ? { ...s.settings.hkai, prov: only(s.settings.hkai.prov) } : s.settings.hkai;
  return {
    state: { ...s, cadreList, settings: { ...s.settings, lists, cadre: only(s.settings.cadre)!, hkai } },
    text: 'Ρυθμίσεις: ' + c.text,
    files: [],
  };
}
/** Handler of the command `printed`. */
export function handlePrinted(s: AppState, c: CommandOf<'printed'>): Result {
  return {
    state: { ...s, printed: { ...s.printed, [c.date]: c.at } },
    text: 'Βγήκε ' + c.files.join(', '),
    files: c.files,
    undoable: false,
  };
}
