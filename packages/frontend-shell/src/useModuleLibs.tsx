import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';
import { registerModuleEntries, unregisterModuleEntries } from './registry.js';
import { getErrorMessage } from './errors.js';
import { ensureSharedGlobals } from './sharedGlobals.js';
import type { LoadedModuleSummary } from './types.js';

export type ModuleLibStatus =
  | { state: 'loading' }
  // `generation` changes every time the module's components are (re)registered, so views remount.
  | { state: 'ready'; generation: number }
  | { state: 'error'; message: string };

export type ModuleLibStatuses = Record<string, ModuleLibStatus>;

export type LibImporter = (url: string) => Promise<{ default?: unknown }>;

const defaultImporter: LibImporter = async (url) => {
  await ensureSharedGlobals();
  return (await import(/* @vite-ignore */ url)) as { default?: unknown };
};

interface LoadedLib {
  entryUrl: string;
  cssUrl?: string;
  link?: HTMLLinkElement;
}

function injectCss(moduleId: string, href: string): HTMLLinkElement {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset['moduleLib'] = moduleId;
  document.head.appendChild(link);
  return link;
}

function isEntryList(value: unknown): value is ComponentRegistryEntry[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null && typeof (v as { name?: unknown }).name === 'string');
}

// Keeps the registry in step with the polled module list: loads the dsl-lib of every module that
// declares one (once per entry URL), and drops the components and stylesheet of modules that
// disappeared or whose URL changed (hot-swap). Statuses drive the per-module render gate.
export function useModuleLibs(modules: LoadedModuleSummary[], importer: LibImporter = defaultImporter): ModuleLibStatuses {
  const [statuses, setStatuses] = useState<ModuleLibStatuses>({});
  const loaded = useRef(new Map<string, LoadedLib>());
  const attempts = useRef(new Map<string, string>());
  const generation = useRef(0);

  useEffect(() => {
    const desired = new Map(modules.filter((m) => m.dslLib !== undefined).map((m) => [m.id, m.dslLib!]));

    const setStatus = (id: string, status: ModuleLibStatus | undefined): void => {
      setStatuses((prev) => {
        const next = { ...prev };
        if (status === undefined) {
          delete next[id];
        } else {
          next[id] = status;
        }
        return next;
      });
    };

    const drop = (id: string): void => {
      loaded.current.get(id)?.link?.remove();
      loaded.current.delete(id);
      attempts.current.delete(id);
      unregisterModuleEntries(id);
      setStatus(id, undefined);
    };

    for (const id of [...loaded.current.keys(), ...attempts.current.keys()]) {
      const want = desired.get(id);
      const have = loaded.current.get(id);
      const attempted = attempts.current.get(id);
      if (want === undefined || (have !== undefined && (have.entryUrl !== want.entryUrl || have.cssUrl !== want.cssUrl))) {
        drop(id);
      } else if (have === undefined && attempted !== undefined && attempted !== want.entryUrl) {
        drop(id);
      }
    }

    for (const [id, want] of desired) {
      if (loaded.current.has(id) || attempts.current.get(id) === want.entryUrl) {
        continue;
      }
      attempts.current.set(id, want.entryUrl);
      setStatus(id, { state: 'loading' });
      void importer(want.entryUrl)
        .then((mod) => {
          if (attempts.current.get(id) !== want.entryUrl) {
            return;
          }
          if (!isEntryList(mod.default)) {
            throw new Error('the bundle must default-export an array of component registry entries ({ name, render, ... })');
          }
          registerModuleEntries(id, mod.default);
          const link = want.cssUrl === undefined ? undefined : injectCss(id, want.cssUrl);
          loaded.current.set(id, { entryUrl: want.entryUrl, cssUrl: want.cssUrl, link });
          generation.current += 1;
          setStatus(id, { state: 'ready', generation: generation.current });
        })
        .catch((err: unknown) => {
          if (attempts.current.get(id) !== want.entryUrl) {
            return;
          }
          setStatus(id, {
            state: 'error',
            message: `Failed to load the components of module "${id}" from ${want.entryUrl}: ${getErrorMessage(err)}`,
          });
        });
    }
  }, [modules, importer]);

  return statuses;
}

const ModuleLibsContext = createContext<ModuleLibStatuses>({});

export const ModuleLibsProvider = ModuleLibsContext.Provider;

// Renders `children` only once the module's components are registered; modules without a
// dsl-lib have no status and render immediately.
export function ModuleLibGate({ moduleId, children }: { moduleId: string; children: React.ReactNode }): React.ReactElement {
  const status = useContext(ModuleLibsContext)[moduleId];
  if (status === undefined) {
    return <>{children}</>;
  }
  if (status.state === 'loading') {
    return <p className="p-4 text-muted">Loading the components of "{moduleId}"...</p>;
  }
  if (status.state === 'error') {
    return (
      <p role="alert" className="p-4 text-danger">
        {status.message}
      </p>
    );
  }
  return <React.Fragment key={status.generation}>{children}</React.Fragment>;
}
