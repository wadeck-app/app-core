import React from 'react';
import { AbDock, PageContent, PageSection, useAbTest } from '@wadeck-app/dsl-ui';
import { ModuleView } from './ModuleView.js';
import { ModuleLibGate } from './useModuleLibs.js';
import { titleFromId } from './layout/navModel.js';
import { WidgetFrame, type WidgetFrameVariant } from './WidgetFrame.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// Base slot: widget/dashboard -> rendered into a grid (frontend-shell.md "Base slots").
// Widgets use the same GenericPageRunner + fetcher path as pages (ModulePage.tsx)
// -- widget/page is a placement distinction only, not a capability tier, so a
// widget's view can declare $sources just like a page's.
export function Dashboard({ modules }: DashboardProps): React.ReactElement {
  const widgets = modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'widget' && ep.slot === 'dashboard')
      .map((ep, i) => ({ moduleId: m.id, moduleTitle: m.title ?? titleFromId(m.id), key: `${m.id}-${i}`, label: ep.label, rawYaml: ep.rawYaml })),
  );

  // A/B tests open on the dashboard (see the A/B testing rule in the project CLAUDE.md).
  const frame = useAbTest<WidgetFrameVariant>({
    id: 'widget-frame',
    label: 'Widget frame',
    initial: 'current',
    options: {
      current: { label: 'Current', hint: 'Today: the dsl-ui Card with a bold title in its header.' },
      flat: { label: 'Flat', hint: 'Linear style: no box, a small uppercase label over a hairline.' },
      datadog: { label: 'Datadog', hint: 'Bordered tile, title on the left and the owning module on the right of a header row, lifts on hover.' },
      jira: { label: 'Jira', hint: 'Gadget: the module logo next to the title, and a 3px bar of the module color on top.' },
      wash: { label: 'Wash', hint: 'Header band washed with the module color (same wash as the navigation), color dot, module on the right.' },
      spotlight: { label: 'Spotlight', hint: 'Roomy: module-colored bar on the left, small colored title, module name as caption.' },
    },
  });
  const grid = useAbTest({
    id: 'widget-grid',
    label: 'Widget grid',
    initial: 'fill-240',
    options: {
      'fill-240': { label: 'Narrow', hint: 'Today: as many columns as fit, each at least 240px.' },
      'fill-320': { label: 'Medium', hint: 'Columns of at least 320px: fewer, roomier widgets.' },
      'fill-440': { label: 'Wide', hint: 'Columns of at least 440px: two or three big widgets per row (charts, tables).' },
    },
  });
  const inner = useAbTest({
    id: 'widget-inner',
    label: 'Inner box',
    initial: 'keep',
    options: {
      keep: { label: 'Keep', hint: 'Today: the stat tile, chart or table keeps its own border and shadow inside the frame (box in a box).' },
      bare: { label: 'Bare', hint: 'Removes the widget own border, shadow, background and padding: the frame is the only box.' },
    },
  });
  const columns = { 'fill-240': 'minmax(240px,1fr)', 'fill-320': 'minmax(320px,1fr)', 'fill-440': 'minmax(440px,1fr)' }[grid.value];

  return (
    <>
      <PageContent
        sections={
          <PageSection title="Dashboard">
            {widgets.length === 0 ? (
              <p className="text-muted">No widgets registered yet.</p>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill,${columns})` }}>
                {widgets.map((w) => (
                  <WidgetFrame key={w.key} variant={frame.value} moduleId={w.moduleId} moduleTitle={w.moduleTitle} label={w.label} bare={inner.value === 'bare'}>
                    <ModuleLibGate moduleId={w.moduleId}>
                      <ModuleView rawYaml={w.rawYaml} />
                    </ModuleLibGate>
                  </WidgetFrame>
                ))}
              </div>
            )}
          </PageSection>
        }
      />
      <AbDock tests={[frame, inner, grid]} />
    </>
  );
}
