import type { ModuleRouteHandler, ModuleRouteRegistry } from './moduleRoutes.js';

// Decision #9: scoped helpers a module's backend must use instead of raw
// globals, so app-core can clear them automatically on unload/swap. Dev-time
// enforcement that this is actually used (instead of raw setInterval/addEventListener)
// is the violations rule, not a runtime guard -- see Decision #9's rationale.
// Decision #26: registerRoute is the same pattern applied to HTTP routes.
export interface ModuleContext {
  setInterval(fn: () => void, ms: number): void;
  setTimeout(fn: () => void, ms: number): void;
  on(event: string, fn: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  registerRoute(method: string, subPath: string, handler: ModuleRouteHandler): void;
  dispose(): void;
}

export function createModuleContext(moduleId: string, routeRegistry: ModuleRouteRegistry): ModuleContext {
  const intervals = new Set<NodeJS.Timeout>();
  const timeouts = new Set<NodeJS.Timeout>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let disposed = false;

  return {
    setInterval(fn, ms) {
      if (disposed) throw new Error('moduleContext.setInterval called after dispose()');
      const handle = globalThis.setInterval(fn, ms);
      intervals.add(handle);
    },
    setTimeout(fn, ms) {
      if (disposed) throw new Error('moduleContext.setTimeout called after dispose()');
      const handle = globalThis.setTimeout(fn, ms);
      timeouts.add(handle);
    },
    on(event, fn) {
      if (disposed) throw new Error('moduleContext.on called after dispose()');
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
    registerRoute(method, subPath, handler) {
      if (disposed) throw new Error('moduleContext.registerRoute called after dispose()');
      routeRegistry.register(moduleId, method, subPath, handler);
    },
    dispose() {
      disposed = true;
      intervals.forEach((h) => clearInterval(h));
      timeouts.forEach((h) => clearTimeout(h));
      intervals.clear();
      timeouts.clear();
      listeners.clear();
      routeRegistry.unregisterAllForModule(moduleId);
    },
  };
}
