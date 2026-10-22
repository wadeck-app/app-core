import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@wadeck-app/dsl-ui';
import { describe, expect, it } from 'vitest';
import { ModulePage } from './ModulePage.js';
import type { LoadedModuleSummary } from './types.js';

// Two pages with a static path and no route parameter: the shell mounts both with the same <ModulePage> element, and the
// renderer keys its page runner on the route params only ("{}" for both). Going from one to the other in the browser must
// still start the second page from its own state: its $vars defaults, not the ones of the page just left.
const modules: LoadedModuleSummary[] = [
  {
    id: 'm',
    version: '1.0.0',
    extensionPoints: [
      { kind: 'page', slot: 'nav', path: '/a', label: 'A', view: {}, rawYaml: '$vars:\n  search: ""\n$type: Badge\nlabel: page-a\n' },
      { kind: 'page', slot: 'nav', path: '/b', label: 'B', view: {}, rawYaml: '$vars:\n  search: "from-b"\n$type: Badge\nlabel: $vars.search\n' },
    ],
  },
];

function renderApp(start: string) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ToastProvider>
        <nav>
          <Link to="/modules/m/a">go to A</Link>
          <Link to="/modules/m/b">go to B</Link>
        </nav>
        <Routes>
          <Route path="/modules/m/a" element={<ModulePage modules={modules} target={{ moduleId: 'm', path: '/a' }} />} />
          <Route path="/modules/m/b" element={<ModulePage modules={modules} target={{ moduleId: 'm', path: '/b' }} />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ModulePage: going from one page to another without a route parameter', () => {
  it('starts the second page with its own $vars defaults (as a direct load does)', async () => {
    renderApp('/modules/m/b');
    expect(await screen.findByText('from-b')).toBeInTheDocument();
  });

  it('starts the second page with its own $vars defaults after a client-side navigation from the first', async () => {
    renderApp('/modules/m/a');
    expect(await screen.findByText('page-a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'go to B' }));
    expect(await screen.findByText('from-b')).toBeInTheDocument();
  });

  it('and back again', async () => {
    renderApp('/modules/m/b');
    expect(await screen.findByText('from-b')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'go to A' }));
    expect(await screen.findByText('page-a')).toBeInTheDocument();
  });
});
