import React from 'react';
import { Link } from 'react-router-dom';
import { DateText } from '@wadeck-app/dsl-ui';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

const TH = 'border-b border-border px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted';
const TD = 'border-b border-border px-2 py-1.5 align-top text-sm text-content';

// A module is also "failed" when its update failed and the previous version still runs.
const stillRunning = (modules: readonly LoadedModuleSummary[], id: string): boolean => modules.some((m) => m.id === id);

function ModuleLink({ id }: { id: string }): React.ReactElement {
  return (
    <Link to={`/modules/${id}`} className="text-primary underline-offset-2 hover:underline">
      {id}
    </Link>
  );
}

// "billing ^1.0.0", the module being a link when it is installed.
function Dependency({ id, range, installed }: { id: string; range: string; installed: boolean }): React.ReactElement {
  return (
    <li>
      {installed ? <ModuleLink id={id} /> : <span className="font-medium">{id}</span>} <span className="font-mono text-xs text-muted">{range}</span>
      {installed ? null : <span className="text-warning-text"> (not loaded)</span>}
    </li>
  );
}

function List({ items, empty }: { items: React.ReactNode[]; empty: string }): React.ReactElement {
  return items.length === 0 ? <span className="text-muted">{empty}</span> : <ul className="space-y-0.5">{items.map((item, i) => <React.Fragment key={i}>{item}</React.Fragment>)}</ul>;
}

function parts(module: LoadedModuleSummary): string {
  const count = (kind: string): number => module.extensionPoints.filter((ep) => ep.kind === kind).length;
  const others = module.extensionPoints.length - count('page') - count('widget');
  return [count('page') > 0 ? `${count('page')} page${count('page') > 1 ? 's' : ''}` : '', count('widget') > 0 ? `${count('widget')} widget${count('widget') > 1 ? 's' : ''}` : '', others > 0 ? `${others} other` : '', module.dslLib === undefined ? '' : 'components']
    .filter(Boolean)
    .join(', ');
}

// What is installed, what each module needs, can do without and offers, and anything that is not as it should be. Read-only: a
// module is registered, updated or removed with its own tools; this page says where things stand.
export function ModulesPage({ modules, failed }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[] }): React.ReactElement {
  const installed = new Set(modules.map((m) => m.id));
  const withWarnings = modules.filter((m) => (m.warnings ?? []).length > 0);
  const neededBy = (id: string): string[] => modules.filter((m) => m.requires?.[id] !== undefined || m.optionalRequires?.[id] !== undefined).map((m) => m.id);

  return (
    <div className="max-w-6xl space-y-6 p-4">
      <header>
        <h1 className="text-xl font-semibold text-content">Modules</h1>
        <p className="mt-1 text-sm text-muted">The modules installed in this app-core: their version, what each needs and can do without, what it offers to others, and what is not as it should be. Read-only.</p>
        <p className="mt-2 text-sm text-content">
          <strong>{modules.length}</strong> loaded, <strong className={failed.length > 0 ? 'text-danger' : undefined}>{failed.length}</strong> failed, <strong className={withWarnings.length > 0 ? 'text-warning-text' : undefined}>{withWarnings.length}</strong> with warnings.
        </p>
      </header>

      {failed.length > 0 ? (
        <section aria-labelledby="mod-failed">
          <h2 id="mod-failed" className="mb-2 text-base font-semibold text-danger">
            Failed to load
          </h2>
          <ul className="space-y-3">
            {failed.map((f) => (
              <li key={f.id} className="rounded border border-border p-3 text-sm">
                <div>
                  <strong>{f.id}</strong> <span className="text-muted">since</span> <DateText value={f.failedAt} dateStyle="short" />
                  {stillRunning(modules, f.id) ? <span className="text-muted"> — the previous version is still running</span> : null}
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-danger">{f.error}</pre>
                <div className="mt-1 text-muted">
                  {f.cause === 'requirement'
                    ? 'It needs another module that is not loaded or does not fit: it loads again by itself once that is fixed.'
                    : 'Fix the module, then register it again: it is not retried by itself.'}{' '}
                  <span className="font-mono text-xs">{f.source}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {withWarnings.length > 0 ? (
        <section aria-labelledby="mod-warnings">
          <h2 id="mod-warnings" className="mb-1 text-base font-semibold text-warning-text">
            Warnings
          </h2>
          <p className="mb-2 text-sm text-muted">The module is loaded; a contribution it makes to a module it can do without is not used right now. It is used as soon as that module is loaded and fits.</p>
          <ul className="space-y-2 text-sm">
            {withWarnings.map((m) => (
              <li key={m.id}>
                <ModuleLink id={m.id} />
                <ul className="ml-4 list-disc">
                  {(m.warnings ?? []).map((w) => (
                    <li key={w} className="text-content">
                      {w}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="mod-installed">
        <h2 id="mod-installed" className="mb-2 text-base font-semibold text-content">
          Installed modules
        </h2>
        {modules.length === 0 ? (
          <p className="text-sm text-muted">No module is loaded.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Module</th>
                <th className={TH}>Version</th>
                <th className={TH}>Needs</th>
                <th className={TH}>Can do without</th>
                <th className={TH}>Offers (slots)</th>
                <th className={TH}>Needed by</th>
                <th className={TH}>Brings</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td className={TD}>
                    <div className="font-medium">{m.title ?? m.id}</div>
                    <div className="font-mono text-xs">
                      <ModuleLink id={m.id} />
                    </div>
                  </td>
                  <td className={`${TD} font-mono text-xs`}>{m.version}</td>
                  <td className={TD}>
                    <List empty="nothing" items={Object.entries(m.requires ?? {}).map(([id, range]) => <Dependency id={id} range={range} installed={installed.has(id)} />)} />
                  </td>
                  <td className={TD}>
                    <List empty="nothing" items={Object.entries(m.optionalRequires ?? {}).map(([id, range]) => <Dependency id={id} range={range} installed={installed.has(id)} />)} />
                  </td>
                  <td className={TD}>
                    <List empty="none" items={(m.exposedSlots ?? []).map((slot) => <li className="font-mono text-xs">{m.id}:{slot}</li>)} />
                  </td>
                  <td className={TD}>
                    <List empty="nobody" items={neededBy(m.id).map((id) => <li><ModuleLink id={id} /></li>)} />
                  </td>
                  <td className={TD}>{parts(m) || <span className="text-muted">nothing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
