import React from 'react';
import { Logo, moduleColor } from './layout/Logo.js';

// Candidate looks for the frame around a dashboard widget (A/B test "widget-frame" in Dashboard.tsx). All start from the
// Jira gadget: the module logo, the title with the module as subtitle, and a bar of the module color on top.
//   jira          the gadget as chosen, nothing else
//   jira-tools    + actions that appear on hover/focus (refresh, expand, menu) and a lift on hover
//   jira-footer   + a footer: link to the module and when the widget was last refreshed
//   datadog-tools a slim header row (dot, title) whose module name gives way to the actions on hover
//   atlas         Atlassian-like proportions: 8px radius, 12/16px spacing, a faint wash of the module color in the header
export type WidgetFrameVariant = 'jira' | 'jira-tools' | 'jira-footer' | 'datadog-tools' | 'atlas';

interface WidgetFrameProps {
  variant: WidgetFrameVariant;
  moduleId: string;
  moduleTitle: string;
  label: string | undefined;
  // Removes the box the widget draws around itself (a StatTile, a Chart, a table), so the frame is the only box.
  bare: boolean;
  // The actions of the widget, shown by the variants that have a place for them.
  toolbar: React.ReactNode;
  // Link to the module and the refresh time, shown by the variants that have a footer.
  footer: React.ReactNode;
  children: React.ReactNode;
}

// The widget's root element is the first child of the article; a box is recognised by the classes dsl-ui gives it.
const BARE = '[&>.border]:border-0 [&>.shadow-sm]:shadow-none [&>.bg-surface]:bg-transparent [&>.p-4]:p-0';

// Appears when the pointer is on the widget or the keyboard focus is inside it, so the actions stay reachable.
const REVEAL = 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

const FOOTER = 'flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted';

export function WidgetFrame({ variant, moduleId, moduleTitle, label, bare, toolbar, footer, children }: WidgetFrameProps): React.ReactElement {
  const accent = moduleColor(moduleId);
  const title = label ?? moduleTitle;
  const body = (
    <div role="article" aria-label={title} className={bare ? BARE : undefined}>
      {children}
    </div>
  );
  const heading = (
    <div className="min-w-0">
      <h3 className="truncate text-sm font-semibold leading-5 text-content">{title}</h3>
      {label ? <p className="truncate text-xs leading-4 text-muted">{moduleTitle}</p> : null}
    </div>
  );

  switch (variant) {
    case 'jira':
      return (
        <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm" style={{ borderTop: `3px solid ${accent}` }}>
          <header className="flex items-center gap-2 px-3 pb-1 pt-3">
            <Logo title={moduleTitle} moduleId={moduleId} />
            {heading}
          </header>
          <div className="flex-1 p-3">{body}</div>
        </section>
      );

    case 'jira-tools':
    case 'jira-footer':
      return (
        <section
          className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-shadow hover:shadow-md"
          style={{ borderTop: `3px solid ${accent}` }}
        >
          <header className="flex items-center gap-2 px-3 pb-1 pt-3">
            <Logo title={moduleTitle} moduleId={moduleId} />
            {heading}
            <div className={`ml-auto shrink-0 ${REVEAL}`}>{toolbar}</div>
          </header>
          <div className="flex-1 p-3">{body}</div>
          {variant === 'jira-footer' ? <footer className={FOOTER}>{footer}</footer> : null}
        </section>
      );

    case 'datadog-tools':
      return (
        <section className="group flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
          <header className="relative flex h-9 items-center gap-2 border-b border-border px-3">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
            <h3 className="truncate text-sm font-semibold text-content">{title}</h3>
            <span className="ml-auto shrink-0 text-xs text-muted">{moduleTitle}</span>
            <div className={`absolute inset-y-0 right-1 flex items-center bg-surface pl-2 ${REVEAL}`}>{toolbar}</div>
          </header>
          <div className="flex-1 p-3">{body}</div>
        </section>
      );

    case 'atlas':
      return (
        <section
          className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-shadow hover:shadow-md"
          style={{ borderTop: `2px solid ${accent}` }}
        >
          <header className="flex items-center gap-3 px-4 py-3" style={{ background: `color-mix(in srgb, ${accent} 5%, transparent)` }}>
            <Logo title={moduleTitle} moduleId={moduleId} />
            {heading}
            <div className={`ml-auto shrink-0 ${REVEAL}`}>{toolbar}</div>
          </header>
          <div className="flex-1 px-4 pb-4 pt-3">{body}</div>
          <footer className={`${FOOTER} px-4`}>{footer}</footer>
        </section>
      );
  }
}
