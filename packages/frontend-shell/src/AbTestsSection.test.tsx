import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbTestsSection } from './AbTestsSection.js';

const answer = (body: unknown, status = 200): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
};
const renderSection = () =>
  render(
    <MemoryRouter>
      <AbTestsSection />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

const inventory = {
  exact: 1,
  estimated: 7,
  total: 8,
  views: [{ moduleId: 'flow', id: 'flow-logs-design', label: 'Log view', where: 'page route /executions/:id/logs', point: { moduleId: 'flow', index: 3, kind: 'page', slot: 'route' } }],
  components: [
    ...Array.from({ length: 5 }, (_, i) => ({ moduleId: 'flow', label: `Flow ${i}` })),
    ...Array.from({ length: 2 }, (_, i) => ({ moduleId: 'flow-chart', label: `Chart ${i}` })),
  ],
  componentUse: {},
  unreadable: [],
};

describe('AbTestsSection (in the versions popup)', () => {
  it('gives the number, saying which part is exact and which is estimated, and links to the page that lists them', async () => {
    answer(inventory);
    renderSection();
    const count = await screen.findByText('8 (1 exact, 7 estimated)');
    expect(count).toHaveAttribute('title', expect.stringContaining('7 in module code (estimated'));
    expect(screen.getByRole('link', { name: 'List them and see where to find them' })).toHaveAttribute('href', '/ab-tests');
  });

  it('shows just the number when nothing is estimated', async () => {
    answer({ ...inventory, exact: 3, estimated: 0, total: 3, components: [] });
    renderSection();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('names a module it could not read instead of counting it as zero', async () => {
    answer({ ...inventory, exact: 0, estimated: 0, total: 0, views: [], components: [], unreadable: [{ moduleId: 'broken', reason: 'cannot read x' }] });
    renderSection();
    expect(await screen.findByText(/broken: components not read, its tests are not counted \(cannot read x\)/)).toBeInTheDocument();
  });

  it('says why it cannot count, with the way out when the server is older', async () => {
    answer({ error: 'not-found' }, 404);
    renderSection();
    expect(await screen.findByText(/answered 404 \(this server is older than this frontend: update app-core\)/)).toBeInTheDocument();
  });
});
