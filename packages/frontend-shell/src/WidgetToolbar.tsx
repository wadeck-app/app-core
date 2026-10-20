import React from 'react';
import { ArrowDown, ArrowUp, ExternalLink, EyeOff, Maximize2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { ContextMenu, IconButton } from '@wadeck-app/dsl-ui';

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

const ICON = 'h-3.5 w-3.5';
const noop = (): void => {};

// The actions of one widget, always visible: refresh, expand, and a menu. The icons carry a native tooltip (title) and a
// name for screen readers; the menu moves with the arrow keys.
export function WidgetToolbar({ widgetTitle, moduleTitle, onRefresh, onExpand, onHide, onOpenModule, onMoveEarlier, onMoveLater }: WidgetToolbarProps): React.ReactElement {
  return (
    <div role="toolbar" aria-label={`${widgetTitle} actions`} className="flex items-center gap-0.5">
      <IconButton icon={<RefreshCw className={ICON} />} aria-label={`Refresh ${widgetTitle}`} title="Refresh" variant="ghost" size="icon-xs" onClick={onRefresh} />
      <IconButton icon={<Maximize2 className={ICON} />} aria-label={`Expand ${widgetTitle}`} title="Expand" variant="ghost" size="icon-xs" onClick={onExpand} />
      <ContextMenu
        side="bottom"
        align="end"
        trigger={<IconButton icon={<MoreHorizontal className={ICON} />} aria-label={`More actions for ${widgetTitle}`} title="More" variant="ghost" size="icon-xs" />}
        items={[
          { label: `Open ${moduleTitle}`, icon: <ExternalLink className={ICON} />, onClick: onOpenModule ?? noop, disabled: onOpenModule === undefined },
          { label: 'Move earlier', icon: <ArrowUp className={ICON} />, onClick: onMoveEarlier ?? noop, disabled: onMoveEarlier === undefined },
          { label: 'Move later', icon: <ArrowDown className={ICON} />, onClick: onMoveLater ?? noop, disabled: onMoveLater === undefined },
          { label: 'Hide widget', icon: <EyeOff className={ICON} />, onClick: onHide },
        ]}
      />
    </div>
  );
}
