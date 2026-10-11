import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Dashboard } from './Dashboard.js';
import { ModulePage } from './ModulePage.js';
import { useModules } from './useModules.js';

export default function App(): React.ReactElement {
  const { data, error } = useModules();
  const modules = data?.modules ?? [];

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar modules={modules} />
        <main style={{ flex: 1, padding: '1rem' }}>
          {error ? <p role="alert">Failed to load modules: {String(error)}</p> : null}
          <Routes>
            <Route path="/" element={<Dashboard modules={modules} />} />
            <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
