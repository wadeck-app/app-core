import React, { useMemo } from 'react';
import { ShellPage } from './ShellPage.js';
import { MODULES_YAML, modulesViewData } from './modulesView.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

// What is installed, what each module needs, can do without and offers, and anything that is not as it should be. Read-only: a
// module is registered, updated or removed with its own tools; this page says where things stand. Written like the module pages.
export function ModulesPage({ modules, failed }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[] }): React.ReactElement {
  const data = useMemo(() => ({ modules: modulesViewData(modules, failed) }), [modules, failed]);
  return <ShellPage yaml={MODULES_YAML} data={data} />;
}
