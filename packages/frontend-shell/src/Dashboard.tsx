import React from 'react';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { Card, PageContent, PageSection } from '@wadeck-app/dsl-ui';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';
import { ModuleLibGate } from './useModuleLibs.js';
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
      .map((ep, i) => ({ moduleId: m.id, key: `${m.id}-${i}`, label: ep.label, rawYaml: ep.rawYaml })),
  );

  return (
    <PageContent
      sections={
        <PageSection title="Dashboard">
          {widgets.length === 0 ? (
            <p className="text-muted">No widgets registered yet.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {widgets.map((w) => (
                <Card key={w.key} header={w.label ? <h3 className="font-semibold">{w.label}</h3> : undefined}>
                  <div role="article" aria-label={w.label ?? w.moduleId}>
                    <ModuleLibGate moduleId={w.moduleId}>
                      <GenericPageRunner yamlText={w.rawYaml} registry={appRegistry} fetcher={fetcher} />
                    </ModuleLibGate>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </PageSection>
      }
    />
  );
}
