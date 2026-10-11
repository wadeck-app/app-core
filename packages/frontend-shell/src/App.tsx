import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppNavBar } from './NavBar.js';
import { Dashboard } from './Dashboard.js';
import { ModulePage } from './ModulePage.js';
import { useModules } from './useModules.js';

export default function App(): React.ReactElement {
  const { data, error } = useModules();
  const modules = data?.modules ?? [];

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg">
        <AppNavBar modules={modules} />
        {error ? (
          <p role="alert" className="px-4 py-3 text-danger">
            Failed to load modules: {String(error)}
          </p>
        ) : null}
        <Routes>
          <Route path="/" element={<Dashboard modules={modules} />} />
          <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
