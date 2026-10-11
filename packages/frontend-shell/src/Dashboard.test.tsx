import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { Dashboard } from './Dashboard.js';
import type { LoadedModuleSummary } from './types.js';

// Decision #28: widgets render through GenericPageRunner (same as pages), so
// even a plain static widget now goes through dsl-renderer's source-loading
// pipeline -- assertions must be async-safe (findBy/waitFor), not sync getBy.
// GenericPageRunner also calls react-router's useSearchParams internally, so
// every render needs a Router context, same as ModulePage.test.tsx.
function renderDashboard(modules: LoadedModuleSummary[]) {
  return render(
    <MemoryRouter>
      <Dashboard modules={modules} />
    </MemoryRouter>,
  );
}

describe('Dashboard (base slot: widget/dashboard -> grid, frontend-shell.md)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a widget extensionPoint via GenericPageRunner with real fixture-shaped data', async () => {
    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-a',
        version: '1.0.0',
        extensionPoints: [
          { kind: 'widget', slot: 'dashboard', label: 'Fixture A Widget', view: { $type: 'Badge', label: 'fixture-a' }, rawYaml: '$type: Badge\nlabel: fixture-a\n' },
        ],
      },
    ];
    renderDashboard(modules);
    expect(screen.getByText('Fixture A Widget')).toBeInTheDocument();
    expect(await screen.findByText('fixture-a')).toBeInTheDocument();
  });

  it('ignores non-widget/dashboard extensionPoints (e.g. page/nav)', () => {
    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-b',
        version: '1.0.0',
        extensionPoints: [
          { kind: 'page', slot: 'nav', label: 'Fixture B Page', view: { $type: 'Badge', label: 'fixture-b-page' }, rawYaml: '$type: Badge\nlabel: fixture-b-page\n' },
        ],
      },
    ];
    renderDashboard(modules);
    expect(screen.queryByText('fixture-b-page')).not.toBeInTheDocument();
    expect(screen.getByText('No widgets registered yet.')).toBeInTheDocument();
  });

  it('shows an unknown-component alert for an unregistered $type (DslRenderer built-in behavior)', async () => {
    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-x',
        version: '1.0.0',
        extensionPoints: [{ kind: 'widget', slot: 'dashboard', view: { $type: 'NotARealComponent' }, rawYaml: '$type: NotARealComponent\n' }],
      },
    ];
    renderDashboard(modules);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unknown component type'));
  });

  it('fetches from a widget-scoped route and renders the live value (Decision #28 end-to-end)', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/modules/module-d/count');
      return new Response(JSON.stringify({ count: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-d',
        version: '1.0.0',
        extensionPoints: [
          {
            kind: 'widget',
            slot: 'dashboard',
            label: 'Fixture D Widget',
            view: {},
            rawYaml:
              '$sources:\n  stats:\n    url: GET /api/modules/module-d/count\n\n$type: Badge\nlabel: $sources.stats.count\nvariant: info\n',
          },
        ],
      },
    ];

    renderDashboard(modules);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText('42')).toBeInTheDocument();
  });
});
