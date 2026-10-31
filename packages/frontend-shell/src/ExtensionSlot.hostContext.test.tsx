import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenericPageRunner, type Fetcher } from '@wadeck-app/dsl-renderer';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { appRegistry } from './registry.js';

// What a view contributed to a slot can read. The nodes of `GET /api/slots/:slotId` are rendered by the ExtensionSlot of the
// HOST page with the host's data context (dsl-renderer, DslRenderer.js renderExtensionSlot -> renderChildren(items, registry, ctx)).
// The fetcher is a stub: the point is the context, not the network.
const HOST = [
  '$sources:',
  '  project:',
  '    url: "GET /host/project"',
  '  panels:',
  '    url: "GET /api/slots/project:project-panels"',
  '',
  '$type: ExtensionSlot',
  'items: $sources.panels',
  '',
].join('\n');

function renderHost(panels: unknown[], extra: Record<string, unknown> = {}) {
  const fetcher: Fetcher = vi.fn(async (url: string) => {
    if (url === 'GET /host/project') {
      return { id: 'p-42', name: 'Demo project' };
    }
    if (url === 'GET /api/slots/project:project-panels') {
      return panels;
    }
    if (url in extra) {
      return extra[url];
    }
    throw new Error(`unexpected request ${url}`);
  });
  render(
    <MemoryRouter initialEntries={['/modules/project/p/42']}>
      <Routes>
        <Route path="/modules/project/p/:project" element={<GenericPageRunner yamlText={HOST} registry={appRegistry} fetcher={fetcher} />} />
      </Routes>
    </MemoryRouter>,
  );
  return fetcher;
}

describe('a view contributed to a slot, in the context of the host page', () => {
  it('reads the data the host page loaded ($sources.project.name)', async () => {
    renderHost([{ $type: 'Badge', label: '$sources.project.name' }]);
    expect(await screen.findByText('Demo project')).toBeInTheDocument();
  });

  it('reads the route parameter of the host page ($route.project), also on a page mounted at /modules/<id>/p/:project', async () => {
    renderHost([{ $type: 'Badge', label: '$route.project' }]);
    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  // A fact to know, pinned here: only a PAGE declares $sources. The key on a contributed node is not read, nothing is fetched and
  // nothing is shown, without an error. A contribution gets data from the host's sources, from the route, or from a dsl-lib
  // component of its own module that fetches by itself.
  it('does not load a $sources declared on the contributed node itself', async () => {
    const fetcher = renderHost(
      [{ $type: 'Badge', label: '$sources.related.title', $sources: { related: { url: 'GET /api/modules/task/related' } } }],
      { 'GET /api/modules/task/related': { title: 'Tasks of the project' } },
    );
    const asked = (): unknown[] => (fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    // The slot answer arrived and was rendered; then see what else was asked.
    await waitFor(() => expect(asked()).toContain('GET /api/slots/project:project-panels'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(asked()).not.toContain('GET /api/modules/task/related');
    expect(screen.queryByText('Tasks of the project')).not.toBeInTheDocument();
  });
});
