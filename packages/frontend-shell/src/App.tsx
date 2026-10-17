import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RouterProvider } from '@wadeck-app/dsl-ui';
import { AppNavBar } from './NavBar.js';
import { Dashboard } from './Dashboard.js';
import { ModulePage } from './ModulePage.js';
import { useModules } from './useModules.js';

export default function App(): React.ReactElement {
  const { data, error } = useModules();
  const modules = data?.modules ?? [];
  const failedModules = data?.failed ?? [];

  return (
    <BrowserRouter>
      {/* Provides UrlParamContext/RouterContext: module views bind components to URL params (e.g. Pagination `urlParam`). */}
      <RouterProvider>
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
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Routes>
            <Route path="/" element={<Dashboard modules={modules} />} />
            <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
          </Routes>
        </div>
      </RouterProvider>
    </BrowserRouter>
  );
}
