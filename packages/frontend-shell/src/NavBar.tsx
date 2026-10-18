import React from 'react';
import { NavLink } from 'react-router-dom';
import { NavBar as DslNavBar } from '@wadeck-app/dsl-ui';
import { TopBarActions } from './layout/TopBarActions.js';
import { modulePagePath } from './modulePaths.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

export interface NavPage {
  moduleId: string;
  routePath: string;
  label: string;
  // A module home page ("/") must not stay highlighted on the module's other pages.
  exact: boolean;
}

// Base slot: page/nav -> a top-nav entry routing to a full-page render (frontend-shell.md "Base slots").
export function navPagesFor(modules: LoadedModuleSummary[]): NavPage[] {
  return modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'page' && ep.slot === 'nav')
      .map((ep, i) => ({
        moduleId: m.id,
        // A nav page with a static path is linked there; one with route params can only be reached by index.
        routePath: ep.path !== undefined && !ep.path.includes(':') ? modulePagePath(m.id, ep.path) : `/modules/${m.id}/${i}`,
        label: ep.label ?? `${m.id} #${i}`,
        exact: ep.path === '/',
      })),
  );
}

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `text-sm font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted hover:text-content'}`;

export function AppNavBar({ modules, failed = [] }: { modules: LoadedModuleSummary[]; failed?: FailedModuleSummary[] }): React.ReactElement {
  const pages = navPagesFor(modules);
  return (
    <header className="border-b border-border bg-surface px-4 py-3">
      <DslNavBar>
        <span className="text-base font-semibold text-content mr-6">app-core</span>
        <NavLink to="/" end className={linkClass}>
          Dashboard
        </NavLink>
        {pages.map((p) => (
          <NavLink key={p.routePath} to={p.routePath} end={p.exact} className={linkClass}>
            {p.label}
          </NavLink>
        ))}
        <TopBarActions modules={modules} failed={failed} />
      </DslNavBar>
    </header>
  );
}
