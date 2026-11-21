import React, { useEffect, useState } from 'react';
import { IconButton, Popover } from '@wadeck-app/dsl-ui';

export interface TopBarPopoverProps {
  icon: React.ReactNode;
  // The accessible name of the button; also its tooltip unless `title` says more.
  label: string;
  // The tooltip while the popover is closed (the state of the thing, not just its name). Never shown while the popover is open.
  title?: string;
  children: React.ReactNode;
}

const TRIGGER_ATTRIBUTE = 'data-top-bar-popover-trigger';
// Said by the popover that opens (its label, unique in the bar): the others of the bar close (one panel at a time, also when the focus got there by the keyboard).
const OPENED_EVENT = 'app-core:top-bar-popover-opened';

// Closing a popover returns the focus to its button (the design system does that on purpose). When the click that closed it was on the
// button of another popover of the bar, that focus lands outside the second popover, which has just opened, and its focus-outside rule
// closes it at once: the user saw the second popover open and shut. A close caused by the focus sitting on a popover button of the bar
// is the doing of that button (it opens or closes its own popover), not a request to close this one.
function focusIsOnAnotherBarButton(self: string): boolean {
  const active = document.activeElement;
  const owner = active instanceof HTMLElement ? active.getAttribute(TRIGGER_ATTRIBUTE) : null;
  return owner !== null && owner !== self;
}

// The icon button of the top bar that opens a popover. One tooltip at a time: the native tooltip of the button is removed while the
// popover is open (it used to sit on top of the panel it announces).
export function TopBarPopover({ icon, label, title = label, children }: TopBarPopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const onOpenChange = (next: boolean): void => {
    if (!next && focusIsOnAnotherBarButton(label)) {
      return;
    }
    setOpen(next);
    if (next) {
      window.dispatchEvent(new CustomEvent(OPENED_EVENT, { detail: label }));
    }
  };
  useEffect(() => {
    const onOtherOpened = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== label) {
        setOpen(false);
      }
    };
    window.addEventListener(OPENED_EVENT, onOtherOpened);
    return () => window.removeEventListener(OPENED_EVENT, onOtherOpened);
  }, [label]);
  return (
    <Popover
      side="bottom"
      align="end"
      open={open}
      onOpenChange={onOpenChange}
      trigger={<IconButton icon={icon} aria-label={label} title={open ? undefined : title} variant="ghost" size="icon-sm" {...{ [TRIGGER_ATTRIBUTE]: label }} />}
    >
      {children}
    </Popover>
  );
}
