import { describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { breadcrumbFor, pushRecent, trimModulePrefix } from './navHelpers.js';
import { navModulesFor } from './navModel.js';

const page = (slot: string, label: string, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });

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
  const modules: LoadedModuleSummary[] = [
    {
      id: 'task',
      version: '1.0.0',
      extensionPoints: [page('nav', 'Tasks', '/tasks'), page('nav', 'Tree', '/tree'), page('route', 'Task', '/tasks/:id'), page('route', 'Task history', '/tasks/:id/history')],
    },
    { id: 'flow', version: '1.0.0', extensionPoints: [page('nav', 'Executions', '/executions')] },
    { id: 'flow-chart', version: '1.0.0', extensionPoints: [page('flow:nav', 'Flow charts', '/charts')] },
  ];
  const nav = navModulesFor(modules);

  it('is empty on the dashboard and on a URL that belongs to no module', () => {
    expect(breadcrumbFor('/', nav, modules)).toEqual([]);
    expect(breadcrumbFor('/nowhere', nav, modules)).toEqual([]);
  });

  it('is the module then its page on a menu page, the page being the current place', () => {
    expect(breadcrumbFor('/modules/task/tasks', nav, modules)).toEqual([{ label: 'Task', href: '/modules/task/tasks' }, { label: 'Tasks' }]);
  });

  it('adds the label of a route below the menu page, linking the page', () => {
    expect(breadcrumbFor('/modules/task/tasks/42', nav, modules)).toEqual([{ label: 'Task', href: '/modules/task/tasks' }, { label: 'Tasks', href: '/modules/task/tasks' }, { label: 'Task' }]);
  });

  it('takes the most specific route when several match', () => {
    expect(breadcrumbFor('/modules/task/tasks/42/history', nav, modules).at(-1)).toEqual({ label: 'Task history' });
  });

  it('puts a page contributed to another module under that module', () => {
    expect(breadcrumbFor('/modules/flow-chart/charts', nav, modules)).toEqual([{ label: 'Flow', href: '/modules/flow/executions' }, { label: 'Flow charts' }]);
  });
});

describe('pushRecent', () => {
  const at = (n: number) => ({ routePath: `/p${n}`, label: `P${n}`, moduleId: 'm' });

  it('puts the visited page first and forgets an earlier visit of it', () => {
    expect(pushRecent([at(1), at(2), at(3)], at(2), 5).map((r) => r.routePath)).toEqual(['/p2', '/p1', '/p3']);
  });

  it('keeps at most max pages, dropping the oldest', () => {
    expect(pushRecent([at(1), at(2), at(3)], at(4), 3).map((r) => r.routePath)).toEqual(['/p4', '/p1', '/p2']);
  });
});
