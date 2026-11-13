// One row of the «Όπλα» table.
// Purpose: `WRow`, a `memo` component: the checkbox, the person, the type, the three inputs, the weapon state and the
//   remarks. It redraws only when something of its own or the weapon info (`info`) changes, not on each key of the search.
// Does NOT: save or select anything (the callbacks do) or decide the remarks (model/view.ts `weaponNotes`).
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the `memo` boundary and
//   the props are unchanged.
// Covering test: test/screens-main.test.ts, test/perf.test.ts.
import { memo, type ChangeEvent, type CSSProperties } from 'react';
import { WeaponState } from '../../../features/weapon-move';
import { rkShort } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Button } from '../../../shared/ui';
import { fullName, type Person, type Settings, type Status } from '../../../../shared/domain';
import { rankTxt } from '../../../../shared/ranks';
import { siOf, siShort } from '../../../../shared/si';
import { weaponKey, type WeaponInfo } from '../../../../shared/weapons';
import { GRID } from '../model/layout';
import type { SaveWeapons } from '../model/useWeaponSave';
import type { WeaponField } from '../model/view';
import { weaponNoteBadges } from './weaponNoteBadges';
import { TypeSelect } from './TypeSelect';
import { WeaponInput } from './WeaponInput';

/** Props of `WRow`. Every callback is stable (`useCallback` in the hook), so the `memo` can hold. */
export interface WRowProps {
  p: Person;
  i: number;
  /** The absolute-position style of the virtual list (the same object on every render). */
  style: CSSProperties;
  selected: boolean;
  info: WeaponInfo;
  pm: Map<number, Person>;
  types: string[];
  lists: Settings['lists'];
  statuses: Status[];
  date: string;
  reset: number;
  onToggle: (id: number, shift?: boolean) => void;
  onOpen: (id: number) => void;
  save: SaveWeapons;
  commit: (p: Person, raw: string, f?: WeaponField) => void;
  paste: (i: number, vals: string[], f?: WeaponField) => void;
}

/** One row of the table. */
export const WRow = memo(function WRow({
  p,
  i,
  style,
  selected,
  info,
  pm,
  types,
  lists,
  statuses,
  date,
  reset,
  onToggle,
  onOpen,
  save,
  commit,
  paste,
}: WRowProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: frozen DOM, a div with an ARIA role as before
    // biome-ignore lint/a11y/useFocusableInteractive: frozen DOM, a div with role="row" as before
    <div
      className={cx('ptable__row', i % 2 === 1 && 'is-odd', info.moves.has(p.id) && 'is-wout')}
      style={{ ...style, gridTemplateColumns: GRID, cursor: 'default' }}
      role="row"
    >
      <span>
        <input
          type="checkbox"
          className="ui-check"
          aria-label={'Επιλογή ' + fullName(p)}
          checked={selected}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onToggle(p.id, !!(e.nativeEvent as MouseEvent).shiftKey)}
        />
      </span>
      <span className="num muted">{i + 1}</span>
      <span>{rankTxt(p)}</span>
      <span>
        <button type="button" className="linkish" onClick={() => onOpen(p.id)} data-tip="Καρτέλα οπλίτη">
          <b>{p.last}</b>
        </button>
      </span>
      <span>{p.first}</span>
      <span className="num">{p.asm}</span>
      <span>{p.room ?? ''}</span>
      <span data-tip={p.si ? siOf(p, lists).text : undefined}>{p.si ? siShort(siOf(p, lists).text) : ''}</span>
      <span className="weapon-cell">
        <TypeSelect p={p} types={types} onPick={(q: Person, t: string) => save([{ pid: q.id, wtype: t }])} />
      </span>
      <span className="weapon-cell">
        <WeaponInput p={p} i={i} reset={reset} onCommit={commit} onPaste={paste} />
      </span>
      <span className="weapon-cell">
        <WeaponState p={p} info={info} pm={pm} />
      </span>
      <span className="weapon-cell">
        <WeaponInput p={p} i={i} f="rack" reset={reset} onCommit={commit} onPaste={paste} />
      </span>
      <span className="weapon-cell">
        <WeaponInput p={p} i={i} f="wpos" reset={reset} onCommit={commit} onPaste={paste} />
      </span>
      <span className="badges weapon-notes">
        {weaponNoteBadges(p, info, lists, pm, statuses, date)}
        {!p.active && weaponKey(p.weapon) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => save([{ pid: p.id, weapon: '' }], { msg: rkShort(p) + ': παρέδωσε το όπλο ' + p.weapon })}
            data-tip={'Παρέδωσε το όπλο ' + p.weapon + ': σβήνεται ο αριθμός'}
          >
            Παρέδωσε
          </Button>
        )}
      </span>
    </div>
  );
});
