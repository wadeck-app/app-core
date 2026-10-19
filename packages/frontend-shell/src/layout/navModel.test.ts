import { describe, expect, it } from 'vitest';
import type { LoadedModuleSummary } from '../types.js';
import { activeNavModule, activeNavPage, homeNavModule, listedNavModules, navModulesFor, navPagesFor, titleFromId } from './navModel.js';

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

describe('showInNav (the manifest option that keeps a module out of the navigation)', () => {
  const modules: LoadedModuleSummary[] = [
    mod('billing', page('nav', 'Overview', '/')),
    { ...mod('internal', page('nav', 'Console', '/')), showInNav: false },
    { ...mod('explicit', page('nav', 'Home', '/')), showInNav: true },
    // Widgets only: never listed, whatever showInNav says.
    { ...mod('widgets', { kind: 'widget', slot: 'dashboard', view: {}, rawYaml: '' }), showInNav: true },
  ];

  it('keeps a module with showInNav: false in the model (its pages still need a side menu) but marks it not listed', () => {
    const nav = navModulesFor(modules);
    expect(nav.map((m) => [m.id, m.listed])).toEqual([
      ['billing', true],
      ['internal', false],
      ['explicit', true],
    ]);
  });

  it('treats a missing option as listed, and never lists a module without nav pages', () => {
    const nav = navModulesFor(modules);
    expect(nav.find((m) => m.id === 'billing')?.listed).toBe(true);
    expect(nav.some((m) => m.id === 'widgets')).toBe(false);
  });

  it('listedNavModules keeps only the modules to show in the top bar', () => {
    expect(listedNavModules(navModulesFor(modules)).map((m) => m.id)).toEqual(['billing', 'explicit']);
  });

  it('leaves the module out of the dashboard shortcuts', () => {
    const home = homeNavModule(navModulesFor(modules));
    expect(home.pages.map((p) => p.label)).toEqual(['Dashboard', 'Billing', 'Explicit']);
  });

  it('still finds a not listed module from its URL, so its pages get their side menu', () => {
    const nav = navModulesFor(modules);
    expect(activeNavModule('/modules/internal', nav)?.id).toBe('internal');
    expect(activeNavPage('/modules/internal', activeNavModule('/modules/internal', nav)!)?.label).toBe('Console');
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

describe('pages contributed to another module side menu (<provider>:nav)', () => {
  const flow = mod('flow', page('nav', 'Runs', '/runs'), page('nav', 'Templates', '/templates'));
  const chart = mod('flow-chart', page('flow:nav', 'Flow chart', '/chart'));

  it('lists the contributed entries after the own ones, routed under the contributor', () => {
    const [nav] = navModulesFor([flow, chart]);
    expect(nav.pages.map((p) => [p.label, p.moduleId, p.routePath])).toEqual([
      ['Runs', 'flow', '/modules/flow/runs'],
      ['Templates', 'flow', '/modules/flow/templates'],
      ['Flow chart', 'flow-chart', '/modules/flow-chart/chart'],
    ]);
  });

  it('does not make the contributor a module of its own when it has no own nav page', () => {
    expect(navModulesFor([flow, chart]).map((m) => m.id)).toEqual(['flow']);
  });

  it('keeps a provider that has only contributed entries', () => {
    const [nav] = navModulesFor([mod('flow', page('route', 'Detail', '/d')), chart]);
    expect(nav.id).toBe('flow');
    expect(nav.pages.map((p) => p.label)).toEqual(['Flow chart']);
  });

  it('sorts contributions by order (none last), then by module order', () => {
    const late = mod('c-late', page('flow:nav', 'Late', '/l'));
    const first = mod('c-first', { ...page('flow:nav', 'First', '/f'), order: 1 });
    const second = mod('c-second', { ...page('flow:nav', 'Second', '/s'), order: 2 });
    const [nav] = navModulesFor([flow, late, second, first, chart]);
    expect(nav.pages.slice(2).map((p) => p.label)).toEqual(['First', 'Second', 'Late', 'Flow chart']);
  });

  it('ignores a contribution whose provider is not loaded, and a module contributing to itself', () => {
    expect(navModulesFor([chart])).toEqual([]);
    const [nav] = navModulesFor([mod('flow', page('nav', 'Runs', '/runs'), page('flow:nav', 'Self', '/self'))]);
    expect(nav.pages.map((p) => p.label)).toEqual(['Runs']);
  });

  it('ignores a contribution without a path, as it has no address', () => {
    const [nav] = navModulesFor([flow, mod('x', page('flow:nav', 'Nowhere'))]);
    expect(nav.pages.map((p) => p.label)).toEqual(['Runs', 'Templates']);
  });

  it('does not list the contributed entry among the quick-launch targets or as a module', () => {
    const home = homeNavModule(navModulesFor([flow, chart]));
    expect(home.pages.map((p) => p.label)).toEqual(['Dashboard', 'Flow']);
  });

  describe('active module', () => {
    const nav = navModulesFor([flow, chart, mod('billing', page('nav', 'Overview', '/'))]);

    it('is the provider on a contributed page, with the page current in its menu', () => {
      const active = activeNavModule('/modules/flow-chart/chart', nav);
      expect(active?.id).toBe('flow');
      expect(activeNavPage('/modules/flow-chart/chart', active!)?.label).toBe('Flow chart');
    });

    it('still is the provider on a sub-route of the contributed page', () => {
      expect(activeNavModule('/modules/flow-chart/chart/42', nav)?.id).toBe('flow');
    });

    it('leaves the pages of the provider and of other modules alone', () => {
      expect(activeNavModule('/modules/flow/runs', nav)?.id).toBe('flow');
      expect(activeNavModule('/modules/billing', nav)?.id).toBe('billing');
    });

    it('keeps the contributor own page with its own module when it has one that is more specific', () => {
      const own = navModulesFor([flow, mod('flow-chart', page('nav', 'Home', '/'), page('nav', 'Deep', '/chart/deep'), page('flow:nav', 'Flow chart', '/chart'))]);
      expect(activeNavModule('/modules/flow-chart/chart/deep', own)?.id).toBe('flow-chart');
      expect(activeNavModule('/modules/flow-chart/chart', own)?.id).toBe('flow');
    });
  });
});

describe('title (the manifest display name)', () => {
  it('is the title of the module in the navigation when the manifest gives one, else derived from the id', () => {
    const named = { ...mod('flow-chart', page('nav', 'Home', '/')), title: 'Flow Charts' };
    const plain = mod('billing-reports', page('nav', 'Home', '/'));
    expect(navModulesFor([named, plain]).map((m) => m.title)).toEqual(['Flow Charts', 'Billing reports']);
  });
});
