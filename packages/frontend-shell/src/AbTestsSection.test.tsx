import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbTestsSection } from './AbTestsSection.js';

const answer = (body: unknown, status = 200): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const inventory = {
  exact: 1,
  estimated: 7,
  total: 8,
  views: [{ moduleId: 'flow', id: 'flow-logs-design', label: 'Log view', where: 'page route /executions/:id/logs' }],
  components: [
    ...Array.from({ length: 5 }, (_, i) => ({ moduleId: 'flow', label: `Flow ${i}` })),
    ...Array.from({ length: 2 }, (_, i) => ({ moduleId: 'flow-chart', label: `Chart ${i}` })),
  ],
  unreadable: [],
};

describe('AbTestsSection', () => {
  it('counts the tests of all the modules, saying which part is exact and which is estimated, and where they are', async () => {
    answer(inventory);
    render(<AbTestsSection />);
    expect(await screen.findByText('8 (1 exact, 7 estimated)')).toBeInTheDocument();
    expect(screen.getByText('flow').nextSibling).toHaveTextContent('1 in views, 5 in code');
    expect(screen.getByText('flow-chart').nextSibling).toHaveTextContent('2 in code');
    expect(screen.getByText('8 (1 exact, 7 estimated)')).toHaveAttribute('title', expect.stringContaining('7 in module code (estimated'));
  });

  it('shows just the number when nothing is estimated', async () => {
    answer({ ...inventory, exact: 3, estimated: 0, total: 3, components: [], views: [{ moduleId: 'm', id: 'a', where: 'x' }] });
    render(<AbTestsSection />);
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('says there is none, and says which module it could not read instead of counting it as zero', async () => {
    answer({ exact: 0, estimated: 0, total: 0, views: [], components: [], unreadable: [] });
    const { unmount } = render(<AbTestsSection />);
    expect(await screen.findByText('No A/B test declared.')).toBeInTheDocument();
    unmount();

    answer({ exact: 0, estimated: 0, total: 0, views: [], components: [], unreadable: [{ moduleId: 'broken', reason: 'cannot read x' }] });
    render(<AbTestsSection />);
    expect(await screen.findByText(/broken: components not read, its tests are not counted \(cannot read x\)/)).toBeInTheDocument();
    expect(screen.queryByText('No A/B test declared.')).not.toBeInTheDocument();
  });

  it('says why it cannot count, with the way out when the server is older', async () => {
    answer({ error: 'not-found' }, 404);
    render(<AbTestsSection />);
    const message = await screen.findByText(/Cannot count the A\/B tests/);
    expect(within(message.parentElement as HTMLElement).getByText(/answered 404 \(this server is older than this frontend: update app-core\)/)).toBeInTheDocument();
  });
});
