// Builds the `StoreValue` the whole UI reads: keeps the last state from the main process and wraps its commands.
// Purpose: `useStoreValue(boot)` holds state and audit, merges the changes the main process sends, and offers
//   `run` / `undo` / `undoMark` / `refresh` / `sync`.
// Does NOT: render, route or bind keys; it never computes rules (the main process owns the state and the rules).
// Owner layer: renderer/app. Why: this was the body of Root; the provider stays a three-line component.
// Covering test: test/screens-main.test.ts (renders App on this store), test/ipc-contract.test.ts (window.api shape).
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Boot, CmdResult } from '../../shared/api';
import type { AppState, AuditEntry } from '../../shared/domain';
import type { Command } from '../../shared/commands';
import { SCREEN_AMBIENT, applyAmbient } from '../../core/ambient';
import { addDays } from '../../shared/dates';
import { clockChanged } from '../clock';
import { useToast } from '../ui';
import { useToday } from './hooks';
import type { StoreValue } from './store';

/** The audit list keeps this many entries; the main process sends more only on a full refresh. */
const AUDIT_KEEP = 300;

/** What the commands read and write: the latest state/audit, shared with `merge`. */
type Latest = MutableRefObject<{ state: AppState; audit: AuditEntry[] }>;
type Merge = (r: Extract<CmdResult, { ok: true }>) => AppState;

/**
 * Sends commands to the main process and merges the answer.
 * @param cur - latest `{ state, audit }`, read when an undo mark is created
 * @param merge - applies a successful result and returns the new state
 */
function useCommands(cur: Latest, merge: Merge) {
  const toast = useToast();
  const run = useCallback(
    async (cmd: Command, okText?: string | false) => {
      const r = await window.api.run(cmd);
      if (!r.ok) {
        toast({
          text: (
            <span>
              <b>Δεν έγινε.</b> {r.error}
            </span>
          ),
        });
        return null;
      }
      const next = merge(r);
      if (okText !== false && (okText || r.text)) toast({ text: okText || r.text });
      return next;
    },
    [toast, merge],
  );
  // One undo at a time: a double click or a held Ctrl+Z must not undo two actions.
  const undoing = useRef(false);
  const undo = useCallback(
    async (id?: number) => {
      if (undoing.current) return;
      undoing.current = true;
      try {
        const r = await window.api.undo(id);
        if (!r.ok) {
          toast({ text: r.error });
          return;
        }
        merge(r);
        toast({ text: r.text });
      } finally {
        undoing.current = false;
      }
    },
    [toast, merge],
  );
  const undoMark = useCallback(() => {
    const id = cur.current.audit.find((a) => a.undoable && !a.undone)?.id ?? -1;
    return {
      label: 'Αναίρεση',
      fn: () => {
        undo(id);
      },
      undoId: id,
    };
  }, [undo]);
  const sync = useCallback(async () => {
    const r = await window.api.sync();
    if (r.ok) merge(r);
  }, [merge]);
  return { run, undo, undoMark, sync };
}

/**
 * @param initial - the first boot result
 * @returns the store value, new only when something it contains changed
 */
export function useStoreValue(initial: Boot): StoreValue {
  const [boot, setBoot] = useState(initial);
  const [state, setState] = useState(initial.state);
  const [audit, setAudit] = useState(initial.audit);
  // Synonyms, time zone and ΗΚΑΙ/ΗΚΑΛ are set before the screens render.
  applyAmbient(state, SCREEN_AMBIENT);
  const cur = useRef({ state: initial.state, audit: initial.audit });
  const today = useToday();
  // Takes effect at once, without waiting for the clock tick.
  useEffect(() => {
    clockChanged();
  }, [state.settings.tz, state.settings.clockFix]);
  const refresh = useCallback(async () => {
    const b = await window.api.boot();
    cur.current = { state: b.state, audit: b.audit };
    setBoot(b);
    setState(b.state);
    setAudit(b.audit);
  }, []);
  // The main process sends only what changed: the rest keeps its reference, so the indexes (rules.ts) and the useMemo
  // that depend on it are not rebuilt.
  const merge = useCallback((r: Extract<CmdResult, { ok: true }>) => {
    // Nothing changed: not even a new render.
    const state = Object.keys(r.changes).length ? { ...cur.current.state, ...r.changes } : cur.current.state;
    const audit =
      r.audit || (r.newAudit.length ? [...r.newAudit, ...cur.current.audit].slice(0, AUDIT_KEEP) : cur.current.audit);
    cur.current = { state, audit };
    setState(state);
    setAudit(audit);
    return state;
  }, []);
  // When the day changes (the app was left open since yesterday) the main process runs the day's jobs (expiries,
  // backup) and sends what changed. Not on first open: boot has just arrived.
  const bootDay = useRef(today);
  useEffect(() => {
    if (today !== bootDay.current) {
      bootDay.current = '';
      window.api.dayCheck().then(
        (r) => {
          if (r.ok) merge(r);
        },
        () => refresh(),
      );
    }
  }, [today]);
  const { run, undo, undoMark, sync } = useCommands(cur, merge);
  return useMemo<StoreValue>(
    () => ({ state, audit, boot, today, tomorrow: addDays(today, 1), run, undo, undoMark, refresh, sync }),
    [state, audit, boot, today, run, undo, undoMark, refresh, sync],
  );
}
