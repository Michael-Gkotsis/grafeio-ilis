// The «Για» field of a note: the soldiers and cadre it is bound to, and the pickers to add more.
// Purpose: `WhoField` shows one chip per bound person (✕ removes it) and adds people through a picker and a select.
// Does NOT: save anything; the caller owns the draft.
// Owner layer: renderer/features/note-compose. Why: moved verbatim from screens/notes.ts (Phase 5.3b).
// Covering test: test/notes.test.ts.
import { useMemo } from 'react';
import { orderedCadre } from '../../../../shared/cadre';
import { rankTxt } from '../../../../shared/ranks';
import { personMap } from '../../../../shared/rules';
import { PersonPicker } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { useStore } from '../../../shared/model';
import { Select } from '../../../shared/ui';
import type { Draft } from '../model/useNoteDraft';

/** Props of `WhoField`. `ns` prefixes the ids so the page and the person sheet do not clash. */
export interface WhoFieldProps {
  d: Draft;
  set: (x: Partial<Draft>) => void;
  ns?: string;
  compact?: boolean;
}

/** Για ποιους: κανένας (γενική) ή όσοι στρατιώτες και στελέχη θες· ο καθένας φεύγει με το ✕. */
export function WhoField({ d, set, ns = 'nt', compact }: WhoFieldProps) {
  const { state } = useStore();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const cm = useMemo(() => new Map(state.cadreList.map((c) => [c.id, c])), [state.cadreList]);
  const free = useMemo(() => state.people.filter((p) => !d.pids.includes(p.id)), [state.people, d.pids]);
  const cadre = useMemo(
    () => orderedCadre(state.cadreList).filter((c) => c.active && !d.cids.includes(c.id)),
    [state.cadreList, d.cids],
  );
  const chip = (key: string, label: string, off: boolean, rm: () => void) => (
    <span key={key} className={cx('picker__chip', off && 'is-off')}>
      {label}
      {off ? ' (εκτός δύναμης)' : ''}
      <button type="button" aria-label={'Αφαίρεση ' + label} onClick={rm}>
        ✕
      </button>
    </span>
  );
  return (
    <div className="note-who">
      <span className="note-lbl">Για</span>
      <div className="note-pick note-pick--multi">
        <div className="picker__chips">
          {d.pids.length + d.cids.length === 0 && <span className="muted">Γενική σημείωση (κανένας συγκεκριμένα)</span>}
          {d.pids.map((id) => {
            const p = pm.get(id);
            return chip('p' + id, p ? p.last + ' ' + p.first : 'Άγνωστος στρατιώτης', !p?.active, () =>
              set({ pids: d.pids.filter((x) => x !== id) }),
            );
          })}
          {d.cids.map((id) => {
            const c = cm.get(id);
            return chip('c' + id, c ? rankTxt(c) + ' ' + c.last + ' ' + c.first : 'Άγνωστο στέλεχος', !c?.active, () =>
              set({ cids: d.cids.filter((x) => x !== id) }),
            );
          })}
        </div>
        <div className="note-pick__add">
          <PersonPicker
            id={ns + '-pid'}
            placeholder={compact ? '+ Στρατιώτης…' : '+ Στρατιώτης: επώνυμο, όνομα ή ΑΣΜ…'}
            people={free}
            onChange={(pid) => set({ pids: [...d.pids, pid] })}
          />
          <Select
            id={ns + '-cid'}
            className="ui-input"
            aria-label="Πρόσθεσε στέλεχος"
            value=""
            onChange={(e) => {
              if (e.target.value) set({ cids: [...d.cids, e.target.value] });
            }}
          >
            <option value="">+ Στέλεχος…</option>
            {cadre.map((c) => (
              <option key={c.id} value={c.id}>
                {rankTxt(c)} {c.last} {c.first}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
