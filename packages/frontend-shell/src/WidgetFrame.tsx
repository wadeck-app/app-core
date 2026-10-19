import React from 'react';
import { Logo, moduleColor } from './layout/Logo.js';

// Candidate looks for the frame around a dashboard widget (A/B test "widget-frame" in Dashboard.tsx). All are the Datadog
// tile: a slim header row with the grip to drag the widget, the title and the tools, always visible.
//   datadog          dot in the module color, title, module name on the right, tools
//   datadog-compact  a denser tile: 32px header, tighter body, the module name only as a tooltip
//   datadog-accent   a bar of the module color down the left edge and a faint wash of it in the header
//   datadog-footer   + a footer: link to the module and when the widget was last refreshed
//   datadog-logo     the module logo instead of the dot, which also says the module without its name
export type WidgetFrameVariant = 'datadog' | 'datadog-compact' | 'datadog-accent' | 'datadog-footer' | 'datadog-logo';

interface WidgetFrameProps {
  variant: WidgetFrameVariant;
  moduleId: string;
  moduleTitle: string;
  label: string | undefined;
  // Removes the box the widget draws around itself (a StatTile, a Chart, a table), so the frame is the only box.
  bare: boolean;
  // The grip that drags the widget, and its actions.
  handle: React.ReactNode;
  toolbar: React.ReactNode;
  // Link to the module and the refresh time, shown by the variants that have a footer.
  footer: React.ReactNode;
  children: React.ReactNode;
}

// The widget's root element is the first child of the article; a box is recognised by the classes dsl-ui gives it.
const BARE = '[&>.border]:border-0 [&>.shadow-sm]:shadow-none [&>.bg-surface]:bg-transparent [&>.p-4]:p-0';

const CARD = 'flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-shadow hover:shadow-md';
const FOOTER = 'flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted';

export function WidgetFrame({ variant, moduleId, moduleTitle, label, bare, handle, toolbar, footer, children }: WidgetFrameProps): React.ReactElement {
  const accent = moduleColor(moduleId);
  const title = label ?? moduleTitle;
  const compact = variant === 'datadog-compact';
  // The variants that do not write the module name next to the title say it in a tooltip.
  const namedByTooltip = compact || variant === 'datadog-logo';
  const article = (
    <div role="article" aria-label={title} className={bare ? BARE : undefined}>
      {children}
    </div>
  );
  const dot = <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />;
  // The module is named next to the title unless the variant says it another way (a logo) or not at all (compact: tooltip).
  const showModuleName = variant === 'datadog' || variant === 'datadog-accent' || variant === 'datadog-footer';

  return (
    <section className={CARD} style={variant === 'datadog-accent' ? { borderLeft: `3px solid ${accent}` } : undefined} title={namedByTooltip ? moduleTitle : undefined}>
      <header
        className={`flex items-center gap-1.5 border-b border-border pl-1 pr-1.5 ${compact ? 'h-8' : 'h-10'}`}
        style={variant === 'datadog-accent' ? { background: `color-mix(in srgb, ${accent} 5%, transparent)` } : undefined}
      >
        {handle}
        {variant === 'datadog-logo' ? <Logo title={moduleTitle} moduleId={moduleId} /> : dot}
        <h3 className="min-w-[6ch] flex-1 truncate text-sm font-semibold text-content">{title}</h3>
        {showModuleName && label ? <span className="hidden min-w-0 shrink-[10] truncate text-xs text-muted sm:inline">{moduleTitle}</span> : null}
        {toolbar}
      </header>
      <div className={`flex-1 ${compact ? 'p-2' : 'p-3'}`}>{article}</div>
      {variant === 'datadog-footer' ? <footer className={FOOTER}>{footer}</footer> : null}
    </section>
  );
}
