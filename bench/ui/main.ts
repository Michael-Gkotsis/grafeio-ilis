// Το UI της εφαρμογής με ρεαλιστικά δεδομένα (bench/state.ts) και απαντήσεις όπως του main: μόνο ό,τι άλλαξε.
import '../../src/renderer/styles.css';
import { createRoot } from 'react-dom/client';
import { html } from '../../src/renderer/ui';
import { App } from '../../src/renderer/app';
import { mockApi } from '../../src/renderer/mockApi';
import { applyPrefs, loadPrefs } from '../../src/renderer/prefs';
import { installTips } from '../../src/renderer/tips';
import { apply, type Command } from '../../src/shared/commands';
import { nowHM, today } from '../../src/shared/dates';
import type { AppState, AuditEntry } from '../../src/shared/domain';
import type { CmdResult } from '../../src/shared/api';

// τα δεδομένα (bench/state.ts) τα γράφει το run.mjs στο state.json
const base = mockApi();   // για ό,τι δεν μετράμε (αρχεία, φάκελοι)· πριν από το σημάδι, γιατί χτίζει τα δικά του δεδομένα
let state: AppState = await (await fetch('./state.json')).json();
(window as any).__benchData = performance.now();
let sent = state, seq = 0; const audit: AuditEntry[] = []; const undo: { id: number; prev: AppState }[] = [];
const runs: number[] = []; (window as any).__benchRuns = runs;
const reply = (text: string): CmdResult => {
  const changes: any = {}; for (const k of Object.keys(state) as (keyof AppState)[]) if (state[k] !== sent[k]) changes[k] = state[k];
  sent = state; const newAudit = audit.length && audit[0].id > seq - 1 ? [audit[0]] : [];
  return { ok: true, changes, newAudit, text };
};
const api = {
  ...base,
  boot: async () => { const b = await base.boot(); sent = state; return { ...b, state, audit: [...audit] }; },
  run: async (cmd: Command) => {
    const a = performance.now();
    try {
      const r = apply(state, cmd, { today: today(), newId: () => 'u' + ++seq });
      const prev = state; state = r.state;
      if (r.text) { const e: AuditEntry = { id: ++seq, at: nowHM(), day: today(), text: r.text, files: r.files, source: 'app', undoable: true, undone: false }; audit.unshift(e); undo.push({ id: e.id, prev }); }
      return reply(r.text);
    } catch (e: any) { return { ok: false as const, error: e.message }; } finally { runs.push(performance.now() - a); }
  },
  sync: async () => reply(''),
  dayCheck: async () => reply(''),
  // χωρίς κάτι για αναίρεση: «άγγιγμα» ενός κλειδιού (__benchTouch), όπως μετά από μια εντολή που το άλλαξε
  undo: async () => {
    const u = undo.pop();
    if (u) state = u.prev;
    else { const k = (window as any).__benchTouch as keyof AppState; const v: any = state[k]; state = { ...state, [k]: Array.isArray(v) ? [...v] : { ...v } }; }
    return reply('Αναιρέθηκε');
  }
};
(window as any).api = api;
applyPrefs(loadPrefs()); installTips();
const root = createRoot(document.getElementById('root')!);
window.api.boot().then(boot => root.render(html`<${App} boot=${boot}/>`));
