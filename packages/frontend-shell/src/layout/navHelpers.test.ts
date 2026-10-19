import { describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { breadcrumbFor, trimModulePrefix } from './navHelpers.js';
import { navModulesFor } from './navModel.js';

const page = (slot: string, label: string | undefined, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });

describe('trimModulePrefix', () => {
  it('drops the module name in front of a label, and capitalises what is left', () => {
    expect(trimModulePrefix('Flow Executions', 'Flow')).toBe('Executions');
    expect(trimModulePrefix('queue history', 'Queue')).toBe('History');
  });

  it('keeps a label that does not start with the module name, or is only that name', () => {
    expect(trimModulePrefix('Jobs', 'Orchestrator')).toBe('Jobs');
    expect(trimModulePrefix('Flow', 'Flow')).toBe('Flow');
    expect(trimModulePrefix('Flowers', 'Flow')).toBe('Flowers');
  });

  it('works on a title of several words', () => {
    expect(trimModulePrefix('Message queue Dead letters', 'Message queue')).toBe('Dead letters');
  });
});

describe('breadcrumbFor', () => {
  // The shapes of the real modules: a menu page with routes below it (task), a module home "/" with unrelated menu pages
  // and routes beside them (orchestrator), routes without a label (flow), and a page added to another menu.
  const modules: LoadedModuleSummary[] = [
    {
      id: 'task',
      version: '1.0.0',
      extensionPoints: [page('nav', 'Tasks', '/tasks'), page('nav', 'Tree', '/tree'), page('route', 'Task', '/tasks/:id'), page('route', 'Task history', '/tasks/:id/history'), page('route', 'New task', '/new')],
    },
    {
      id: 'orchestrator',
      version: '1.0.0',
      extensionPoints: [
        page('nav', 'Jobs', '/'),
        page('nav', 'Schedule', '/schedule'),
        page('route', 'New job', '/jobs/new'),
        page('route', 'Job', '/jobs/:id'),
        page('route', 'Job logs', '/jobs/:id/logs'),
      ],
    },
    { id: 'flow', version: '1.0.0', extensionPoints: [page('nav', 'Flow Executions', '/executions'), page('route', undefined, '/executions/:id')] },
    { id: 'flow-chart', version: '1.0.0', extensionPoints: [page('flow:nav', 'Charts', '/charts')] },
  ];
  const nav = navModulesFor(modules);
  const labels = (pathname: string) => breadcrumbFor(pathname, nav, modules).map((c) => c.label);

  it('is empty on the dashboard and on a URL that belongs to no module', () => {
    expect(breadcrumbFor('/', nav, modules)).toEqual([]);
    expect(breadcrumbFor('/nowhere', nav, modules)).toEqual([]);
  });

  it('is the module then its page on a menu page, the page being the current place', () => {
    expect(breadcrumbFor('/modules/task/tasks', nav, modules)).toEqual([{ label: 'Task', href: '/modules/task/tasks' }, { label: 'Tasks' }]);
  });

  it('nests the pages on the way: the menu page, the detail page with its parameter, the page below it', () => {
    expect(breadcrumbFor('/modules/task/tasks/42/history', nav, modules)).toEqual([
      { label: 'Task', href: '/modules/task/tasks' },
      { label: 'Tasks', href: '/modules/task/tasks' },
      { label: 'Task 42', href: '/modules/task/tasks/42' },
      { label: 'Task history' },
    ]);
  });

  it('links each crumb to its own address, with the real parameter in it', () => {
    const [, , detail] = breadcrumbFor('/modules/task/tasks/42/history', nav, modules);
    expect(detail?.href).toBe('/modules/task/tasks/42');
  });

  it('takes the page with the fewest parameters when several match at the same depth', () => {
    expect(labels('/modules/orchestrator/jobs/new')).toEqual(['Orchestrator', 'Jobs', 'New job']);
    expect(labels('/modules/orchestrator/jobs/7')).toEqual(['Orchestrator', 'Jobs', 'Job 7']);
  });

  it('puts the module home first only on pages no other menu page claims', () => {
    expect(labels('/modules/orchestrator/jobs/7/logs')).toEqual(['Orchestrator', 'Jobs', 'Job 7', 'Job logs']);
    expect(labels('/modules/orchestrator/schedule')).toEqual(['Orchestrator', 'Schedule']);
  });

  it('names a page without a label after its address, in the singular before a parameter', () => {
    expect(labels('/modules/flow/executions/abc')).toEqual(['Flow', 'Flow Executions', 'Execution abc']);
  });

  it('shortens a long parameter value', () => {
    expect(labels('/modules/task/tasks/0123456789abcdef0123').at(-1)).toBe('Task 0123456789abcde...');
  });

  it('puts a page contributed to another module under that module', () => {
    expect(breadcrumbFor('/modules/flow-chart/charts', nav, modules)).toEqual([{ label: 'Flow', href: '/modules/flow/executions' }, { label: 'Charts' }]);
  });
});
