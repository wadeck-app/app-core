import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ModulesPage } from './ModulesPage.js';
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
  { id: 'queue', source: 'C:/mods/queue/manifest.json', error: 'module "queue" cannot load: requires "orch", which is not loaded', failedAt: '2026-10-31T10:00:00Z', cause: 'requirement' },
  { id: 'task', source: 'C:/mods/task/manifest.json', error: 'setup threw', failedAt: '2026-10-31T10:05:00Z', cause: 'error' },
];

const renderPage = (loaded = modules, bad: FailedModuleSummary[] = []) =>
  render(
    <MemoryRouter>
      <ModulesPage modules={loaded} failed={bad} />
    </MemoryRouter>,
  );

describe('ModulesPage', () => {
  it('counts what is loaded, failed and with warnings', () => {
    renderPage(modules, failed);
    expect(screen.getByText(/loaded,/).textContent).toBe('2 loaded, 2 failed, 1 with warnings.');
  });

  it('tells what each module needs, can do without, offers and is needed by, and what it brings', () => {
    renderPage();
    const projectRow = screen.getByText('Project').closest('tr') as HTMLElement;
    const cells = within(projectRow).getAllByRole('cell');
    // Needs / can do without / offers / needed by / brings.
    expect(cells[2]).toHaveTextContent('nothing');
    expect(cells[3]).toHaveTextContent('task *');
    expect(cells[3]).toHaveTextContent('queue ^1.0.0');
    expect(within(cells[3] as HTMLElement).getByText('(not loaded)').closest('li')).toHaveTextContent('queue');
    expect(cells[4]).toHaveTextContent('project:project-panels');
    expect(cells[5]).toHaveTextContent('task');
    expect(cells[6]).toHaveTextContent('2 pages, 1 widget');
    const taskRow = screen.getAllByRole('row').find((row) => within(row).queryAllByRole('cell')[0]?.textContent?.startsWith('task')) as HTMLElement;
    expect(within(taskRow).getAllByRole('cell')[2]).toHaveTextContent('project *');
    expect(within(taskRow).getAllByRole('cell')[6]).toHaveTextContent('1 page, components');
  });

  it('links a module to its pages and an installed dependency to its module', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: 'task' });
    expect(links.every((l) => l.getAttribute('href') === '/modules/task')).toBe(true);
  });

  it('shows the warnings in full', () => {
    renderPage();
    const section = within(screen.getByRole('region', { name: 'Warnings' }));
    expect(section.getByText(/queue:project-header"\) is inactive: optional module "queue" is not available/)).toBeInTheDocument();
    expect(section.getByRole('link', { name: 'project' })).toHaveAttribute('href', '/modules/project');
  });

  it('shows what failed, why, and what to do depending on the cause, noting a previous version that still runs', () => {
    renderPage(modules, failed);
    const section = within(screen.getByRole('region', { name: 'Failed to load' }));
    expect(section.getByText(/requires "orch", which is not loaded/)).toBeInTheDocument();
    expect(section.getByText(/it loads again by itself/)).toBeInTheDocument();
    expect(section.getByText('setup threw')).toBeInTheDocument();
    expect(section.getByText(/Fix the module, then register it again/)).toBeInTheDocument();
    // `task` failed an update and its previous version is still loaded.
    expect(section.getByText(/the previous version is still running/)).toBeInTheDocument();
    expect(section.getAllByText(/C:\/mods\//)).toHaveLength(2);
  });

  it('has no failure or warning section when there is nothing to report, and says so when nothing is installed', () => {
    renderPage([{ id: 'plain', version: '1', extensionPoints: [ep('page', 'nav')] as LoadedModuleSummary['extensionPoints'] }]);
    expect(screen.queryByRole('region', { name: 'Failed to load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Warnings' })).not.toBeInTheDocument();
  });

  it('says no module is loaded', () => {
    renderPage([]);
    expect(screen.getByText('No module is loaded.')).toBeInTheDocument();
  });
});
