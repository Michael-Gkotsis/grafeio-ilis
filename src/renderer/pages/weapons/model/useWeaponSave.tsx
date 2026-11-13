// Fourth part of the state of the «Οπλισμός» screen: writing weapons.
// Purpose: `useWeaponSave`: `save` (one `setWeapons` command and its toast with «Αναίρεση»), `commit` (a typed value of
//   a row) and `paste` (a column pasted from Excel), all stable callbacks so the `memo` rows hold.
// Does NOT: decide the messages and warnings (model/view.ts) or draw the «already in use» question.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the dependency lists of
//   the three `useCallback` are unchanged.
// Covering test: test/screens-main.test.ts, test/weapons.test.ts, test/weapons-page-view.test.ts.
import { useCallback } from 'react';
import type { WeaponChange } from '../../../../shared/commands';
import type { Person } from '../../../../shared/domain';
import { siOf } from '../../../../shared/si';
import { normWeapon, sameWeapon } from '../../../../shared/weapons';
import type { WeaponBase } from './useWeaponBase';
import type { WeaponList } from './useWeaponList';
import { commitRack, commitWpos, pasteSeatsPlan, pasteWeaponsPlan, saveMessage, type WeaponField } from './view';

/** Options of a save: `msg` replaces «Χ: όπλο 123»; `warn` is the warning under it; `what` names the action in the log. */
export interface SaveOptions {
  warn?: string;
  what?: string;
  msg?: string;
}

/** Writes weapon changes; resolves when the toast is shown. */
export type SaveWeapons = (changes: WeaponChange[], o?: SaveOptions) => Promise<void>;

/** The three ways to write a weapon, as stable callbacks. */
export function useWeaponSave(base: WeaponBase, list: WeaponList) {
  const { state, run, toast, undoMark, setReset, setAsk, info, lists } = base;
  const { rows } = list;
  const save: SaveWeapons = useCallback(
    async (changes, o = {}) => {
      if ((await run({ t: 'setWeapons', changes, what: o.what }, false)) === null) {
        setReset((n) => n + 1);
        return;
      }
      const msg = o.msg || saveMessage(changes, state.people);
      toast({
        text: (
          <span>
            {msg}
            {o.warn && (
              <>
                <br />
                <b>Προσοχή:</b> {o.warn}
              </>
            )}
          </span>
        ),
        actions: [undoMark()],
      });
    },
    [run, toast, undoMark, state.people],
  );
  const commit = useCallback(
    (p: Person, raw: string, f: WeaponField = 'weapon') => {
      // Rack + position pair: warns only when both are the same in another person (in strength).
      if (f === 'wpos' || f === 'rack') {
        const plan = f === 'wpos' ? commitWpos(info, p, raw) : commitRack(info, p, raw);
        save(plan.changes, { warn: plan.warn });
        return;
      }
      const w = normWeapon(raw);
      const others = w ? sameWeapon(info, p, w) : [];
      if (others.length) {
        setAsk({ p, w, others });
        return;
      }
      save([{ pid: p.id, weapon: w }], {
        warn: w && info.unarmed.has(p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ').' : undefined,
      });
    },
    [info, save, lists],
  );
  // A column pasted from Excel: one number per row, from this row down, in the order shown.
  const paste = useCallback(
    (i: number, vals: string[], f: WeaponField = 'weapon') => {
      const plan = f !== 'weapon' ? pasteSeatsPlan(vals, rows, i, f) : pasteWeaponsPlan(vals, rows, i, state.people);
      setReset((n) => n + 1);
      save(plan.changes, { what: plan.what, msg: plan.msg, warn: plan.warn });
    },
    [rows, state.people, save],
  );
  return { save, commit, paste };
}
