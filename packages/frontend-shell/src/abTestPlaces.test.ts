import { describe, expect, it } from 'vitest';
import { placeOf } from './abTestPlaces.js';
import type { LoadedModuleSummary } from './types.js';

const ep = (extra: Record<string, unknown>) => ({ kind: 'page', slot: 'nav', view: {}, rawYaml: '', ...extra });
const modules: LoadedModuleSummary[] = [
  {
    id: 'flow',
    version: '1',
    title: 'Flow',
    extensionPoints: [
      ep({ label: 'Executions', path: '/executions' }),
      ep({ slot: 'nav', label: 'Workers' }),
      ep({ slot: 'route', label: 'Logs', path: '/executions/:id/logs' }),
      ep({ kind: 'widget', slot: 'dashboard', label: 'Runs' }),
      ep({ slot: 'route', label: 'Deep', path: '/zzz/:id' }),
    ] as LoadedModuleSummary['extensionPoints'],
  },
];
const point = (index: number) => {
  const e = modules[0]!.extensionPoints[index]!;
  return { moduleId: 'flow', index, kind: e.kind, slot: e.slot, path: e.path, label: e.label };
};

describe('placeOf: where to go to see an extension point', () => {
  it('links a page with a static path to its address', () => {
    expect(placeOf(modules, point(0))).toEqual({ href: '/modules/flow/executions', text: 'Flow: Executions (/executions)' });
  });

  it('links a page without a path by its position among the nav pages, like the side menu', () => {
    expect(placeOf(modules, point(1))).toEqual({ href: '/modules/flow/1', text: 'Flow: Workers' });
  });

  it('leads a page of one item (a route with a parameter) to the list it hangs from, and says so', () => {
    const place = placeOf(modules, point(2));
    expect(place.href).toBe('/modules/flow/executions');
    expect(place.text).toContain('/executions/:id/logs');
    expect(place.note).toContain('open an item');
  });

  it('falls back to the module when no page of it is the start of the route', () => {
    expect(placeOf(modules, point(4)).href).toBe('/modules/flow');
  });

  it('sends a dashboard widget to the dashboard, a top bar widget to every page, a slot contribution to its provider', () => {
    expect(placeOf(modules, point(3))).toMatchObject({ href: '/', text: 'Dashboard, widget "Runs" of Flow' });
    expect(placeOf(modules, { moduleId: 'flow', index: 9, kind: 'widget', slot: 'navbar', label: 'Stats' })).toMatchObject({ href: '/', note: 'shown on every page' });
    expect(placeOf(modules, { moduleId: 'flow', index: 9, kind: 'widget', slot: 'proj:header' })).toMatchObject({ href: '/modules/proj', text: 'Slot proj:header, contributed by Flow' });
  });
});
