import React from 'react';
import { Link } from 'react-router-dom';
import { VersionRow } from './VersionRow.js';
import { AB_TESTS_PATH } from './layout/navModel.js';
import { useAbTestInventory } from './useAbTestInventory.js';

// The number of A/B tests of all the installed modules, over all their pages; the list and where to find each is on its own page.
export function AbTestsSection(): React.ReactElement {
  const state = useAbTestInventory();
  return (
    <>
      <h4 className="mb-1 mt-3 font-semibold text-content">A/B tests</h4>
      {state.state === 'loading' ? <p className="text-muted">Counting…</p> : null}
      {state.state === 'error' ? <p className="text-danger">Cannot count the A/B tests: {state.message}</p> : null}
      {state.state === 'ready' ? (
        <>
          <dl>
            <VersionRow name="declared">
              <span title={`${state.inventory.exact} in module views (exact), ${state.inventory.estimated} in module code (estimated from the text of the bundles)`}>
                {state.inventory.total}
                {state.inventory.estimated > 0 ? ` (${state.inventory.exact} exact, ${state.inventory.estimated} estimated)` : ''}
              </span>
            </VersionRow>
          </dl>
          {state.inventory.unreadable.map((u) => (
            <p key={u.moduleId} className="text-danger">
              {u.moduleId}: components not read, its tests are not counted ({u.reason})
            </p>
          ))}
          <p>
            <Link to={AB_TESTS_PATH} className="text-primary underline-offset-2 hover:underline">
              {state.inventory.total === 0 ? 'A/B tests page' : 'List them and see where to find them'}
            </Link>
          </p>
        </>
      ) : null}
    </>
  );
}
