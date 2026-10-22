import React from 'react';

interface WidgetFrameProps {
  moduleTitle: string;
  label: string | undefined;
  // Removes the box the widget draws around itself (a StatTile, a Chart, a table), so the frame is the only box.
  bare: boolean;
  // The grip that drags the widget, and its actions.
  handle: React.ReactNode;
  toolbar: React.ReactNode;
  children: React.ReactNode;
}

// The widget's root element is the first child of the article; a box is recognised by the classes dsl-ui gives it.
const BARE = '[&>.border]:border-0 [&>.shadow-sm]:shadow-none [&>.bg-surface]:bg-transparent [&>.p-4]:p-0';

// The frame around a dashboard widget: a dense Datadog-style tile. A 32px header with the grip to drag the widget, the
// title and the tools (always visible); the module is named in the tooltip of the tile.
export function WidgetFrame({ moduleTitle, label, bare, handle, toolbar, children }: WidgetFrameProps): React.ReactElement {
  const title = label ?? moduleTitle;
  return (
    <section
      title={moduleTitle}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <header className="flex h-8 items-center gap-1.5 border-b border-border pl-1 pr-1.5">
        {handle}
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-content">{title}</h3>
        {toolbar}
      </header>
      <div className="flex-1 p-2">
        <div role="article" aria-label={title} className={bare ? BARE : undefined}>
          {children}
        </div>
      </div>
    </section>
  );
}
