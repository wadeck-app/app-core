import React from 'react';
import { Card } from '@wadeck-app/dsl-ui';
import { Logo, moduleColor } from './layout/Logo.js';

// Candidate looks for the frame around a dashboard widget (A/B test "frame" in Dashboard.tsx).
export type WidgetFrameVariant = 'current' | 'flat' | 'datadog' | 'jira' | 'wash' | 'spotlight';

interface WidgetFrameProps {
  variant: WidgetFrameVariant;
  moduleId: string;
  moduleTitle: string;
  label: string | undefined;
  // Removes the box the widget draws around itself (a StatTile, a Chart, a table), so the frame is the only box.
  bare: boolean;
  children: React.ReactNode;
}

// The title shown for a widget that gives no label: the module name, so a frame is never anonymous.
const titleOf = (label: string | undefined, moduleTitle: string): string => label ?? moduleTitle;

// The widget's root element is the first child of the article; a box is recognised by the classes dsl-ui gives it.
const BARE = '[&>.border]:border-0 [&>.shadow-sm]:shadow-none [&>.bg-surface]:bg-transparent [&>.p-4]:p-0';

export function WidgetFrame({ variant, moduleId, moduleTitle, label, bare, children }: WidgetFrameProps): React.ReactElement {
  const accent = moduleColor(moduleId);
  const title = titleOf(label, moduleTitle);
  const article = (body: React.ReactNode): React.ReactElement => (
    <div role="article" aria-label={title} className={bare ? BARE : undefined}>
      {body}
    </div>
  );

  switch (variant) {
    case 'current':
      return (
        <Card header={label ? <h3 className="font-semibold">{label}</h3> : undefined}>{article(children)}</Card>
      );

    // Linear: no box at all, a quiet uppercase label over a hairline.
    case 'flat':
      return (
        <section className="min-w-0">
          <h3 className="mb-3 border-b border-border pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
          {article(children)}
        </section>
      );

    // Datadog: a bordered tile with a header row (title left, owning module right) and a lifted hover.
    case 'datadog':
      return (
        <section className="min-w-0 overflow-hidden rounded-md border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h3 className="truncate text-sm font-medium text-content">{title}</h3>
            <span className="shrink-0 text-xs text-muted">{moduleTitle}</span>
          </header>
          <div className="p-3">{article(children)}</div>
        </section>
      );

    // Jira: a gadget with the module logo and a 3px bar of the module color on top.
    case 'jira':
      return (
        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm" style={{ borderTop: `3px solid ${accent}` }}>
          <header className="flex items-center gap-2 px-3 pb-1 pt-3">
            <Logo title={moduleTitle} moduleId={moduleId} />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight text-content">{title}</h3>
              {label ? <p className="truncate text-xs leading-tight text-muted">{moduleTitle}</p> : null}
            </div>
          </header>
          <div className="p-3">{article(children)}</div>
        </section>
      );

    // The wash of the module color used by the navigation, as a header band that fades out.
    case 'wash':
      return (
        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <header
            className="flex items-center gap-2 px-3 py-2"
            style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 16%, transparent), transparent 85%)` }}
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
            <h3 className="truncate text-sm font-semibold text-content">{title}</h3>
            <span className="ml-auto shrink-0 text-xs text-muted">{moduleTitle}</span>
          </header>
          <div className="p-3">{article(children)}</div>
        </section>
      );

    // Spacious: a bar of the module color on the left, a small colored title, the module as a caption.
    case 'spotlight':
      return (
        <section className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 shadow-sm">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
            {title}
          </h3>
          <p className="mb-3 text-xs text-muted">{moduleTitle}</p>
          {article(children)}
        </section>
      );
  }
}
