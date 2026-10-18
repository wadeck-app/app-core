import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { registerModuleEntries, unregisterModuleEntries } from './registry.js';
import type { LoadedModuleSummary } from './types.js';

const state = vi.hoisted((): { modules: LoadedModuleSummary[] } => ({ modules: [] }));

vi.mock('./useModules.js', () => ({
  useModules: () => ({ error: undefined, data: { modules: state.modules } }),
}));

const badge = (label: string): string => `$type: Badge\nlabel: ${label}\n`;

function widgetModule(id: string, label: string, order?: number): LoadedModuleSummary {
  return {
    id,
    version: '1.0.0',
    extensionPoints: [
      { kind: 'widget', slot: 'navbar', view: {}, rawYaml: badge(`nav-${label}`), order },
      { kind: 'widget', slot: 'overlay', view: {}, rawYaml: badge(`overlay-${label}`) },
      { kind: 'page', slot: 'nav', label: `Page ${label}`, view: {}, rawYaml: badge(`page-${label}`) },
    ],
  };
}

const navbar = (): HTMLElement => screen.getByRole('banner');
const widgetElements = (): NodeListOf<Element> => document.querySelectorAll('[data-module-widget]');

describe('App: navbar and overlay widgets of modules', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    unregisterModuleEntries('boom');
    vi.restoreAllMocks();
  });

  it('renders the navbar widgets in the navbar and the overlay widgets at the root, on every route', async () => {
    state.modules = [widgetModule('a', 'a', 2), widgetModule('b', 'b', 1)];
    for (const url of ['/', '/modules/a/0', '/modules/b/0', '/nowhere']) {
      window.history.pushState({}, '', url);
      const { unmount } = render(<App />);
      expect(await within(navbar()).findByText('nav-a')).toBeInTheDocument();
      expect(within(navbar()).getByText('nav-b')).toBeInTheDocument();
      expect(await screen.findByText('overlay-a')).toBeInTheDocument();
      expect(screen.getByText('overlay-b')).toBeInTheDocument();
      expect(within(navbar()).queryByText('overlay-a')).toBeNull();
      unmount();
    }
  });

  it('orders navbar widgets by order, ahead of the theme toggle', async () => {
    state.modules = [widgetModule('a', 'a', 2), widgetModule('b', 'b', 1)];
    render(<App />);
    const first = await within(navbar()).findByText('nav-b');
    const second = within(navbar()).getByText('nav-a');
    const toggle = within(navbar()).getByRole('button', { name: /Switch to (dark|light) mode/ });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders no widget wrapper when no module declares these slots', () => {
    state.modules = [{ id: 'plain', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'P', view: {}, rawYaml: badge('p') }] }];
    render(<App />);
    expect(widgetElements()).toHaveLength(0);
    // The module is in the navigation under its title (derived from the id: "plain" -> "Plain").
    expect(within(navbar()).getByRole('link', { name: 'Plain' })).toBeInTheDocument();
  });

  it('removes the widgets when the module disappears', async () => {
    state.modules = [widgetModule('a', 'a')];
    const { rerender } = render(<App />);
    expect(await screen.findByText('overlay-a')).toBeInTheDocument();

    state.modules = [];
    rerender(<App />);
    expect(screen.queryByText('overlay-a')).toBeNull();
    expect(screen.queryByText('nav-a')).toBeNull();
    expect(widgetElements()).toHaveLength(0);
  });

  it('isolates a widget that throws: the other widgets and the page keep working, the module is named', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerModuleEntries('boom', [
      {
        name: 'Throw',
        category: 'atomic',
        tags: [],
        render: () => {
          throw new Error('kaboom');
        },
      },
    ]);
    state.modules = [
      widgetModule('a', 'a'),
      {
        id: 'boom',
        version: '1.0.0',
        extensionPoints: [
          { kind: 'widget', slot: 'navbar', view: {}, rawYaml: '$type: boom:Throw\n' },
          { kind: 'widget', slot: 'overlay', view: {}, rawYaml: '$type: boom:Throw\n' },
        ],
      },
    ];

    render(<App />);

    expect(await within(navbar()).findByText('boom: widget error')).toBeInTheDocument();
    expect(screen.getAllByText('boom: widget error')).toHaveLength(2);
    expect(within(navbar()).getByText('nav-a')).toBeInTheDocument();
    expect(screen.getByText('overlay-a')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(logged.mock.calls.some((call) => String(call[0]).includes('"boom"'))).toBe(true);
  });
});
