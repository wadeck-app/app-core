import type { LoadedModuleSummary } from '../types.js';
import { navModulesFor } from './navModel.js';

// Five modules with a realistic number of pages (one has a single page on purpose) to judge the navigation at scale.
const MODULE_PAGES: Record<string, string[]> = {
  billing: ['Overview', 'Invoices', 'Customers', 'Payment methods', 'Tax settings'],
  inventory: ['Stock', 'Suppliers', 'Purchase orders'],
  reports: ['Dashboards', 'Scheduled exports'],
  'audit-log': ['Events', 'Retention'],
  settings: ['General'],
};

export const FIXTURE_MODULES: LoadedModuleSummary[] = Object.entries(MODULE_PAGES).map(([id, labels]) => ({
  id,
  version: '1.0.0',
  extensionPoints: labels.map((label, i) => ({ kind: 'page', slot: 'nav', label, path: i === 0 ? '/' : `/p${i}`, view: {}, rawYaml: '' })),
}));

export const FIXTURE_NAV = navModulesFor(FIXTURE_MODULES);
