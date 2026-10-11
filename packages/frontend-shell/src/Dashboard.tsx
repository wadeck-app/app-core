import React from 'react';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';
import type { LoadedModuleSummary } from './types.js';

export interface DashboardProps {
  modules: LoadedModuleSummary[];
}

// Base slot: widget/dashboard -> rendered into a grid (frontend-shell.md "Base slots").
// Decision #28: widgets use the same GenericPageRunner + fetcher path as pages
// (ModulePage.tsx) -- widget/page is a placement distinction only, not a
// capability tier, so a widget's view can declare $sources just like a page's.
export function Dashboard({ modules }: DashboardProps): React.ReactElement {
  const widgets = modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'widget' && ep.slot === 'dashboard')
      .map((ep, i) => ({ moduleId: m.id, key: `${m.id}-${i}`, label: ep.label, rawYaml: ep.rawYaml })),
  );

  if (widgets.length === 0) {
    return <p>No widgets registered yet.</p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
      {widgets.map((w) => (
        <div key={w.key} role="article" aria-label={w.label ?? w.moduleId} style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '8px' }}>
          {w.label && <h3>{w.label}</h3>}
          <GenericPageRunner yamlText={w.rawYaml} registry={appRegistry} fetcher={fetcher} />
        </div>
      ))}
    </div>
  );
}
