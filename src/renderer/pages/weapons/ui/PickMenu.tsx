// The small pick menu under a button: «Ξανά οι ίδιοι», «Από υπηρεσία».
// Purpose: `PickMenu`: a button that opens a pop-up list; one click on an item ticks those people.
// Does NOT: know what an item does (`pick` does) or tick anybody.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6).
// Covering test: test/screens-main.test.ts.
import { Fragment, useCallback, useRef, useState } from 'react';
import { Pop } from '../../../features/weapon-move';
import { Button } from '../../../shared/ui';

/** One line of the menu. */
export interface PickItem {
  key: string;
  text: string;
  sub?: string;
  pick: () => void;
}

/** Props of `PickMenu`. */
export interface PickMenuProps {
  label: string;
  /** Tooltip of the button. */
  tip: string;
  items: PickItem[];
  /** Text when `items` is empty. */
  empty: string;
}

/** A button with a pop-up list of choices: a small window under the button, one click ticks. */
export function PickMenu({ label, tip, items, empty }: PickMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Fragment>
      <span ref={ref}>
        <Button
          size="sm"
          variant="outline"
          aria-haspopup="true"
          aria-expanded={open}
          data-tip={tip}
          onClick={() => setOpen((o) => !o)}
        >
          {label} ▾
        </Button>
      </span>
      {open && (
        <Pop anchor={ref} onClose={close} label={label}>
          <ul className="wmenu">
            {items.length ? (
              items.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    className="wmenu__item"
                    onClick={() => {
                      close();
                      it.pick();
                    }}
                  >
                    <b>{it.text}</b>
                    <span className="muted">{it.sub}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="muted">{empty}</li>
            )}
          </ul>
        </Pop>
      )}
    </Fragment>
  );
}
