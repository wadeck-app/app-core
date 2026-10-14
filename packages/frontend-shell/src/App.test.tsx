import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: {
      modules: [
        {
          id: 'module-p',
          version: '1.0.0',
          extensionPoints: [
            {
              kind: 'page',
              slot: 'nav',
              label: 'Paged',
              view: {},
              rawYaml: '$type: Pagination\nurlParam: page\ntotal: 100\nsize: 10\n',
            },
          ],
        },
      ],
    },
  }),
}));

// A module view can bind a component to a URL search param (Pagination `urlParam`); that only
// works if the shell provides UrlParamContext. Rendered through the real App + real dsl-ui.
describe('App (URL-param-backed components in module views)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/modules/module-p/0?page=1');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('reads the page from the URL and writes it back when paging', () => {
    render(<App />);
    expect(screen.getByText('Page 2 / 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByText('Page 3 / 10')).toBeInTheDocument();
    expect(window.location.search).toBe('?page=2');
  });
});
