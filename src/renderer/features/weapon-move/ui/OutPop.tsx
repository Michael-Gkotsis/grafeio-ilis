// The exit pop-up under the ΕΝΤΟΣ | ΕΚΤΟΣ switch of a weapon row.
// Purpose: `OutPop` draws the time, the note and one button per reason (a click, or the key 1-9, takes the weapon out);
//   the state, the save and the keys come from `useOutPop` (model/).
// Does NOT: hold state, or change the `weaponOut` command or the keys 1-9 (frozen contract, CLAUDE.md rule 3).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import type { ChangeEvent, FormEvent } from 'react';
import { RkName } from '../../../entities/person';
import { Button, GoLink } from '../../../shared/ui';
import { plainName } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { weaponBack } from '../../../../shared/ranks';
import { useOutPop, type OutPopProps } from '../model/useOutPop';
import { Key } from './Key';
import { Pop } from './Pop';
import { WhenRow } from './WhenRow';

/** Έξοδος ενός όπλου από τη γραμμή: ώρα (τώρα), παρατήρηση, και ένα κλικ στον λόγο. */
export function OutPop(props: OutPopProps) {
  // before any <small> / note: test/ux-names.test.ts reads the source text and wants a GoLink, never plain text
  const settingsLink = (
    <GoLink view="templates" params={{ tab: 'lists' }}>
      Ρυθμίσεις › Λίστες
    </GoLink>
  );
  const { p, anchor, onClose } = props;
  const { lists, reasons, day, setDay, time, setTime, note, setNote, other, setOther, setHover, go, tip } =
    useOutPop(props);
  return (
    <Pop anchor={anchor} onClose={onClose} label={'Έξοδος όπλου ' + p.weapon}>
      <div className="wpop__head">
        <b>Έξοδος όπλου {p.weapon}</b>
        <small>
          <RkName p={p} fn={plainName} keep={true} />
        </small>
      </div>
      <WhenRow label="Ώρα εξόδου" day={day} time={time} setDay={setDay} setTime={setTime} />
      <input
        className="ui-input wpop__note"
        placeholder="Παρατήρηση (αν θες), π.χ. πεδίο βολής"
        value={note}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
        aria-label="Παρατήρηση"
      />
      <div className="wpop__lbl">Γιατί βγαίνει; Πάτα τον λόγο ή τον αριθμό του:</div>
      <div className="wpop__reasons">
        {reasons.map((r, i) => (
          <button
            key={r}
            type="button"
            className="wpop__reason"
            disabled={!normTime(time)}
            onMouseEnter={() => setHover(r)}
            onMouseLeave={() => setHover('')}
            onFocus={() => setHover(r)}
            onBlur={() => setHover('')}
            onClick={() => go(r)}
          >
            <Key n={i} />
            {r}
          </button>
        ))}
      </div>
      <form
        className="wpop__other"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          go(other);
        }}
      >
        <input
          className="ui-input"
          placeholder="Άλλος λόγος…"
          value={other}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setOther(e.target.value)}
          aria-label="Άλλος λόγος"
        />
        <Button
          size="sm"
          type="submit"
          disabled={!other.trim() || !normTime(time)}
          why={!normTime(time) ? 'Λείπει: Ώρα' : 'Γράψε πρώτα τον λόγο'}
        >
          Έξοδος
        </Button>
      </form>
      <p className="wpop__foot">
        {tip ? (
          <span>
            Όταν μπει πάλι: <b>{weaponBack(tip, lists)}</b>
          </span>
        ) : (
          <>Κάθε λόγος έχει τον λόγο εισαγωγής του ({settingsLink} › Λόγοι εξόδου όπλου).</>
        )}
      </p>
    </Pop>
  );
}
