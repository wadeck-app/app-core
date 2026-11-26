import React, { useState } from 'react';
import { IconButton, Popover } from '@wadeck-app/dsl-ui';

export interface TopBarPopoverProps {
  icon: React.ReactNode;
  // The accessible name of the button; also its tooltip unless `title` says more.
  label: string;
  // The tooltip while the popover is closed (the state of the thing, not just its name). Never shown while the popover is open.
  title?: string;
  children: React.ReactNode;
}

// The icon button of the top bar that opens a popover. One tooltip at a time: none while the popover is open (it used to sit on top of
// the panel it announces). The title is emptied, not removed: an IconButton without a title wraps itself in its own tooltip, which
// would replace the button element (and bring a tooltip back) at every opening.
export function TopBarPopover({ icon, label, title = label, children }: TopBarPopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover side="bottom" align="end" open={open} onOpenChange={setOpen} trigger={<IconButton icon={icon} aria-label={label} title={open ? '' : title} variant="ghost" size="icon-sm" />}>
      {children}
    </Popover>
  );
}
