import React from 'react';
import { useParams } from 'react-router-dom';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';
import type { LoadedModuleSummary } from './types.js';

// Renders a single page/nav extension point by its (moduleId, index) route params.
// Decision #26: pages use GenericPageRunner (not plain DslRenderer) so their
// $sources can fetch live data from the module's own registerRoute()-registered
// endpoint via `fetcher`. GenericPageRunner parses `rawYaml` itself -- it does not
// accept the pre-resolved `view` object (confirmed against dsl-view source).
export function ModulePage({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  const { moduleId, index } = useParams<{ moduleId: string; index: string }>();
  const mod = modules.find((m) => m.id === moduleId);
  const ep = mod?.extensionPoints.filter((e) => e.kind === 'page' && e.slot === 'nav')[Number(index)];

  if (!ep) {
    return <p>Page not found (module may have been unloaded).</p>;
  }

  return <GenericPageRunner yamlText={ep.rawYaml} registry={appRegistry} fetcher={fetcher} />;
}
