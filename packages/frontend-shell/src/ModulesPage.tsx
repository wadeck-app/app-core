import React, { useMemo } from 'react';
import { useModuleLibStatuses } from './useModuleLibs.js';
import { moduleComponentCount } from './registry.js';
import { ShellPage } from './ShellPage.js';
import { MODULES_YAML, modulesViewData } from './modulesView.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

// What is installed, what each module needs, can do without and offers, and anything that is not as it should be. Read-only: a
// module is registered, updated or removed with its own tools; this page says where things stand. Written like the module pages.
export function ModulesPage({ modules, failed }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[] }): React.ReactElement {
  const libs = useModuleLibStatuses();
  // The count is read from the registry once the bundle of a module is loaded (`generation` changes each time it is registered).
  const data = useMemo(
    () => ({ modules: modulesViewData(modules, failed, (id) => (libs[id] === undefined ? undefined : libs[id].state === 'ready' ? moduleComponentCount(id) : libs[id].state)) }),
    [modules, failed, libs],
  );
  return <ShellPage yaml={MODULES_YAML} data={data} />;
}
