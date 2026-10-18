import type { ModuleRouteHandler, ModuleRouteRegistry } from './moduleRoutes.js';

declare const timerHandleBrand: unique symbol;

// Opaque handle returned by ctx.setInterval / ctx.setTimeout, to be given back to ctx.clearInterval /
// ctx.clearTimeout. It has no usable members: do not rely on what it is made of.
export interface ModuleTimerHandle {
  readonly [timerHandleBrand]: true;
}

// Scoped helpers a module's backend must use instead of raw globals, so
// app-core can clear them automatically on unload/swap. Dev-time enforcement
// that this is actually used (instead of raw setInterval/addEventListener) is
// the violations rule, not a runtime guard. registerRoute is the same pattern
// applied to HTTP routes.
export interface ModuleContext {
  // <configDir>/data/<id>/, created before setup runs. The module's own persistent data: app-core never deletes it.
  readonly dataDir: string;
  // Keeping the returned handle is optional: everything still running is cleared when the module is unloaded.
  setInterval(fn: () => void, ms: number): ModuleTimerHandle;
  setTimeout(fn: () => void, ms: number): ModuleTimerHandle;
  // Stops one timer early. A timer that already fired (timeout) or was already cleared, or a call after dispose, is a no-op.
  clearInterval(handle: ModuleTimerHandle): void;
  clearTimeout(handle: ModuleTimerHandle): void;
  on(event: string, fn: (...args: unknown[]) => void): void;
  // Removes a listener added with on(). A listener that is not registered, or a call after dispose, is a no-op.
  off(event: string, fn: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  registerRoute(method: string, subPath: string, handler: ModuleRouteHandler): void;
  dispose(): void;
}

// What the migrate hook (manifest `lifecycle`) receives. `version` is the version of the instance the hook
// belongs to; `previousVersion` is the last version that loaded successfully before it (null on first install).
export interface ModuleHookContext {
  id: string;
  version: string;
  previousVersion: string | null;
  dataDir: string;
}

// Why a teardown runs: 'update' (a new version replaces this one), 'unregister' (removed on purpose),
// 'unload' (unloaded without being unregistered), 'shutdown' (app-core stops), 'dependency' (a module this one
// requires was unregistered, failed or changed incompatibly).
export type ModuleTeardownReason = 'update' | 'unregister' | 'unload' | 'shutdown' | 'dependency';

// What the teardown hook receives: the hook context of the instance being stopped, plus why and what its setup returned.
export interface ModuleTeardownContext<TInstance = unknown> extends ModuleHookContext {
  reason: ModuleTeardownReason;
  // The value the backend's default export (setup) returned; undefined when it returned nothing.
  // Type it yourself: ModuleTeardownContext<MyInstance>. migrate runs before setup and gets none.
  instance: TInstance;
}

// Default export of the migrate hook file. Runs under the hook timeout (APP_CORE_HOOK_TIMEOUT_MS).
export type ModuleLifecycleHook = (ctx: ModuleHookContext) => void | Promise<void>;
// Default export of the teardown hook file. Runs under the hook timeout.
export type ModuleTeardownHook<TInstance = unknown> = (ctx: ModuleTeardownContext<TInstance>) => void | Promise<void>;
// Default export of the backend entry: may return the module's running state, handed to teardown as `instance`.
export type ModuleSetup<TInstance = void> = (ctx: ModuleContext) => TInstance | Promise<TInstance>;

class TimerHandle {
  constructor(readonly kind: 'interval' | 'timeout') {}
}

function asHandle(handle: unknown, kind: TimerHandle['kind']): TimerHandle {
  const set = kind === 'interval' ? 'setInterval' : 'setTimeout';
  const clear = kind === 'interval' ? 'clearInterval' : 'clearTimeout';
  if (!(handle instanceof TimerHandle)) {
    throw new TypeError(`moduleContext.${clear} needs the handle returned by ctx.${set}, got ${handle === null ? 'null' : typeof handle}. Keep the return value of ctx.${set} and pass it back.`);
  }
  if (handle.kind !== kind) {
    const right = handle.kind === 'interval' ? 'clearInterval' : 'clearTimeout';
    throw new TypeError(`moduleContext.${clear} received ${handle.kind === 'interval' ? 'an interval' : 'a timeout'} handle. Use ctx.${right} for it.`);
  }
  return handle;
}

export function createModuleContext(moduleId: string, routeRegistry: ModuleRouteRegistry, dataDir: string): ModuleContext {
  const intervals = new Map<TimerHandle, NodeJS.Timeout>();
  const timeouts = new Map<TimerHandle, NodeJS.Timeout>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let disposed = false;

  return {
    dataDir,
    setInterval(fn, ms) {
      if (disposed) {
        throw new Error('moduleContext.setInterval called after dispose()');
      }
      const handle = new TimerHandle('interval');
      intervals.set(handle, globalThis.setInterval(fn, ms));
      return handle as unknown as ModuleTimerHandle;
    },
    setTimeout(fn, ms) {
      if (disposed) {
        throw new Error('moduleContext.setTimeout called after dispose()');
      }
      const handle = new TimerHandle('timeout');
      // A timeout that fired is dropped from tracking: nothing accumulates over the life of the module.
      const timer = globalThis.setTimeout(() => {
        timeouts.delete(handle);
        fn();
      }, ms);
      timeouts.set(handle, timer);
      return handle as unknown as ModuleTimerHandle;
    },
    clearInterval(handle) {
      if (disposed) {
        return;
      }
      const own = asHandle(handle, 'interval');
      const timer = intervals.get(own);
      if (timer !== undefined) {
        clearInterval(timer);
        intervals.delete(own);
      }
    },
    clearTimeout(handle) {
      if (disposed) {
        return;
      }
      const own = asHandle(handle, 'timeout');
      const timer = timeouts.get(own);
      if (timer !== undefined) {
        clearTimeout(timer);
        timeouts.delete(own);
      }
    },
    on(event, fn) {
      if (disposed) {
        throw new Error('moduleContext.on called after dispose()');
      }
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(fn);
    },
    off(event, fn) {
      const set = listeners.get(event);
      if (set === undefined) {
        return;
      }
      set.delete(fn);
      if (set.size === 0) {
        listeners.delete(event);
      }
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
    registerRoute(method, subPath, handler) {
      if (disposed) {
        throw new Error('moduleContext.registerRoute called after dispose()');
      }
      routeRegistry.register(moduleId, method, subPath, handler);
    },
    dispose() {
      disposed = true;
      intervals.forEach((timer) => clearInterval(timer));
      timeouts.forEach((timer) => clearTimeout(timer));
      intervals.clear();
      timeouts.clear();
      listeners.clear();
      routeRegistry.unregisterAllForModule(moduleId);
    },
  };
}
