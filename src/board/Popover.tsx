// Small controlled popover on @floating-ui/react — the board's pickers
// (status, person, date) all anchor to a table cell, often near the viewport
// edge or inside the horizontal scroll container, which is exactly what
// floating-ui's flip/shift/autoUpdate handle and a hand-rolled absolute div
// does not (spec §4).

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode, Ref } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The cell content; it gets the anchor ref and the toggle handlers. */
  trigger: ReactElement;
  children: ReactNode;
  /** Match the popover width to the anchor cell (person/date pickers). */
  matchWidth?: boolean;
}

export default function Popover({ open, onOpenChange, trigger, children, matchWidth }: Props) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: 'dialog' }),
  ]);

  if (!isValidElement(trigger)) return null;
  const anchor = cloneElement(
    trigger as ReactElement<{ ref?: Ref<Element> }>,
    { ref: refs.setReference, ...getReferenceProps() },
  );

  return (
    <>
      {anchor}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              className="board-popover"
              style={{
                ...floatingStyles,
                ...(matchWidth && refs.reference.current instanceof HTMLElement
                  ? { minWidth: refs.reference.current.offsetWidth }
                  : {}),
              }}
              {...getFloatingProps()}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
