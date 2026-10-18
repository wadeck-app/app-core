// Imported here (not via @import inside a plain .css file): Vite resolves a
// bare `@wadeck-app/dsl-ui` specifier through the package's exports map, which
// a plain CSS @import cannot do -- it would fail with `Missing "./theme.css"
// specifier`. Must come before any of app-core's own styles so the shared
// palette layers underneath, not on top.
import '@wadeck-app/dsl-ui/theme.css';
import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const root = document.getElementById('root');
if (!root) {
  throw new Error('#root element not found');
}

// Layout comparison page, dev server only (dynamic import: absent from the production bundle).
if (import.meta.env.DEV && window.location.pathname.startsWith('/__layout-lab')) {
  void Promise.all([import('react-router-dom'), import('./layout/LayoutLab.js')]).then(([{ BrowserRouter }, { LayoutLab }]) => {
    createRoot(root).render(
      <BrowserRouter>
        <LayoutLab />
      </BrowserRouter>,
    );
  });
} else {
  createRoot(root).render(<App />);
}
