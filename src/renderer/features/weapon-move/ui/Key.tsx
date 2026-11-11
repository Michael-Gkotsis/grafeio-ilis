// The number next to a weapon reason (1-9): the key that picks it.
// Purpose: `Key` draws the small `kbd` badge; the keys themselves are handled by the dialogs and pop-ups that show it.
// Does NOT: listen to keys.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts; the Οπλισμός bulk bar uses it too.
// Covering test: test/weapons.test.ts.

/** Props of `Key`. */
export interface KeyProps {
  /** Position of the reason in its list, from 0; nothing is drawn from the tenth on (there is no key 10). */
  n: number;
}

/** The key badge «1»…«9» in front of a reason. */
export const Key = ({ n }: KeyProps) =>
  n < 9 ? (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: markup kept as it was; a kbd is not focusable
    <kbd className="wkey" aria-hidden="true">
      {n + 1}
    </kbd>
  ) : null;
