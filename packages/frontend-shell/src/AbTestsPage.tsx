import React, { useMemo } from 'react';
import { useAbExperiments } from '@wadeck-app/dsl-ui';
import { ShellPage } from './ShellPage.js';
import { AB_TESTS_YAML, abTestsViewData } from './abTestsView.js';
import { useSeenTests } from './abTestsSeen.js';
import { useAbTestInventory } from './useAbTestInventory.js';
import type { LoadedModuleSummary } from './types.js';

// The A/B tests the installed modules declare and where to find them. Written like the module pages (see ShellPage).
export function AbTestsPage({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  const state = useAbTestInventory();
  const seen = useSeenTests();
  const dockOn = useAbExperiments()?.enabled === true;
  const data = useMemo(() => (state.state === 'ready' ? { abTests: abTestsViewData(state.inventory, modules, seen, dockOn) } : undefined), [state, modules, seen, dockOn]);

  if (state.state === 'loading') {
    return <p className="p-4 text-muted">Counting…</p>;
  }
  if (state.state === 'error' || data === undefined) {
    return (
      <p role="alert" className="p-4 text-danger">
        Cannot list the A/B tests: {state.state === 'error' ? state.message : 'no data'}
      </p>
    );
  }
  return <ShellPage yaml={AB_TESTS_YAML} data={data} />;
}
