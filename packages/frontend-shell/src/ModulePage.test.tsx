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

// The width classes of every frame around the text shown: the host's own, then the view's.
function capsAround(text: string): string[] {
  const caps: string[] = [];
  for (let el: HTMLElement | null = screen.getByText(text); el !== null; el = el.parentElement) {
    const cap = [...el.classList].find((c) => c.startsWith('max-w-'));
    if (cap !== undefined) caps.push(cap);
  }
  return caps;
}

describe('ModulePage width', () => {
  const page = (view: Record<string, unknown>, rawYaml: string): LoadedModuleSummary[] => [
    { id: 'wide', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Wide', view, rawYaml }] },
  ];
  const show = (modules: LoadedModuleSummary[]): void => {
    render(
      <MemoryRouter initialEntries={['/modules/wide/0']}>
        <Routes>
          <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('does not cap a view that sets maxWidth: full (the host adds no second cap)', async () => {
    const yaml = '$type: PageContent\nmaxWidth: full\nsections:\n  - $type: Badge\n    label: wide-page\n';
    show(page({ $type: 'PageContent', maxWidth: 'full' }, yaml));
    await screen.findByText('wide-page');
    expect(capsAround('wide-page')).toEqual(['max-w-full', 'max-w-full']);
  });

  it('keeps the default width of a view with a PageContent root that sets none', async () => {
    const yaml = '$type: PageContent\nsections:\n  - $type: Badge\n    label: default-page\n';
    show(page({ $type: 'PageContent' }, yaml));
    await screen.findByText('default-page');
    expect(capsAround('default-page')).toEqual(['max-w-6xl', 'max-w-full']);
  });

  it('keeps the host frame at its default width for a view whose root is not a PageContent', async () => {
    show(page({ $type: 'Badge', label: 'plain-page' }, '$type: Badge\nlabel: plain-page\nvariant: info\n'));
    await screen.findByText('plain-page');
    expect(capsAround('plain-page')).toEqual(['max-w-6xl']);
  });
});
