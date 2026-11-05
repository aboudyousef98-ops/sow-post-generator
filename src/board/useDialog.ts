// Make an overlay behave like a dialog for the keyboard.
//
// Found 2026-11-05 by tabbing through "Ask the board" with it open: focus
// walked straight out of the panel and into the board underneath, landing on
// the table's select-all checkbox. A keyboard user can drive controls they
// cannot see, behind a dimmed overlay, with no way back.
//
// This is the app's long-standing modal shape — `.modal-overlay` plus
// click-outside, no dialog semantics anywhere — so the fix is written as a
// hook rather than baked into one component: the two panels added this session
// use it now, and the other five can adopt it in one line each without any of
// them being rewritten.
//
// What it provides, which is the minimum a dialog owes a keyboard:
//   - focus moves INTO the dialog on open, and back to the opener on close;
//   - Tab and Shift+Tab cycle within it instead of escaping;
//   - Escape closes it, like every other dialog the team uses.

import { useEffect, type RefObject } from 'react';

/** Tabbable things, in DOM order. Disabled controls are not tabbable. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Whoever opened this gets focus back, so closing does not dump the user
    // at the top of the document.
    const opener = document.activeElement as HTMLElement | null;

    /**
     * Deliberately NOT a layout check. `offsetParent` is null for everything
     * in jsdom and for anything under a position:fixed ancestor — which this
     * overlay is — so filtering on it empties the list and the trap silently
     * stops trapping. The selector already excludes `disabled`; these two
     * attributes are the rest of "not reachable", and React unmounts the
     * controls that are merely not on screen.
     */
    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
      );

    // The first control, not the panel itself: landing on a search box or the
    // first rule is what someone opening it wants to do next.
    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        // Nothing to land on — keep focus on the panel rather than letting it
        // fall through to the page behind.
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Wrap at both ends, and catch the case where focus has already escaped
      // (a click on the backdrop, say) by pulling it back in.
      if (!node.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only if focus is still inside the dialog being torn down — otherwise
      // the user has already clicked somewhere deliberate.
      if (node.contains(document.activeElement)) opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
