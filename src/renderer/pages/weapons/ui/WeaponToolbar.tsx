// The search line of the «Όπλα» tab and the pick bar under it.
// Purpose: `weaponToolbar(s)` (search, platoon chips, room, «Τύπος σε όσους δεν έχουν») and `pickBar(s)` (the scan box,
//   «Ξανά οι ίδιοι», «Από υπηρεσία» and the message of the last pick).
// Does NOT: hold state (`s` comes from model/useWeapons.ts). Plain functions called as `{weaponToolbar(s)}`, not
//   components, so React renders the same elements as before.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import type { ChangeEvent, KeyboardEvent } from 'react';
import { cx } from '../../../shared/lib/cx';
import { Segmented, Select } from '../../../shared/ui';
import { dm, dow } from '../../../../shared/dates';
import { unitOf } from '../../../../shared/domain';
import type { WeaponsApi } from '../model/useWeapons';
import { PickMenu } from './PickMenu';

/** Search, platoon, room and «Τύπος σε όσους δεν έχουν». */
export function weaponToolbar(s: WeaponsApi) {
  const { q, setQ, unit, room, nav, state, UNITS, rooms, noType, types, typeAll } = s;
  return (
    <div className="toolbar">
      <input
        type="search"
        className="ui-input"
        aria-label="Αναζήτηση"
        placeholder="Όνομα, ΑΣΜ, θάλαμος ή αριθμός όπλου (χωρίς τόνους) · Ctrl+F"
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
      />
      <Segmented
        small={true}
        value={unit}
        onChange={(u: string) =>
          nav.set({
            unit: u,
            room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room,
          })
        }
        items={UNITS}
      />
      <Select
        className="ui-select"
        aria-label="Θάλαμος"
        value={room == null ? '' : String(room)}
        onChange={(e) => {
          const r = e.target.value ? +e.target.value : null;
          nav.set({
            room: r,
            unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit,
          });
        }}
      >
        <option value="">Όλοι οι θάλαμοι</option>
        {rooms.map(([r, n]) => (
          <option key={r} value={String(r)}>
            Θάλαμος {r} · {n}
          </option>
        ))}
      </Select>
      {noType.length > 0 && (
        <Select
          className="ui-select"
          aria-label="Τύπος σε όσους δεν έχουν"
          value=""
          onChange={(e) => typeAll(e.target.value)}
          data-tip="Βάζει τον τύπο σε όσους φαίνονται και έχουν αριθμό όπλου αλλά όχι τύπο. Νέοι τύποι στις Ρυθμίσεις › Λίστες."
        >
          <option value="">Τύπος σε {noType.length} χωρίς τύπο…</option>
          {types.map((t: string) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

/** The scan box, the two pick menus and the message of the last pick. */
export function pickBar(s: WeaponsApi) {
  const { scanRef, scan, setScan, doScan, redo, duties, byIds, tick, date, today, pickMsg } = s;
  return (
    <div className="wpick">
      <input
        ref={scanRef}
        type="text"
        className="ui-input wpick__scan"
        aria-label="Επιλογή με θέση, αριθμό όπλου ή ΑΣΜ"
        placeholder="Γράψε θέση (Ε 23), αριθμό όπλου ή ΑΣΜ και Enter"
        value={scan}
        spellCheck="false"
        autoComplete="off"
        onChange={(e: ChangeEvent<HTMLInputElement>) => setScan(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doScan();
          } else if (e.key === 'Escape' && scan) {
            e.stopPropagation();
            setScan('');
          }
        }}
        data-tip="Τσεκάρει τον άνθρωπο από όλη τη δύναμη (όχι μόνο όσους φαίνονται). Πολλά Enter στη σειρά για πολλούς."
      />
      <PickMenu
        label="Ξανά οι ίδιοι"
        tip="Οι τελευταίες ομαδικές έξοδοι: τσεκάρει όσους είναι ακόμα σε δύναμη με όπλο και μέσα στον οπλοβαστό"
        empty="Δεν έχει γίνει ακόμα ομαδική έξοδος."
        items={redo.map((g) => ({
          key: g.reason + g.day + g.time,
          text: g.reason + ' ' + dm(g.day) + ' ' + g.time,
          sub: g.pids.length + ' άτομα',
          pick: () => tick(byIds(g.pids), g.reason + ' ' + dm(g.day) + ' ' + g.time),
        }))}
      />
      <PickMenu
        label="Από υπηρεσία"
        tip={
          'Οι υπηρεσίες ' + (date === today ? 'σήμερα' : dow(date) + ' ' + dm(date)) + ': τσεκάρει τους ανθρώπους τους'
        }
        empty={'Δεν υπάρχουν υπηρεσίες ' + (date === today ? 'σήμερα' : dm(date)) + '.'}
        items={duties.map((d) => ({
          key: d.block,
          text: d.name,
          sub: d.pids.length + (d.armed ? ' · ένοπλη' : ''),
          pick: () => tick(byIds(d.pids), d.name),
        }))}
      />
      {pickMsg && (
        <span className={cx('wpick__msg', 'wpick__msg--' + pickMsg.tone)} role="status">
          {pickMsg.text}
        </span>
      )}
    </div>
  );
}
