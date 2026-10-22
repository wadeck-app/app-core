import React from 'react';
import { useParams } from 'react-router-dom';
import { PageContent } from '@wadeck-app/dsl-ui';
import { ModuleView } from './ModuleView.js';
import { ModuleLibGate } from './useModuleLibs.js';
import type { LoadedModuleSummary } from './types.js';

export interface PageTarget {
  moduleId: string;
  path: string;
}

// Renders a page extension point. Pages that declare a `path` are mounted on their own route and
// passed as `target`; the others are nav pages addressed by their (moduleId, index) route params.
// Pages use GenericPageRunner (not plain DslRenderer) so their $sources can
// fetch live data from the module's own registerRoute()-registered endpoint
// via `fetcher`. GenericPageRunner parses `rawYaml` itself -- it does not
// accept the pre-resolved `view` object (confirmed against dsl-view source).
export function ModulePage({ modules, target }: { modules: LoadedModuleSummary[]; target?: PageTarget }): React.ReactElement {
  const { moduleId: paramModuleId, index } = useParams<{ moduleId: string; index: string }>();
  const moduleId = target?.moduleId ?? paramModuleId;
  const mod = modules.find((m) => m.id === moduleId);
  const ep =
    target === undefined
      ? mod?.extensionPoints.filter((e) => e.kind === 'page' && e.slot === 'nav')[Number(index)]
      : mod?.extensionPoints.find((e) => e.kind === 'page' && e.path === target.path);

  if (mod === undefined || ep === undefined) {
    return <p className="p-4 text-muted">Page not found (module may have been unloaded).</p>;
  }

  // Every page is mounted as this same element, and the renderer tells pages apart by their route parameters only: two
  // pages without any would share the state of the first (its $vars, its sources). The key makes each page start over.
  const pageKey = `${mod.id}:${ep.path ?? index}`;
  return (
    <ModuleLibGate moduleId={mod.id}>
      <PageContent sections={<ModuleView key={pageKey} rawYaml={ep.rawYaml} />} />
    </ModuleLibGate>
  );
}
