import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ModulePage } from './ModulePage.js';
import type { LoadedModuleSummary } from './types.js';

// A page's $sources fetches live data from the module's
// own registerRoute()-registered endpoint, through the real fetcher + GenericPageRunner
// + real dsl-ui Badge component -- not a mocked/stubbed render.
describe('ModulePage (live data via $sources + fetcher)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches from the module-scoped route and renders the live value via a real dsl-ui component', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('/api/modules/module-c/greeting');
      return new Response(JSON.stringify({ message: 'hello-from-module-c' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const modules: LoadedModuleSummary[] = [
      {
        id: 'module-c',
        version: '1.0.0',
        extensionPoints: [
          {
            kind: 'page',
            slot: 'nav',
            label: 'Module C Page',
            view: {},
            rawYaml:
              '$sources:\n  greeting:\n    url: GET /api/modules/module-c/greeting\n\n$type: Badge\nlabel: $sources.greeting.message\nvariant: info\n',
          },
        ],
      },
    ];

    render(
      <MemoryRouter initialEntries={['/modules/module-c/0']}>
        <Routes>
          <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(await screen.findByText('hello-from-module-c')).toBeInTheDocument();
  });
});
