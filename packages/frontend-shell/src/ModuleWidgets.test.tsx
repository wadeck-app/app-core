import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModuleLibGate, ModuleLibsProvider } from './useModuleLibs.js';
import { widgetsFor } from './ModuleWidgets.js';
import type { LoadedModuleSummary } from './types.js';

function mod(id: string, ...points: Array<{ kind?: string; slot: string; order?: number; yaml?: string }>): LoadedModuleSummary {
  return {
    id,
    version: '1.0.0',
    extensionPoints: points.map((p) => ({
      kind: p.kind ?? 'widget',
      slot: p.slot,
      view: {},
      rawYaml: p.yaml ?? `$type: Badge\nlabel: ${id}\n`,
      order: p.order,
    })),
  };
}

describe('widgetsFor', () => {
  it('keeps only widgets of the requested slot', () => {
    const modules = [
      mod('a', { slot: 'navbar' }, { slot: 'overlay' }, { slot: 'dashboard' }, { kind: 'page', slot: 'navbar' }),
      mod('b', { slot: 'overlay' }),
    ];
    expect(widgetsFor(modules, 'navbar').map((w) => w.moduleId)).toEqual(['a']);
    expect(widgetsFor(modules, 'overlay').map((w) => w.moduleId)).toEqual(['a', 'b']);
  });

  it('sorts by order ascending, entries without order last, then by module list order', () => {
    const modules = [
      mod('first-no-order', { slot: 'navbar' }),
      mod('late', { slot: 'navbar', order: 9 }),
      mod('early', { slot: 'navbar', order: 1 }),
      mod('second-no-order', { slot: 'navbar' }),
      mod('tie-b', { slot: 'navbar', order: 5 }),
      mod('tie-a', { slot: 'navbar', order: 5 }),
    ];
    expect(widgetsFor(modules, 'navbar').map((w) => w.moduleId)).toEqual([
      'early',
      'tie-b',
      'tie-a',
      'late',
      'first-no-order',
      'second-no-order',
    ]);
  });

  it('gives each widget of a module its own key', () => {
    const keys = widgetsFor([mod('a', { slot: 'navbar' }, { slot: 'navbar' })], 'navbar').map((w) => w.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('ModuleLibGate quiet', () => {
  const gate = (statuses: React.ComponentProps<typeof ModuleLibsProvider>['value'], quiet: boolean) =>
    render(
      <ModuleLibsProvider value={statuses}>
        <ModuleLibGate moduleId="m" quiet={quiet}>
          <span>content</span>
        </ModuleLibGate>
      </ModuleLibsProvider>,
    );

  it('renders nothing while loading or failed, where the default gate shows a message', () => {
    expect(gate({ m: { state: 'loading' } }, true).container).toBeEmptyDOMElement();
    expect(gate({ m: { state: 'error', message: 'boom' } }, true).container).toBeEmptyDOMElement();
    expect(gate({ m: { state: 'loading' } }, false).container).toHaveTextContent('Loading the components');
    expect(gate({ m: { state: 'error', message: 'boom' } }, false).container).toHaveTextContent('boom');
  });

  it('shows the content once ready or when the module has no lib', () => {
    expect(gate({ m: { state: 'ready', generation: 1 } }, true).container).toHaveTextContent('content');
    expect(gate({}, true).container).toHaveTextContent('content');
  });
});
