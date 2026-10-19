import React from 'react';
import { ExternalLink, EyeOff, Maximize2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { ContextMenu, IconButton, Tooltip } from '@wadeck-app/dsl-ui';

export interface WidgetToolbarProps {
  widgetTitle: string;
  moduleTitle: string;
  onRefresh: () => void;
  onExpand: () => void;
  onHide: () => void;
  // Where the module's own pages start; undefined when the module has no page to open.
  onOpenModule: (() => void) | undefined;
}

// The actions of one widget (Datadog and Jira keep them out of sight until the pointer or the keyboard is on the
// widget): refresh, expand, and a menu. Every icon has a name for screen readers and a tooltip.
export function WidgetToolbar({ widgetTitle, moduleTitle, onRefresh, onExpand, onHide, onOpenModule }: WidgetToolbarProps): React.ReactElement {
  return (
    <div role="toolbar" aria-label={`${widgetTitle} actions`} className="flex items-center gap-0.5">
      <Tooltip content="Refresh">
        <IconButton icon={<RefreshCw className="h-3.5 w-3.5" />} aria-label={`Refresh ${widgetTitle}`} variant="ghost" size="icon-xs" onClick={onRefresh} />
      </Tooltip>
      <Tooltip content="Expand">
        <IconButton icon={<Maximize2 className="h-3.5 w-3.5" />} aria-label={`Expand ${widgetTitle}`} variant="ghost" size="icon-xs" onClick={onExpand} />
      </Tooltip>
      <ContextMenu
        side="bottom"
        align="end"
        trigger={<IconButton icon={<MoreHorizontal className="h-3.5 w-3.5" />} aria-label={`More actions for ${widgetTitle}`} variant="ghost" size="icon-xs" />}
        items={[
          { label: `Open ${moduleTitle}`, icon: <ExternalLink className="h-3.5 w-3.5" />, onClick: onOpenModule ?? (() => {}), disabled: onOpenModule === undefined },
          { label: 'Hide widget', icon: <EyeOff className="h-3.5 w-3.5" />, onClick: onHide },
        ]}
      />
    </div>
  );
}
