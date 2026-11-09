import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AbExperiments, RouterProvider, ToastProvider } from '@wadeck-app/dsl-ui';
import { AbTestsPage } from './AbTestsPage.js';
import { ModulesPage } from './ModulesPage.js';
import { AbTestsSeenRecorder } from './abTestsSeen.js';
import { Dashboard } from './Dashboard.js';
import { ModuleIndex } from './ModuleIndex.js';
import { ModulePage } from './ModulePage.js';
import { useShellSettings, type ShellSettings } from './useShellSettings.js';
import { DateSettingsProvider } from './dates/DateFormatContext.js';
import { OverlayWidgets } from './OverlayWidgets.js';
import { ShellNotifier } from './ShellNotifier.js';
import { modulePagePath } from './modulePaths.js';
import { useModules } from './useModules.js';
import { ModuleLibsProvider, useModuleLibs } from './useModuleLibs.js';
import { AppLayout } from './layout/AppLayout.js';
import { navModulesFor } from './layout/navModel.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

const NO_MODULES: LoadedModuleSummary[] = [];

// Navigation chrome around the page content. No A/B test is open right now; to start one, render the dev-only `AbDock`
// here with the test (see the A/B testing rule in the project CLAUDE.md).
function AppFrame({ modules, failed, standalone, children }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[]; standalone: ShellSettings['standalone']; children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <AppLayout modules={modules} navModules={navModulesFor(modules)} failed={failed} standalone={standalone ?? undefined}>
        {children}
      </AppLayout>
      <OverlayWidgets modules={modules} />
    </>
  );
}

// "/" of a standalone application: the first page the module adds to the menu. Said clearly when there is none.
function StandaloneHome({ modules, moduleId, loaded }: { modules: LoadedModuleSummary[]; moduleId: string; loaded: boolean }): React.ReactElement {
  const first = navModulesFor(modules).find((m) => m.id === moduleId)?.pages[0];
  if (first !== undefined) {
    return <Navigate to={first.routePath} replace />;
  }
  if (!loaded) {
    return <p className="p-4 text-muted">Loading...</p>;
  }
  return (
    <p role="alert" className="p-4 text-danger">
      This application is the module "{moduleId}" but it adds no page to the menu (or it is not loaded: see the errors above). Add a page with "slot": "nav" to its manifest, or fix the module.
    </p>
  );
}

export default function App(): React.ReactElement {
  const { data, error } = useModules();
  const { abTests, standalone } = useShellSettings();
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
      {/* The one formatter of dates and times, from the user's settings: every date of the app goes through it. */}
      <DateSettingsProvider>
      {/* Provides UrlParamContext/RouterContext: module views bind components to URL params (e.g. Pagination `urlParam`). */}
      {/* The one A/B dock (development builds, or `serve --ab-tests`): the shell's own tests and the AbTest nodes of module views share it. */}
      {/* Not `enabled={false}`: that would switch the dock off in development too. */}
      <AbExperiments enabled={abTests ? true : undefined}>
      {/* Keeps where each A/B test was seen (dock on), for the A/B tests page. */}
      <AbTestsSeenRecorder />
      <RouterProvider>
        <ToastProvider>
          {/* The outcome of every module action (row/batch actions, forms, brains) is shown as a toast. */}
          <ShellNotifier>
          <ModuleLibsProvider value={libStatuses}>
            <AppFrame modules={modules} failed={failedModules} standalone={standalone}>
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
                {standalone === null ? (
                  <>
                    <Route path="/" element={<Dashboard modules={modules} />} />
                    <Route path="/ab-tests" element={<AbTestsPage modules={modules} />} />
                    <Route path="/modules-overview" element={<ModulesPage modules={modules} failed={failedModules} />} />
                  </>
                ) : (
                  // No dashboard: the address "/" opens the first page of the module.
                  <Route path="/" element={<StandaloneHome modules={modules} moduleId={standalone.moduleId} loaded={data !== undefined} />} />
                )}
                {pageRoutes.map((r) => (
                  <Route
                    key={`${r.moduleId}${r.path}`}
                    path={modulePagePath(r.moduleId, r.path)}
                    element={<ModulePage modules={modules} target={r} />}
                  />
                ))}
                <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
                <Route path="/modules/:moduleId" element={<ModuleIndex modules={modules} />} />
                <Route path="*" element={<p className="p-4 text-muted">Page not found (the module may have been unloaded).</p>} />
              </Routes>
            </AppFrame>
          </ModuleLibsProvider>
          </ShellNotifier>
        </ToastProvider>
      </RouterProvider>
      </AbExperiments>
      </DateSettingsProvider>
    </BrowserRouter>
  );
}
