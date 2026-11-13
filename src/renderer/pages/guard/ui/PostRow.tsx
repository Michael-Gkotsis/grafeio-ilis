// One seat of the posts table: the seat with its hours, who is in it (and «Γιατί»), the count, and the buttons.
// Purpose: `PostRow`, a line of the «Θέσεις» tab: locked (read only), empty (with the picker), in swap mode, or filled.
// Does NOT: place anybody (`onAssign`, `onNext`, `onBlocked` do) or decide the warning (`ruleWarn` comes in).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); a plain function component
//   (not memo) as it always was, so the render count is unchanged. @decision Michael 20/10: the hours of a shift are
//   one under the other, as on the form; Michael 4/11: a second member of a pair does not repeat the hours.
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts.
import { useState, type ReactNode } from 'react';
import { dutyBlock } from '../../../../shared/rules';
import { fullName, type Person, type Post, type Settings, type Status } from '../../../../shared/domain';
import { PersonPicker, RkName, rkFull } from '../../../entities/person';
import { cx } from '../../../shared/lib/cx';
import { Badge, Button, Icon } from '../../../shared/ui';

/** Props of {@link PostRow}. */
export interface PostRowProps {
  x: Post;
  /** The short name of the first member of the pair, when this is the second (its hours are the same). */
  same: string;
  pid: number | null | undefined;
  date: string;
  statuses: Status[];
  lists: Settings['lists'];
  /** «Υπηρεσίες αυτού του είδους / σύνολο». */
  duty: string;
  ruleWarn: string | null | undefined | false;
  why: string;
  onAssign: (k: string, pid: number | null, instead?: number, reason?: string, move?: string) => void;
  onNext: (k: string) => void;
  unavailable: (p: Person) => string | null | undefined;
  onBlocked: (k: string, p: Person, why: string) => void;
  pm: Map<number, Person>;
  locked: boolean;
  onOpen: (pid: number) => void;
  hint: (p: Person) => string | null | undefined | false;
  pickFrom: Person[];
}

// Hours in a narrow form («14-16 · 22-00») when they are whole hours; else as they are.
const hrs = (x: Post) =>
  x.slots
    ? x.slots.map((t, i, all) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the hours of a seat have no identity: position is the key, as before
        <span key={i} className="nw">
          {t.replace(/:00/g, '') + (i < all.length - 1 ? ' ·' : '')}
        </span>
      ))
    : x.hours;

function head(x: Post, same: string) {
  if (same)
    return (
      <div className="post__pos">
        <b>{x.short}</b>
        <span className="post__hrs">
          ίδιες ώρες με {/^\d+η/.test(same) ? 'την' : 'τον'} {same.replace('ος', 'ο')}
        </span>
      </div>
    );
  // biome-ignore lint/complexity/useOptionalChain: kept as it was
  if (x.slots && x.slots.length)
    return (
      <div className="post__pos is-slots">
        <b>{x.short}</b>
        <span className="post__slots">
          {x.slots.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the hours of a seat have no identity: position is the key, as before
            <span key={i}>{t}</span>
          ))}
        </span>
      </div>
    );
  return (
    <div className="post__pos">
      <b>{x.short}</b>
      <span className="post__hrs">{hrs(x)}</span>
    </div>
  );
}

// The line of a past (locked) day: the name only opens the card.
function lockedRow(
  p: Person | null,
  hd: ReactNode,
  kenh: ReactNode,
  r: ReactNode,
  duty: string,
  onOpen: (pid: number) => void,
) {
  return (
    <li className={cx('post', !p && 'is-empty')}>
      {hd}
      {p ? (
        <span className="post__who">
          <button
            type="button"
            className="post__name linkish"
            data-tip={rkFull(p) + ' · άνοιξε την καρτέλα'}
            onClick={() => onOpen(p.id)}
          >
            <RkName p={p} fn={fullName} />
          </button>
          {r && <Badge tone="bad">⚠ {r}</Badge>}
        </span>
      ) : (
        kenh
      )}
      <span className="duty">{duty}</span>
      <span />
    </li>
  );
}

/** The line. */
export function PostRow(props: PostRowProps) {
  const { x, same, pid, date, statuses, lists, duty, ruleWarn, why, onAssign, onNext, unavailable, onBlocked } = props;
  const { pm, locked, onOpen, hint, pickFrom } = props;
  const [swap, setSwap] = useState(false);
  const p = pid && pm.get(pid);
  const r = pid && (dutyBlock(statuses, date, pid, x, lists) || ruleWarn);
  const hd = head(x, same);
  const kenh = (
    <span className="post__who">
      <span className="kenh-tag">Κενή</span>
    </span>
  );
  if (locked) return lockedRow(p || null, hd, kenh, r, duty, onOpen);
  if (p && swap)
    return (
      <li className="post is-swap">
        {hd}
        <div className="post__wide">
          <div style={{ flex: 1, minWidth: 0 }}>
            <PersonPicker
              id={'gs-' + x.k}
              autoFocus={true}
              placeholder={'Αντί για ' + rkFull(p) + '… (ή ⇄ ανταλλαγή με άλλη θέση)'}
              date={date}
              people={pickFrom}
              hint={hint}
              unavailable={(q: Person) => {
                const u = unavailable(q);
                // biome-ignore lint/complexity/useOptionalChain: kept as it was: returns the value itself when falsy
                return u && u.startsWith('Ήδη ') ? '⇄ Ανταλλαγή: ' + u.slice(5) : u;
              }}
              onBlocked={(q: Person, w: string) => {
                setSwap(false);
                onBlocked(x.k, q, w);
              }}
              onChange={(id: number) => {
                setSwap(false);
                onAssign(x.k, id, p.id);
              }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSwap(false)}>
            Άκυρο
          </Button>
        </div>
      </li>
    );
  if (!p)
    return (
      <li className="post is-empty">
        {hd}
        {kenh}
        <div className="post__pick">
          <PersonPicker
            id={'gp-' + x.k}
            placeholder="Διάλεξε άτομο…"
            date={date}
            people={pickFrom}
            hint={hint}
            unavailable={unavailable}
            onBlocked={(q: Person, w: string) => onBlocked(x.k, q, w)}
            onChange={(id: number) => onAssign(x.k, id)}
          />
        </div>
      </li>
    );
  return (
    <li className="post">
      {hd}
      <span className="post__who">
        <span className="post__name">
          <button
            type="button"
            className="linkish"
            data-tip={rkFull(p) + ' · άνοιξε την καρτέλα'}
            onClick={() => onOpen(p.id)}
          >
            <RkName p={p} fn={fullName} />
          </button>
          {r && (
            <>
              {' '}
              <Badge tone="warn" className="tag" data-tip="Πέρασε παρά τον κανόνα">
                ⚠ {r}
              </Badge>
            </>
          )}
        </span>
        {why && (
          <small className="post__why" data-tip="Γιατί αυτός; Η σειρά δικαιοσύνης είναι στο κουμπί «Κανόνες»">
            Γιατί: {why}
          </small>
        )}
      </span>
      <span className="duty" data-tip="Υπηρεσίες αυτού του είδους / σύνολο" data-tip-side="left">
        {duty}
      </span>
      <span className="post__acts">
        <Button
          variant="ghost"
          size="sm"
          data-tip="Βάλε άλλον στη θέση του (π.χ. αλλαγή τελευταίας στιγμής)"
          data-tip-side="left"
          onClick={() => setSwap(true)}
        >
          Αλλαγή
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-tip="Βάλε τον επόμενο στη σειρά δικαιοσύνης, με τους ίδιους κανόνες. Ξαναπάτα για τον μεθεπόμενο."
          data-tip-side="left"
          onClick={() => onNext(x.k)}
        >
          Επόμενος
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Αφαίρεση από τη θέση"
          data-tip="Αφαίρεση από τη θέση"
          data-tip-side="left"
          onClick={() => onAssign(x.k, null)}
        >
          {Icon.x}
        </Button>
      </span>
    </li>
  );
}
