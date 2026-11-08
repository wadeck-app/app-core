import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ModulesPage } from './ModulesPage.js';
import { modulesViewData } from './modulesView.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

const ep = (kind: string, slot: string, extra: Record<string, unknown> = {}) => ({ kind, slot, view: {}, rawYaml: '', ...extra });

const modules: LoadedModuleSummary[] = [
  {
    id: 'project',
    version: '2026.10.31-026',
    title: 'Project',
    exposedSlots: ['project-panels'],
    optionalRequires: { task: '*', queue: '^1.0.0' },
    warnings: ['extensionPoints[1] (slot "queue:project-header") is inactive: optional module "queue" is not available: module "queue" is not loaded'],
    extensionPoints: [ep('page', 'nav', { label: 'Projects' }), ep('page', 'route', { path: '/p/:project' }), ep('widget', 'task:project-header')] as LoadedModuleSummary['extensionPoints'],
  },
  {
    id: 'task',
    version: '2026.10.31-115',
    requires: { project: '*' },
    dslLib: { entryUrl: '/x' },
    extensionPoints: [ep('page', 'nav', { label: 'Tasks' })] as LoadedModuleSummary['extensionPoints'],
  },
];

const failed: FailedModuleSummary[] = [
  { id: 'queue', source: 'mods/queue/manifest.json', error: 'module "queue" cannot load: requires "orch", which is not loaded', failedAt: '2026-10-31T10:00:00Z', cause: 'requirement' },
  { id: 'task', source: 'mods/task/manifest.json', error: 'setup threw', failedAt: '2026-10-31T10:05:00Z', cause: 'error' },
];

describe('modulesViewData', () => {
  it('counts what is loaded, failed and with warnings', () => {
    expect(modulesViewData(modules, failed)).toMatchObject({ loaded: 2, failedCount: 2, warningCount: 1, hasFailed: true, hasWarnings: true });
    expect(modulesViewData(modules, [])).toMatchObject({ hasFailed: false });
    expect(modulesViewData([modules[1]!], [])).toMatchObject({ hasWarnings: false, warningCount: 0 });
  });

  it('tells what each module needs, can do without (and what is not loaded), offers, is needed by and brings', () => {
    const rows = modulesViewData(modules, []).installedRows;
    expect(rows[0]).toEqual({
      title: 'Project',
      href: '/modules/project',
      version: '2026.10.31-026',
      needs: '-',
      optional: 'task *, queue ^1.0.0 (not loaded)',
      offers: 'project:project-panels',
      neededBy: 'task',
      brings: '2 pages, 1 widget',
    });
    expect(rows[1]).toMatchObject({ title: 'task', needs: 'project *', optional: '-', offers: '-', neededBy: 'project', brings: '1 page, components' });
  });

  it('counts the components of a module once its bundle is loaded, and says when that is not known yet', () => {
    const brings = (count: Parameters<typeof modulesViewData>[2] extends ((id: string) => infer R) | undefined ? R : never): string =>
      modulesViewData(modules, [], (id) => (id === 'task' ? count : undefined)).installedRows[1]!.brings;
    expect(brings(3)).toBe('1 page, 3 components');
    expect(brings(1)).toBe('1 page, 1 component');
    expect(brings('loading')).toBe('1 page, components (loading)');
    expect(brings('error')).toBe('1 page, components (failed to load)');
  });

  it('says what to do about a failure according to its cause, and notes a previous version that still runs', () => {
    const rows = modulesViewData(modules, failed).failedRows;
    expect(rows[0]).toMatchObject({ module: 'queue', cause: 'Retried by itself' });
    expect(rows[1]).toMatchObject({ module: 'task', cause: 'Needs a fix' });
    expect(rows[0]?.error).not.toContain('previous version');
    expect(rows[1]?.error).toContain('The previous version is still running.');
  });

  it('gives each warning its module and the address of that module', () => {
    expect(modulesViewData(modules, []).warningRows).toEqual([{ module: 'project', href: '/modules/project', warning: expect.stringContaining('queue:project-header') }]);
  });
});

const renderPage = (loaded = modules, bad: FailedModuleSummary[] = []) =>
  render(
    <MemoryRouter>
      <ModulesPage modules={loaded} failed={bad} />
    </MemoryRouter>,
  );

// The page is a view of the same kind as the module pages: it is rendered by the real renderer with the real components.
describe('ModulesPage', () => {
  it('shows the counts as tiles and the installed modules in a table, like the other pages', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Modules' })).toBeInTheDocument();
    expect(screen.getByText('Loaded')).toBeInTheDocument();
    expect(screen.getByText('With warnings')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Project' });
    const projectRow = link.closest('tr') as HTMLElement;
    expect(projectRow).toHaveTextContent('task *, queue ^1.0.0 (not loaded)');
    expect(projectRow).toHaveTextContent('project:project-panels');
    expect(link).toHaveAttribute('href', '/modules/project');
  });

  it('shows the failures and the warnings in their own sections, and none when there is nothing to report', async () => {
    const { unmount } = renderPage(modules, failed);
    const failedSection = within(await screen.findByRole('region', { name: 'Failed to load' }));
    expect(failedSection.getByText(/requires "orch", which is not loaded/)).toBeInTheDocument();
    expect(failedSection.getByText('Retried by itself')).toBeInTheDocument();
    expect(failedSection.getByText('Needs a fix')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Warnings' })).getByText(/queue:project-header/)).toBeInTheDocument();
    unmount();

    renderPage([{ id: 'plain', version: '1', extensionPoints: [ep('page', 'nav')] as LoadedModuleSummary['extensionPoints'] }]);
    await screen.findByRole('heading', { name: 'Modules' });
    await waitFor(() => expect(screen.getByText('plain')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Failed to load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Warnings' })).not.toBeInTheDocument();
  });

  it('says no module is loaded', async () => {
    renderPage([]);
    expect(await screen.findByText('No module is loaded.')).toBeInTheDocument();
  });
});
