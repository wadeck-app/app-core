import React from 'react';
import { Link } from 'react-router-dom';
import { useAbExperiments } from '@wadeck-app/dsl-ui';
import { placeOf, type Place } from './abTestPlaces.js';
import { useSeenTests, type SeenTests } from './abTestsSeen.js';
import { useAbTestInventory, type AbTestInventory } from './useAbTestInventory.js';
import type { LoadedModuleSummary } from './types.js';

const TH = 'border-b border-border px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted';
const TD = 'border-b border-border px-2 py-1.5 align-top text-sm text-content';

function Places({ places }: { places: Place[] }): React.ReactElement {
  if (places.length === 0) {
    return <span className="text-muted">no page found</span>;
  }
  return (
    <ul className="space-y-0.5">
      {places.map((place) => (
        <li key={`${place.href}|${place.text}`}>
          <Link to={place.href} className="text-primary underline-offset-2 hover:underline">
            {place.text}
          </Link>
          {place.note !== undefined ? <span className="text-muted"> ({place.note})</span> : null}
        </li>
      ))}
    </ul>
  );
}

// Seen in this browser: the exact addresses where the dock showed the test.
function SeenPlaces({ paths }: { paths: string[] | undefined }): React.ReactElement {
  if (paths === undefined || paths.length === 0) {
    return <span className="text-muted">not seen yet</span>;
  }
  return (
    <ul className="space-y-0.5">
      {paths.map((path) => (
        <li key={path}>
          <Link to={path} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
            {path}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Counts({ inventory }: { inventory: AbTestInventory }): React.ReactElement {
  return (
    <p className="text-sm text-content">
      <strong>{inventory.total}</strong> declared: {inventory.exact} in module views (exact), {inventory.estimated} in module code (estimated from the text of the bundles).
    </p>
  );
}

// Tests the dock showed that no row above accounts for: the scan missed them, which is worth knowing.
function unmatchedSeen(inventory: AbTestInventory, seen: SeenTests): Array<[string, SeenTests[string]]> {
  const viewIds = new Set(inventory.views.map((v) => v.id));
  const codeLabels = new Set(inventory.components.map((c) => c.label).filter((l): l is string => l !== undefined));
  return Object.entries(seen).filter(([id, test]) => !viewIds.has(id) && !codeLabels.has(test.label));
}

export function AbTestsPage({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  const state = useAbTestInventory();
  const seen = useSeenTests();
  const dockOn = useAbExperiments()?.enabled === true;

  return (
    <div className="max-w-5xl space-y-6 p-4">
      <header>
        <h1 className="text-xl font-semibold text-content">A/B tests</h1>
        <p className="mt-1 text-sm text-muted">The tests the installed modules declare, over all their pages, and where to go to see them. The dock (bottom of the page) shows the ones of the page you are on.</p>
        {dockOn ? null : (
          <p role="status" className="mt-2 rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-content">
            The dock is off, so the tests show only their reference variant and nothing is noted as seen. Start the server with <code>app-core-cli serve --ab-tests</code> (or <code>dev --ab-tests</code>), or use the dev server.
          </p>
        )}
      </header>

      {state.state === 'loading' ? <p className="text-muted">Counting…</p> : null}
      {state.state === 'error' ? (
        <p role="alert" className="text-danger">
          Cannot list the A/B tests: {state.message}
        </p>
      ) : null}

      {state.state === 'ready' ? (
        <>
          <Counts inventory={state.inventory} />

          {state.inventory.unreadable.map((u) => (
            <p key={u.moduleId} role="alert" className="text-danger">
              {u.moduleId}: its components could not be read, so its code tests are not counted ({u.reason}).
            </p>
          ))}

          <section aria-labelledby="ab-views">
            <h2 id="ab-views" className="mb-2 text-base font-semibold text-content">
              Declared in views (exact)
            </h2>
            {state.inventory.views.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Test</th>
                    <th className={TH}>Module</th>
                    <th className={TH}>Where it is</th>
                    <th className={TH}>Seen in this browser</th>
                  </tr>
                </thead>
                <tbody>
                  {state.inventory.views.map((test) => (
                    <tr key={`${test.moduleId}|${test.id}`}>
                      <td className={TD}>
                        <div className="font-medium">{test.label ?? test.id}</div>
                        <div className="font-mono text-xs text-muted">{test.id}</div>
                      </td>
                      <td className={TD}>{test.moduleId}</td>
                      <td className={TD}>
                        <Places places={[placeOf(modules, test.point)]} />
                      </td>
                      <td className={TD}>
                        <SeenPlaces paths={seen[test.id]?.paths} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="ab-code">
            <h2 id="ab-code" className="mb-1 text-base font-semibold text-content">
              Written in module code (estimated)
            </h2>
            <p className="mb-2 text-sm text-muted">
              Read from the text of the components a module ships: the count is an estimate, and the bundle does not say which page each test is on. “Likely on” lists the pages that use a component of that module; “seen” is exact once you have visited the page with the dock on.
            </p>
            {state.inventory.components.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              [...new Set(state.inventory.components.map((c) => c.moduleId))].map((moduleId) => (
                <div key={moduleId} className="mb-4">
                  <h3 className="text-sm font-semibold text-content">{moduleId}</h3>
                  <div className="mb-1 text-sm">
                    <span className="text-muted">Likely on:</span>
                    <Places places={(state.inventory.componentUse[moduleId] ?? []).map((point) => placeOf(modules, point))} />
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={TH}>Test</th>
                        <th className={TH}>Seen in this browser</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.inventory.components
                        .filter((c) => c.moduleId === moduleId)
                        .map((test, i) => (
                          <tr key={`${test.label ?? ''}|${i}`}>
                            <td className={TD}>{test.label ?? <span className="text-muted">(label built by the code)</span>}</td>
                            <td className={TD}>
                              <SeenPlaces paths={test.label === undefined ? undefined : Object.values(seen).find((s) => s.label === test.label)?.paths} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>

          {unmatchedSeen(state.inventory, seen).length > 0 ? (
            <section aria-labelledby="ab-unmatched">
              <h2 id="ab-unmatched" className="mb-1 text-base font-semibold text-content">
                Seen in this browser, but not found by the scan
              </h2>
              <p className="mb-2 text-sm text-muted">The dock showed these and the count above does not include them (a module of another version, or code the scan cannot read).</p>
              <ul className="space-y-1 text-sm">
                {unmatchedSeen(state.inventory, seen).map(([id, test]) => (
                  <li key={id}>
                    <strong>{test.label}</strong> <span className="font-mono text-xs text-muted">{id}</span>: <SeenPlaces paths={test.paths} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
