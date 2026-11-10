// Handlers: the Ημερήσια Διαταγή document, the ΗΜΕΡ calendar and the ΗΚΑΙ manual values.
//
// Purpose: The handlers of `setHd`, `setImer`, `setHkaiManual`, `setHkaiLv`, `freezeHkaiLv`. Each one is the old
//   `case` body of `run`, unchanged.
// Does NOT: build the ΗΔ or ΗΚΑΙ output (the engines hdDocx and xlsx do that).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/hd.test.ts, test/imer.test.ts, test/hkai.test.ts, test/golden-outputs.test.ts,
//   test/rules.test.ts, test/duty-fuzz.test.ts.
import { HK } from '../../model/unit';
import { cleanHd } from '../../forms/hd';
import { dm } from '../../lib/dates';
import { upper } from '../../lib/text';
import { shortName } from '../../model/person';
import type { AppState } from '../../model/state';
import type { HkaiManual } from '../../model/hkaiSettings';
import { personMap } from '../../duty/indexes';
import type { CommandOf, Result } from '../types';
import { withLv } from '../hkaiLv';

/** Handler of the command `setHd`. */
export function handleSetHd(s: AppState, c: CommandOf<'setHd'>): Result {
  const hd = { ...(s.hd || {}) };
  const had = !!hd[c.date];
  if (c.doc) hd[c.date] = cleanHd(c.doc);
  else delete hd[c.date];
  if (!c.doc && !had) return { state: s, text: '', files: [] };
  return {
    state: { ...s, hd },
    text: 'Ημερήσια Διαταγή ' + dm(c.date) + (c.doc ? ': βγήκε' : ': ξανά από τα δεδομένα'),
    files: [],
  };
}
/** Handler of the command `setImer`. */
export function handleSetImer(s: AppState, c: CommandOf<'setImer'>): Result {
  const pm = personMap(s.people);
  const day = { ...(s.imer?.[c.date] || {}) };
  const parts: string[] = [];
  for (const x of c.cells) {
    const p = pm.get(x.pid);
    if (!p) continue;
    const v = upper(x.text).replace(/\s+/g, ' ').trim().slice(0, 24);
    if ((day[x.pid] || '') === v) continue;
    if (v) day[x.pid] = v;
    else delete day[x.pid];
    parts.push(shortName(p) + (v ? ' → ' + v : ': πίσω στο αυτόματο'));
  }
  if (!parts.length) return { state: s, text: '', files: [] };
  const imer = { ...(s.imer || {}) };
  if (Object.keys(day).length) imer[c.date] = day;
  else delete imer[c.date];
  return {
    state: { ...s, imer },
    text:
      'Ημερολόγιο κωλυομένων ' + dm(c.date) + ': ' + (parts.length > 3 ? parts.length + ' κελιά' : parts.join(', ')),
    files: [],
  };
}
/** Handler of the command `setHkaiManual`. */
export function handleSetHkaiManual(s: AppState, c: CommandOf<'setHkaiManual'>): Result {
  // the «3. Άδειες» of the day (lv) stays as it is, if it did not come along
  const lv = c.manual.lv ?? s.hkaiManual[c.date]?.lv;
  const manual: HkaiManual = lv === undefined ? c.manual : { ...c.manual, lv };
  const hkaiManual = { ...s.hkaiManual, [c.date]: manual };
  return { state: { ...s, hkaiManual }, text: HK() + ' ' + dm(c.date) + ': χειροκίνητα στοιχεία', files: [HK()] };
}
/** Handler of the command `setHkaiLv`. */
export function handleSetHkaiLv(s: AppState, c: CommandOf<'setHkaiLv'>): Result {
  const hkaiManual = { ...s.hkaiManual, [c.date]: withLv(s, c.date, c.on) };
  return {
    state: { ...s, hkaiManual },
    text:
      HK() +
      ' ' +
      dm(c.date) +
      (c.on ? ': οι άδειες γράφονται στο 3. άδειες' : ': οι άδειες δεν γράφονται στο 3. άδειες'),
    files: [HK()],
  };
}
/** Handler of the command `freezeHkaiLv`. */
export function handleFreezeHkaiLv(s: AppState, c: CommandOf<'freezeHkaiLv'>): Result {
  // Excel or print came out: the value that was used stays for the day, so that it comes out the same again even if the
  // default changes. Silently.
  if (s.hkaiManual[c.date]?.lv !== undefined) return { state: s, text: '', files: [], undoable: false };
  const hkaiManual = { ...s.hkaiManual, [c.date]: withLv(s, c.date, c.on) };
  return { state: { ...s, hkaiManual }, text: '', files: [], undoable: false };
}
