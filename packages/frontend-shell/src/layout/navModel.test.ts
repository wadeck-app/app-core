import { describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { activeNavModule, activeNavPage, navModulesFor, navPagesFor, titleFromId } from './navModel.js';

const page = (slot: string, label: string, path?: string) => ({ kind: 'page', slot, label, path, view: {}, rawYaml: '' });
const mod = (id: string, ...extensionPoints: LoadedModuleSummary['extensionPoints']): LoadedModuleSummary => ({ id, version: '1.0.0', extensionPoints });

// Base slot: page/nav -> a navigation entry (frontend-shell.md "Base slots"). Migrated from the former AppNavBar tests.
describe('navPagesFor (base slot page/nav)', () => {
  it('lists a page/nav extensionPoint, reachable by index when it has no path', () => {
    const pages = navPagesFor([mod('module-b', page('nav', 'Fixture B Page'))]);
    expect(pages).toEqual([{ moduleId: 'module-b', routePath: '/modules/module-b/0', label: 'Fixture B Page', exact: false }]);
  });

  it('does not list widget/dashboard extensionPoints', () => {
    const pages = navPagesFor([mod('module-a', { kind: 'widget', slot: 'dashboard', view: {}, rawYaml: '' })]);
    expect(pages).toEqual([]);
  });

  it('links a static path directly, and marks the module home "/" as exact', () => {
    const pages = navPagesFor([mod('billing', page('nav', 'Overview', '/'), page('nav', 'Invoices', '/invoices'))]);
    expect(pages.map((p) => [p.routePath, p.exact])).toEqual([
      ['/modules/billing', true],
      ['/modules/billing/invoices', false],
    ]);
  });

  it('falls back to "<id> #<index>" for a page without a label', () => {
    expect(navPagesFor([mod('billing', { kind: 'page', slot: 'nav', view: {}, rawYaml: '' })])[0].label).toBe('billing #0');
  });
});

describe('titleFromId', () => {
  it('humanizes separators and capitalizes', () => {
    expect(titleFromId('billing-reports')).toBe('Billing reports');
    expect(titleFromId('audit_log')).toBe('Audit log');
    expect(titleFromId('example')).toBe('Example');
  });
});

describe('navModulesFor', () => {
  const modules = [
    mod('billing', page('nav', 'Overview', '/'), page('nav', 'Invoices', '/invoices'), page('route', 'Invoice', '/invoices/:id')),
    mod('widgets-only', { kind: 'widget', slot: 'dashboard', view: {}, rawYaml: '' }),
    mod('reports', page('nav', 'Dashboards')),
  ];

  it('groups nav pages by module, in module order', () => {
    const result = navModulesFor(modules);
    expect(result.map((m) => m.id)).toEqual(['billing', 'reports']);
    expect(result[0].pages.map((p) => p.label)).toEqual(['Overview', 'Invoices']);
  });

  it('leaves out modules without a nav page and route-only pages', () => {
    const result = navModulesFor(modules);
    expect(result.some((m) => m.id === 'widgets-only')).toBe(false);
    expect(result[0].pages.some((p) => p.label === 'Invoice')).toBe(false);
  });
});

describe('activeNavModule / activeNavPage', () => {
  const navModules = navModulesFor([
    mod('billing', page('nav', 'Overview', '/'), page('nav', 'Invoices', '/invoices')),
    mod('billing-extra', page('nav', 'Extra')),
  ]);

  it('matches the module from any URL under its base path', () => {
    expect(activeNavModule('/modules/billing', navModules)?.id).toBe('billing');
    expect(activeNavModule('/modules/billing/invoices/42', navModules)?.id).toBe('billing');
  });

  it('does not confuse a module with another one sharing its id as a prefix', () => {
    expect(activeNavModule('/modules/billing-extra/0', navModules)?.id).toBe('billing-extra');
  });

  it('returns nothing outside any module', () => {
    expect(activeNavModule('/', navModules)).toBeUndefined();
  });

  it('keeps the home page from matching its siblings, but a page matches its sub-routes', () => {
    const billing = navModules[0];
    expect(activeNavPage('/modules/billing', billing)?.label).toBe('Overview');
    expect(activeNavPage('/modules/billing/invoices', billing)?.label).toBe('Invoices');
    expect(activeNavPage('/modules/billing/invoices/42', billing)?.label).toBe('Invoices');
  });
});
