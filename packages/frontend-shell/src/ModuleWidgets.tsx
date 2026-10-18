import React from 'react';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { getErrorMessage } from './errors.js';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';
import { ModuleLibGate } from './useModuleLibs.js';
import type { LoadedModuleSummary } from './types.js';

export type ShellWidgetSlot = 'navbar' | 'overlay';

export interface ShellWidget {
  moduleId: string;
  key: string;
  rawYaml: string;
}

// Widgets of one shell slot, ordered by `order` ascending (none last), then by module list order.
export function widgetsFor(modules: LoadedModuleSummary[], slot: ShellWidgetSlot): ShellWidget[] {
  return modules
    .flatMap((m) =>
      m.extensionPoints
        .filter((ep) => ep.kind === 'widget' && ep.slot === slot)
        .map((ep, i) => ({ moduleId: m.id, key: `${m.id}-${slot}-${i}`, rawYaml: ep.rawYaml, order: ep.order })),
    )
    .map((w, position) => ({ ...w, position }))
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.position - b.position)
    .map(({ moduleId, key, rawYaml }) => ({ moduleId, key, rawYaml }));
}

interface BoundaryProps {
  moduleId: string;
  slot: ShellWidgetSlot;
  children: React.ReactNode;
}

// These widgets render on every page: a module component that throws must not blank the shell.
class WidgetErrorBoundary extends React.Component<BoundaryProps, { message?: string }> {
  override state: { message?: string } = {};

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: getErrorMessage(error) };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(`[app-core] the ${this.props.slot} widget of module "${this.props.moduleId}" threw:`, error, info.componentStack);
  }

  override render(): React.ReactNode {
    const { message } = this.state;
    if (message === undefined) {
      return this.props.children;
    }
    const text = `${this.props.moduleId}: widget error`;
    if (this.props.slot === 'navbar') {
      return (
        <span role="alert" title={message} className="text-xs text-danger">
          {text}
        </span>
      );
    }
    // The overlay normally positions itself; its failure notice sits in a corner no overlay is expected to use.
    return (
      <div role="alert" title={message} className="fixed bottom-2 left-2 z-50 rounded border border-danger bg-surface px-2 py-1 text-xs text-danger">
        {text}
      </div>
    );
  }
}

// Renders one widget view like a dashboard widget (GenericPageRunner + shared fetcher + registry), once its
// module's components are ready. A failure of the lib itself is already reported by the shell banner.
export function ModuleWidget({ moduleId, rawYaml, slot }: { moduleId: string; rawYaml: string; slot: ShellWidgetSlot }): React.ReactElement {
  return (
    <ModuleLibGate moduleId={moduleId} quiet>
      <WidgetErrorBoundary key={rawYaml} moduleId={moduleId} slot={slot}>
        <GenericPageRunner yamlText={rawYaml} registry={appRegistry} fetcher={fetcher} />
      </WidgetErrorBoundary>
    </ModuleLibGate>
  );
}
