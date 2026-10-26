import { fireEvent, render, screen, within } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionsMenu } from './VersionsMenu.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

const buildInfo = {
  builtAt: '2026-10-18T09:00:00.000Z',
  appCore: '2026.10.18-030-abcdef12',
  commit: 'abcdef12',
  dslUi: '2026.10.17-095-7b2c28f1',
  dslRenderer: '2026.10.17-095-7b2c28f1',
  react: '19.3.0',
  reactDom: '19.3.0',
  reactRouterDom: '7.18.4',
};

const modules: LoadedModuleSummary[] = [
  { id: 'queue', version: '2026.10.14-108-af4cf005', extensionPoints: [] },
  { id: 'orchestrator', version: '2026.10.17-424-0a1b2c3d', extensionPoints: [] },
];

const failed: FailedModuleSummary[] = [
  { id: 'ghost', source: '/x/manifest.json', error: 'ENOENT', failedAt: '2026-10-18T09:00:00.000Z' },
  // Still loaded (a failed update): listed once, with its running version.
  { id: 'queue', source: '/y/manifest.json', error: 'bad yaml', failedAt: '2026-10-18T09:00:00.000Z' },
];

function stubBuildInfo(response: Response): void {
  vi.stubGlobal('fetch', vi.fn(async () => response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VersionsMenu', () => {
  it('shows nothing until opened, then app-core, each module version and the frontend libraries', async () => {
    stubBuildInfo(new Response(JSON.stringify(buildInfo), { status: 200, headers: { 'content-type': 'application/json' } }));
    render(<VersionsMenu modules={modules} failed={failed} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    const dialog = await screen.findByRole('dialog');

    expect(await within(dialog).findByText('2026.10.18-030-abcdef12 (abcdef12)')).toBeInTheDocument();
    expect(within(dialog).getByText('queue').nextSibling).toHaveTextContent('2026.10.14-108-af4cf005');
    expect(within(dialog).getByText('orchestrator').nextSibling).toHaveTextContent('2026.10.17-424-0a1b2c3d');
    expect(within(dialog).getByText('ghost').nextSibling).toHaveTextContent('failed to load');
    expect(within(dialog).getAllByText('queue')).toHaveLength(1);
    expect(within(dialog).getAllByText('2026.10.17-095-7b2c28f1')).toHaveLength(2);
    expect(within(dialog).getByText('19.3.0')).toBeInTheDocument();
  });

  it('says so, with the reason, when the build information cannot be read', async () => {
    stubBuildInfo(new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    render(<VersionsMenu modules={modules} failed={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/unknown \(/)).toBeInTheDocument();
    expect(within(dialog).getByText('queue').nextSibling).toHaveTextContent('2026.10.14-108-af4cf005');
  });

  it('reports when no module is installed', async () => {
    stubBuildInfo(new Response(JSON.stringify(buildInfo), { status: 200 }));
    render(<VersionsMenu modules={[]} failed={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    expect(await screen.findByText('No module installed.')).toBeInTheDocument();
  });

  // Tests run with NODE_ENV=test (not development): the host decides, as with `serve --ab-tests`.
  it.each([
    { enabled: true, shown: true },
    { enabled: false, shown: false },
  ])('says whether the A/B tests are on (host enabled: $enabled)', async ({ enabled, shown }) => {
    stubBuildInfo(new Response(JSON.stringify(buildInfo), { status: 200 }));
    render(
      <AbExperiments enabled={enabled}>
        <VersionsMenu modules={modules} failed={[]} />
      </AbExperiments>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/A\/B tests are on/) !== null).toBe(shown);
  });

  it('says nothing about A/B tests without a host', async () => {
    stubBuildInfo(new Response(JSON.stringify(buildInfo), { status: 200 }));
    render(<VersionsMenu modules={modules} failed={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/A\/B tests/)).not.toBeInTheDocument();
  });
});
