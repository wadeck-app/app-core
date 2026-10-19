import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AbDock, PageContent, PageSection, useAbTest } from '@wadeck-app/dsl-ui';
import { DashboardBar, type DashboardBarVariant } from './DashboardBar.js';
import { WidgetCell, type DashboardWidget } from './WidgetCell.js';
import type { WidgetFrameVariant } from './WidgetFrame.js';
import { Logo } from './layout/Logo.js';
import { navModulesFor, titleFromId } from './layout/navModel.js';
import { useHiddenWidgets, useRefreshTick, type RefreshInterval } from './useDashboardState.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

const GRID = 'grid grid-flow-dense grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4';

// Base slot: widget/dashboard -> rendered into a grid (frontend-shell.md "Base slots").
// Widgets use the same GenericPageRunner + fetcher path as pages (ModulePage.tsx)
// -- widget/page is a placement distinction only, not a capability tier, so a
// widget's view can declare $sources just like a page's.
export function Dashboard({ modules }: DashboardProps): React.ReactElement {
  const widgets: DashboardWidget[] = modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'widget' && ep.slot === 'dashboard')
      .map((ep, i) => ({ moduleId: m.id, moduleTitle: m.title ?? titleFromId(m.id), key: `${m.id}-${i}`, label: ep.label, rawYaml: ep.rawYaml, width: ep.width, height: ep.height })),
  );
  const moduleHref = useMemo(() => new Map(navModulesFor(modules).map((m) => [m.id, m.pages[0]?.routePath])), [modules]);

  const { hidden, hide, restoreAll } = useHiddenWidgets();
  const [interval, setIntervalChoice] = useState<RefreshInterval>('off');
  const { tick, refresh } = useRefreshTick(interval);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  useEffect(() => setRefreshedAt(Date.now()), [tick]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // A/B tests open on the dashboard (see the A/B testing rule in the project CLAUDE.md).
  const frame = useAbTest<WidgetFrameVariant>({
    id: 'widget-frame',
    label: 'Widget frame',
    initial: 'jira',
    options: {
      jira: { label: 'Jira', hint: 'The chosen gadget, as is: module logo, title with the module as subtitle, 3px bar of the module color on top.' },
      'jira-tools': { label: 'Jira + tools', hint: 'Jira, plus refresh / expand / menu (open the module, hide) that appear when the pointer or the keyboard is on the widget, and a lift on hover.' },
      'jira-footer': { label: 'Jira + footer', hint: 'Jira + tools, plus a footer: link to the module and when the widget was last refreshed.' },
      'datadog-tools': { label: 'Datadog', hint: 'Slim header row (color dot, title); the module name gives way to the tools on hover. Radius 6px.' },
      atlas: { label: 'Atlas', hint: 'Atlassian proportions: 8px radius, 12/16px spacing, a faint wash of the module color in the header, tools and footer.' },
    },
  });
  const bar = useAbTest<DashboardBarVariant>({
    id: 'dashboard-bar',
    label: 'Dashboard bar',
    initial: 'full',
    options: {
      off: { label: 'None', hint: 'Today: nothing above the widgets.' },
      lite: { label: 'Lite', hint: 'When the data is from, a Refresh button, and a way back for hidden widgets.' },
      full: { label: 'Full', hint: 'Lite + one filter chip per module and an automatic refresh (30 s, 1 min, 5 min).' },
    },
  });
  const groups = useAbTest({
    id: 'dashboard-groups',
    label: 'Grouping',
    initial: 'flat',
    options: {
      flat: { label: 'Flat', hint: 'One grid with every widget.' },
      'by-module': { label: 'By module', hint: 'One collapsible section per module (Datadog groups), with its logo and widget count.' },
    },
  });

  const visible = widgets.filter((w) => !hidden.has(w.key) && (filter === undefined || w.moduleId === filter));
  const filterOptions = [...new Set(widgets.map((w) => w.moduleId))].map((id) => ({
    id,
    title: widgets.find((w) => w.moduleId === id)?.moduleTitle ?? id,
    count: widgets.filter((w) => w.moduleId === id && !hidden.has(w.key)).length,
  }));

  const cell = (w: DashboardWidget): React.ReactElement => (
    <WidgetCell key={w.key} widget={w} variant={frame.value} tick={tick} moduleHref={moduleHref.get(w.moduleId)} onHide={() => hide(w.key)} />
  );

  const sections = [...new Set(visible.map((w) => w.moduleId))].map((id) => {
    const items = visible.filter((w) => w.moduleId === id);
    const title = items[0]?.moduleTitle ?? id;
    const open = !collapsed.has(id);
    return (
      <section key={id} aria-label={title} className="mb-6">
        <button
          type="button"
          aria-expanded={open}
          className="mb-3 flex w-full items-center gap-2 border-b border-border pb-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setCollapsed((prev) => (open ? new Set([...prev, id]) : new Set([...prev].filter((c) => c !== id))))}
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />}
          <Logo title={title} moduleId={id} />
          <span className="text-sm font-semibold text-content">{title}</span>
          <span className="text-xs text-muted">{`${items.length} widget${items.length === 1 ? '' : 's'}`}</span>
        </button>
        {open ? <div className={GRID}>{items.map(cell)}</div> : null}
      </section>
    );
  });

  return (
    <>
      <PageContent
        sections={
          <PageSection title="Dashboard">
            {widgets.length === 0 ? (
              <p className="text-muted">No widgets registered yet.</p>
            ) : (
              <>
                <DashboardBar
                  variant={bar.value}
                  refreshedAt={refreshedAt}
                  onRefresh={refresh}
                  hiddenCount={widgets.filter((w) => hidden.has(w.key)).length}
                  onRestore={restoreAll}
                  modules={filterOptions}
                  filter={filter}
                  onFilter={setFilter}
                  interval={interval}
                  onInterval={setIntervalChoice}
                />
                {visible.length === 0 ? <p className="text-muted">Every widget is hidden or filtered out.</p> : groups.value === 'flat' ? <div className={GRID}>{visible.map(cell)}</div> : sections}
              </>
            )}
          </PageSection>
        }
      />
      <AbDock tests={[frame, bar, groups]} />
    </>
  );
}
