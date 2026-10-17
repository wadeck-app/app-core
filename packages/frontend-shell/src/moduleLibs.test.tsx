import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModulePage } from './ModulePage.js';
import { appRegistry, registerModuleEntries, unregisterModuleEntries } from './registry.js';
import { ensureSharedGlobals } from './sharedGlobals.js';
import { ModuleLibGate, ModuleLibsProvider, useModuleLibs, type LibImporter } from './useModuleLibs.js';
import type { LoadedModuleSummary } from './types.js';

function hello(text: string): ComponentRegistryEntry {
  return {
    name: 'Hello',
    category: 'atomic',
    tags: [],
    render: ({ node }) => (
      <span data-testid="hello">
        {text} {String(node['who'] ?? '')}
      </span>
    ),
  };
}

function moduleWithLib(id: string, entryUrl: string, cssUrl?: string): LoadedModuleSummary {
  return { id, version: '1.0.0', extensionPoints: [], dslLib: { entryUrl, cssUrl } };
}

afterEach(() => {
  unregisterModuleEntries('orchestrator');
  unregisterModuleEntries('other');
  document.head.querySelectorAll('link[data-module-lib]').forEach((el) => el.remove());
});

describe('shared singletons for module bundles', () => {
  it('publishes every documented package on globalThis.__APP_CORE_SHARED__ as the shell\'s own instances', async () => {
    await ensureSharedGlobals();
    const shared = globalThis.__APP_CORE_SHARED__;
    expect(Object.keys(shared ?? {}).sort()).toEqual(
      ['@wadeck-app/dsl-renderer', '@wadeck-app/dsl-ui', 'react', 'react-dom', 'react-dom/client', 'react-router-dom', 'react/jsx-runtime'],
    );
    expect(shared?.['react']).toBe(await import('react'));
    expect(shared?.['react-router-dom']).toBe(await import('react-router-dom'));
    expect(shared?.['@wadeck-app/dsl-ui']).toBe(await import('@wadeck-app/dsl-ui'));
    expect(shared?.['@wadeck-app/dsl-renderer']).toBe(await import('@wadeck-app/dsl-renderer'));
  });
});

describe('module registry entries', () => {
  it('registers entries under <moduleId>:<name>, replaces them and removes them', () => {
    registerModuleEntries('orchestrator', [hello('v1')]);
    expect(Object.keys(appRegistry)).toContain('orchestrator:Hello');
    expect(appRegistry['Hello']).toBeUndefined();

    registerModuleEntries('orchestrator', [{ ...hello('v2'), name: 'Other' }]);
    expect(appRegistry['orchestrator:Hello']).toBeUndefined();
    expect(appRegistry['orchestrator:Other']).toBeDefined();

    unregisterModuleEntries('orchestrator');
    expect(appRegistry['orchestrator:Other']).toBeUndefined();
  });

  it('keeps the built-in dsl-ui entries untouched', () => {
    const before = Object.keys(appRegistry).filter((k) => !k.includes(':')).length;
    registerModuleEntries('orchestrator', [hello('v1')]);
    unregisterModuleEntries('orchestrator');
    expect(Object.keys(appRegistry).filter((k) => !k.includes(':')).length).toBe(before);
  });
});

describe('useModuleLibs', () => {
  it('loads a module lib once per URL, registers its entries and injects its stylesheet', async () => {
    const importer = vi.fn<LibImporter>(async () => ({ default: [hello('v1')] }));
    const modules = [moduleWithLib('orchestrator', '/lib/a.mjs?v=1', '/lib/a.css?v=1')];
    const { result, rerender } = renderHook(({ list }) => useModuleLibs(list, importer), { initialProps: { list: modules } });

    expect(result.current['orchestrator']).toEqual({ state: 'loading' });
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('ready'));
    expect(appRegistry['orchestrator:Hello']).toBeDefined();
    expect(document.head.querySelector('link[data-module-lib="orchestrator"]')?.getAttribute('href')).toBe('/lib/a.css?v=1');

    rerender({ list: [...modules] });
    rerender({ list: [moduleWithLib('orchestrator', '/lib/a.mjs?v=1', '/lib/a.css?v=1')] });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('swaps components and stylesheet when the URL changes', async () => {
    const importer = vi.fn<LibImporter>(async (url) => ({ default: [hello(url.includes('v=2') ? 'v2' : 'v1')] }));
    const { result, rerender } = renderHook(({ list }) => useModuleLibs(list, importer), {
      initialProps: { list: [moduleWithLib('orchestrator', '/lib/a.mjs?v=1', '/lib/a.css?v=1')] },
    });
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('ready'));
    const firstGeneration = result.current['orchestrator'];

    rerender({ list: [moduleWithLib('orchestrator', '/lib/a.mjs?v=2', '/lib/a.css?v=2')] });
    await waitFor(() => expect(importer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current['orchestrator']).not.toEqual(firstGeneration));
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('ready'));

    const links = document.head.querySelectorAll('link[data-module-lib="orchestrator"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/lib/a.css?v=2');
  });

  it('drops entries, stylesheet and status when the module disappears', async () => {
    const importer = vi.fn<LibImporter>(async () => ({ default: [hello('v1')] }));
    const { result, rerender } = renderHook(({ list }) => useModuleLibs(list, importer), {
      initialProps: { list: [moduleWithLib('orchestrator', '/lib/a.mjs?v=1', '/lib/a.css?v=1')] },
    });
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('ready'));

    rerender({ list: [] });
    await waitFor(() => expect(result.current['orchestrator']).toBeUndefined());
    expect(appRegistry['orchestrator:Hello']).toBeUndefined();
    expect(document.head.querySelector('link[data-module-lib]')).toBeNull();
  });

  it('reports an import failure with the module id and URL', async () => {
    const importer: LibImporter = async () => {
      throw new Error('boom');
    };
    const { result } = renderHook(() => useModuleLibs([moduleWithLib('orchestrator', '/lib/a.mjs?v=1')], importer));
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('error'));
    const status = result.current['orchestrator'];
    expect(status?.state === 'error' ? status.message : '').toMatch(/module "orchestrator".*\/lib\/a\.mjs\?v=1.*boom/);
  });

  it('reports a bundle that does not default-export component entries', async () => {
    const importer: LibImporter = async () => ({ default: { not: 'an array' } });
    const { result } = renderHook(() => useModuleLibs([moduleWithLib('orchestrator', '/lib/a.mjs?v=1')], importer));
    await waitFor(() => expect(result.current['orchestrator']?.state).toBe('error'));
    const status = result.current['orchestrator'];
    expect(status?.state === 'error' ? status.message : '').toContain('default-export an array');
    expect(appRegistry['orchestrator:Hello']).toBeUndefined();
  });
});

describe('ModuleLibGate', () => {
  const gate = (statuses: React.ComponentProps<typeof ModuleLibsProvider>['value']) =>
    render(
      <ModuleLibsProvider value={statuses}>
        <ModuleLibGate moduleId="orchestrator">
          <p>content</p>
        </ModuleLibGate>
      </ModuleLibsProvider>,
    );

  it('shows a loading state, an alert on error, and the content when ready or when the module has no lib', () => {
    gate({ orchestrator: { state: 'loading' } }).unmount();
    expect(screen.queryByText('content')).toBeNull();

    const error = gate({ orchestrator: { state: 'error', message: 'it broke' } });
    expect(screen.getByRole('alert')).toHaveTextContent('it broke');
    error.unmount();

    gate({ orchestrator: { state: 'ready', generation: 1 } }).unmount();
    expect(screen.queryByText('content')).toBeNull();
    gate({});
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows the content when ready', () => {
    gate({ orchestrator: { state: 'ready', generation: 1 } });
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});

describe('a module component used from YAML as $type: <moduleId>:<Name>', () => {
  it('renders through the real GenericPageRunner and registry', async () => {
    registerModuleEntries('orchestrator', [hello('hi')]);
    const modules: LoadedModuleSummary[] = [
      {
        id: 'orchestrator',
        version: '1.0.0',
        extensionPoints: [
          { kind: 'page', slot: 'nav', label: 'P', view: {}, rawYaml: '$type: orchestrator:Hello\nwho: world\n' },
        ],
      },
    ];
    render(
      <MemoryRouter initialEntries={['/modules/orchestrator/0']}>
        <Routes>
          <Route path="/modules/:moduleId/:index" element={<ModulePage modules={modules} />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(await screen.findByTestId('hello')).toHaveTextContent('hi world');
  });
});
