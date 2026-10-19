import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, EyeOff, Maximize2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { IconButton, Popover } from '@wadeck-app/dsl-ui';

export interface WidgetToolbarProps {
  widgetTitle: string;
  moduleTitle: string;
  onRefresh: () => void;
  onExpand: () => void;
  onHide: () => void;
  // Where the module's own pages start; undefined when the module has no page to open.
  onOpenModule: (() => void) | undefined;
  // One step earlier / later among the widgets shown; undefined at the end of the list.
  onMoveEarlier: (() => void) | undefined;
  onMoveLater: (() => void) | undefined;
}

const ITEM =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-content transition-colors hover:bg-bg-secondary focus:bg-bg-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

// The actions of one widget, always visible: refresh, expand, and a menu. The icons carry a native tooltip (title) and a
// name for screen readers. The menu is a Popover (anchored to its button) holding plain buttons.
export function WidgetToolbar({ widgetTitle, moduleTitle, onRefresh, onExpand, onHide, onOpenModule, onMoveEarlier, onMoveLater }: WidgetToolbarProps): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  // Closes the menu, then runs the action.
  const choose = (action: (() => void) | undefined) => () => {
    setMenuOpen(false);
    action?.();
  };
  return (
    <div role="toolbar" aria-label={`${widgetTitle} actions`} className="flex items-center gap-0.5">
      <IconButton icon={<RefreshCw className="h-3.5 w-3.5" />} aria-label={`Refresh ${widgetTitle}`} title="Refresh" variant="ghost" size="icon-xs" onClick={onRefresh} />
      <IconButton icon={<Maximize2 className="h-3.5 w-3.5" />} aria-label={`Expand ${widgetTitle}`} title="Expand" variant="ghost" size="icon-xs" onClick={onExpand} />
      <Popover
        side="bottom"
        align="end"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="w-52 p-1"
        trigger={<IconButton icon={<MoreHorizontal className="h-3.5 w-3.5" />} aria-label={`More actions for ${widgetTitle}`} title="More" variant="ghost" size="icon-xs" />}
      >
        <div role="menu" aria-label={`${widgetTitle} menu`}>
          <button type="button" role="menuitem" className={ITEM} disabled={onOpenModule === undefined} onClick={choose(onOpenModule)}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {`Open ${moduleTitle}`}
          </button>
          <button type="button" role="menuitem" className={ITEM} disabled={onMoveEarlier === undefined} onClick={choose(onMoveEarlier)}>
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            Move earlier
          </button>
          <button type="button" role="menuitem" className={ITEM} disabled={onMoveLater === undefined} onClick={choose(onMoveLater)}>
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            Move later
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={choose(onHide)}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            Hide widget
          </button>
        </div>
      </Popover>
    </div>
  );
}
