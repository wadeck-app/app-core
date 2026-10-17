import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RouterProvider, ToastProvider } from '@wadeck-app/dsl-ui';
import { AppNavBar } from './NavBar.js';
import { Dashboard } from './Dashboard.js';
import { ModulePage } from './ModulePage.js';
import { modulePagePath } from './modulePaths.js';
import { useModules } from './useModules.js';
import { ModuleLibsProvider, useModuleLibs } from './useModuleLibs.js';
import type { LoadedModuleSummary } from './types.js';

const NO_MODULES: LoadedModuleSummary[] = [];

export default function App(): React.ReactElement {
  const { data, error } = useModules();
  const modules = data?.modules ?? NO_MODULES;
  const failedModules = data?.failed ?? [];
  const libStatuses = useModuleLibs(modules);
  const libErrors = Object.entries(libStatuses).flatMap(([id, status]) => (status.state === 'error' ? [{ id, message: status.message }] : []));

  // Pages that declare a `path` get their own route (so `$route.<param>` reaches the view);
  // derived from the module list, they disappear when the module is unloaded.
  const pageRoutes = modules.flatMap((m) =>
    m.extensionPoints.flatMap((ep) => (ep.kind === 'page' && ep.path !== undefined ? [{ moduleId: m.id, path: ep.path }] : [])),
  );

  return (
    <BrowserRouter>
      {/* Provides UrlParamContext/RouterContext: module views bind components to URL params (e.g. Pagination `urlParam`). */}
      <RouterProvider>
        <ToastProvider>
          <ModuleLibsProvider value={libStatuses}>
            <div className="min-h-screen bg-bg">
              <AppNavBar modules={modules} />
              {error ? (
                <p role="alert" className="px-4 py-3 text-danger">
                  Failed to load modules: {String(error)}
                </p>
              ) : null}
              {failedModules.length > 0 ? (
                <div role="alert" className="px-4 py-3 text-danger">
                  <p>Modules that failed to load (fix them, re-register, or unregister):</p>
                  <ul className="list-disc pl-6">
                    {failedModules.map((f) => (
                      <li key={f.id}>
                        <strong>{f.id}</strong>: {f.error}
                        {modules.some((m) => m.id === f.id) ? ' The previous version is still running.' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {libErrors.length > 0 ? (
                <div role="alert" className="px-4 py-3 text-danger">
                  <p>Components that failed to load in the browser:</p>
                  <ul className="list-disc pl-6">
                    {libErrors.map((lib) => (
                      <li key={lib.id}>{lib.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Routes>
                <Route path="/" element={<Dashboard modules={modules} />} />
                {pageRoutes.map((r) => (
                  <Route
                    key={`${r.moduleId}${r.path}`}
                    path={modulePagePath(r.moduleId, r.path)}
                    element={<ModulePage modules={modules} target={r} />}
                  />
                ))}
                <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
                <Route path="*" element={<p className="p-4 text-muted">Page not found (the module may have been unloaded).</p>} />
              </Routes>
            </div>
          </ModuleLibsProvider>
        </ToastProvider>
      </RouterProvider>
    </BrowserRouter>
  );
}
