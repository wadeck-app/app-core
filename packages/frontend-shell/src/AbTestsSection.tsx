import React from 'react';
import { VersionRow } from './VersionRow.js';
import { useAbTestInventory, type AbTestInventory } from './useAbTestInventory.js';

// Per module: how many tests in its views and how many in its code.
function perModule(inventory: AbTestInventory): Array<{ moduleId: string; views: number; components: number }> {
  const rows = new Map<string, { moduleId: string; views: number; components: number }>();
  const row = (moduleId: string) => rows.get(moduleId) ?? rows.set(moduleId, { moduleId, views: 0, components: 0 }).get(moduleId)!;
  inventory.views.forEach((v) => row(v.moduleId).views++);
  inventory.components.forEach((c) => row(c.moduleId).components++);
  return [...rows.values()];
}

// The A/B tests of all the installed modules, over all their pages (the dock only shows those of the page you are on).
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
            {perModule(state.inventory).map((m) => (
              <VersionRow key={m.moduleId} name={m.moduleId}>
                {[m.views > 0 ? `${m.views} in views` : '', m.components > 0 ? `${m.components} in code` : ''].filter(Boolean).join(', ')}
              </VersionRow>
            ))}
          </dl>
          {state.inventory.unreadable.map((u) => (
            <p key={u.moduleId} className="text-danger">
              {u.moduleId}: components not read, its tests are not counted ({u.reason})
            </p>
          ))}
          {state.inventory.total === 0 && state.inventory.unreadable.length === 0 ? <p className="text-muted">No A/B test declared.</p> : null}
        </>
      ) : null}
    </>
  );
}
