// The small window under the ΕΝΤΟΣ | ΕΚΤΟΣ switch.
// Purpose: `Pop` puts its children in a portal under the anchor (above it when there is no room), keeps it inside the
//   viewport, focuses `[data-autofocus]` or the window itself, and closes on Esc or a click outside.
// Does NOT: know what is inside; the exit and entry pop-ups fill it.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b); the Οπλισμός bulk bar uses it too.
// Covering test: test/weapons.test.ts.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEscape } from '../../../shared/ui';

/** Props of `Pop`. */
export interface PopProps {
  /** The element the window opens under. */
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
  children?: ReactNode;
  /** The `aria-label` of the window. */
  label?: string;
}

/** Μικρό παράθυρο κάτω από τον διακόπτη (ή από πάνω, αν δεν χωρά)· κλείνει με Esc ή κλικ έξω. */
export function Pop({ anchor, onClose, children, label }: PopProps) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, number> | null>(null);
  useEscape(onClose);
  useLayoutEffect(() => {
    const upd = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect(),
        vh = window.innerHeight,
        vw = document.documentElement.clientWidth,
        h = box.current?.offsetHeight || 300;
      const width = Math.min(380, vw - 16),
        left = Math.max(8, Math.min(r.left, vw - width - 8));
      setPos(
        vh - r.bottom - 12 < h && r.top - 12 > vh - r.bottom
          ? { left, width, bottom: vh - r.top + 6 }
          : { left, width, top: r.bottom + 6 },
      );
    };
    upd();
    const t = setTimeout(upd);
    window.addEventListener('scroll', upd, true);
    window.addEventListener('resize', upd);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', upd, true);
      window.removeEventListener('resize', upd);
    };
  }, []);
  useEffect(() => {
    // η λίστα μιας ώρας ή μέρας (select.ts) είναι έξω από το παράθυρο αλλά ανήκει σε αυτό
    const out = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!box.current?.contains(t) && !anchor.current?.contains(t) && !t.closest?.('.ui-dd__pop')) onClose();
    };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [onClose]);
  useEffect(() => {
    ((box.current?.querySelector('[data-autofocus]') || box.current) as HTMLElement | null)?.focus();
  }, []);
  return createPortal(
    <div
      ref={box}
      className="wpop"
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={pos || { left: -9999, top: 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
