import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModulePage } from './ModulePage.js';
import type { LoadedModuleSummary } from './types.js';

// The real failure that blanked the whole app: dsl-ui's SearchBar threw when it had neither "urlParam" nor "value" and "onChange"
// (the showcase page of the table). Since dsl-ui 396 each node has its own boundary, so what reaches the page boundary is what throws
// outside a node (the runner itself, the compiler): the view runner is replaced by one that throws, to stand for it.
const BROKEN = 'broken';
const FINE = 'fine';
const RUNNER_ERROR = 'the runner could not compile this view: unexpected token';

vi.mock('./ModuleView.js', () => ({
  ModuleView: ({ rawYaml }: { rawYaml: string }) => {
    if (rawYaml === 'broken') {
      throw new Error('the runner could not compile this view: unexpected token');
    }
    return <span>all-good</span>;
  },
}));

const modules: LoadedModuleSummary[] = [
  {
    id: 'showcase',
    version: '1.0.0',
    extensionPoints: [
      { kind: 'page', slot: 'nav', label: 'Table', path: '/table', view: {}, rawYaml: BROKEN },
      { kind: 'page', slot: 'nav', label: 'Badge', path: '/badge', view: {}, rawYaml: FINE },
    ],
  },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <nav>
        <Link to="/modules/showcase/badge">go to the good page</Link>
        <Link to="/modules/showcase/table">go to the broken page</Link>
      </nav>
      <Routes>
        <Route path="/modules/showcase/table" element={<ModulePage modules={modules} target={{ moduleId: 'showcase', path: '/table' }} />} />
        <Route path="/modules/showcase/badge" element={<ModulePage modules={modules} target={{ moduleId: 'showcase', path: '/badge' }} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // React logs the error it caught, and the boundary logs it too: the test is about what the user sees.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('a page whose view throws', () => {
  it('shows what failed, where, and what to do, in place of the page, and keeps what is around it', () => {
    renderAt('/modules/showcase/table');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This page failed to render');
    expect(alert).toHaveTextContent('"Table"');
    expect(alert).toHaveTextContent('"showcase"');
    // The message of the error itself, so the author knows what to fix.
    expect(alert).toHaveTextContent(RUNNER_ERROR);
    expect(alert).toHaveTextContent(/rest of app-core still works/i);
    // Everything around the page is still there (the navigation of the test stands for the shell).
    expect(screen.getByRole('link', { name: 'go to the good page' })).toBeInTheDocument();
  });

  it('writes the error and its component stack to the console, prefixed so it can be found', () => {
    renderAt('/modules/showcase/table');
    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('[app-core] the page "Table" of module "showcase" threw');
  });

  it('recovers when the user goes to another page, and fails again, on its own, when coming back', () => {
    renderAt('/modules/showcase/table');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'go to the good page' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('all-good')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'go to the broken page' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This page failed to render');
  });

  it('offers "Try again", which renders the page again (the same error here, shown again, not a crash)', () => {
    renderAt('/modules/showcase/table');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This page failed to render');
  });
});
