import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: {
      modules: [
        {
          id: 'home-mod',
          version: '1.0.0',
          extensionPoints: [
            { kind: 'page', slot: 'nav', path: '/', label: 'Home', view: {}, rawYaml: '$type: Badge\nlabel: home-page\n' },
            { kind: 'page', slot: 'nav', path: '/other', label: 'Other', view: {}, rawYaml: '$type: Badge\nlabel: other-page\n' },
          ],
        },
        {
          id: 'jobs-mod',
          version: '1.0.0',
          extensionPoints: [
            { kind: 'page', slot: 'nav', label: 'Jobs list', view: {}, rawYaml: '$type: Badge\nlabel: list-page\n' },
            { kind: 'page', slot: 'route', path: '/jobs/:id', label: 'Job detail', view: {}, rawYaml: '$type: Badge\nlabel: $route.id\n' },
            { kind: 'page', slot: 'route', path: '/jobs/:id/logs', view: {}, rawYaml: '$type: Badge\nlabel: $route.id\n' },
          ],
        },
      ],
    },
  }),
}));

// A page that declares a `path` is mounted on its own route, so the view receives the route params.
describe('App: parameterised module pages', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('mounts /modules/<id><path> and resolves $route.<param>', async () => {
    window.history.pushState({}, '', '/modules/jobs-mod/jobs/42');
    render(<App />);
    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('mounts nested route paths too', async () => {
    window.history.pushState({}, '', '/modules/jobs-mod/jobs/7/logs');
    render(<App />);
    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  it('mounts a page declared with path "/" as the module home, with and without a trailing slash', async () => {
    window.history.pushState({}, '', '/modules/home-mod');
    const first = render(<App />);
    expect(await screen.findByText('home-page')).toBeInTheDocument();
    first.unmount();

    window.history.pushState({}, '', '/modules/home-mod/');
    render(<App />);
    expect(await screen.findByText('home-page')).toBeInTheDocument();
  });

  it('highlights the module home link only on the home page, not on the module\'s other pages', async () => {
    window.history.pushState({}, '', '/modules/home-mod/other');
    render(<App />);
    expect(await screen.findByText('other-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Other' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the legacy index route for nav pages', async () => {
    window.history.pushState({}, '', '/modules/jobs-mod/0');
    render(<App />);
    expect(await screen.findByText('list-page')).toBeInTheDocument();
  });

  it('says so when a route no longer exists (for example after its module was unloaded)', async () => {
    window.history.pushState({}, '', '/modules/gone-mod/items/1');
    render(<App />);
    expect(await screen.findByText(/Page not found/)).toBeInTheDocument();
  });

  it('lists only nav pages in the navbar, not route-only pages', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Jobs list' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Job detail' })).toBeNull();
    // Dashboard + the three nav pages (Home, Other, Jobs list); the two route-only pages are absent.
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
});
