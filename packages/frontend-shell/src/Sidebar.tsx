import React from 'react';
import { NavLink } from 'react-router-dom';
import type { LoadedModuleSummary } from './types.js';

export interface NavPage {
  moduleId: string;
  routePath: string;
  label: string;
}

// Base slot: page/nav -> a sidebar entry routing to a full-page render (frontend-shell.md "Base slots").
export function navPagesFor(modules: LoadedModuleSummary[]): NavPage[] {
  return modules.flatMap((m) =>
    m.extensionPoints
      .filter((ep) => ep.kind === 'page' && ep.slot === 'nav')
      .map((ep, i) => ({
        moduleId: m.id,
        routePath: `/modules/${m.id}/${i}`,
        label: ep.label ?? `${m.id} #${i}`,
      })),
  );
}

export function Sidebar({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  const pages = navPagesFor(modules);
  return (
    <nav aria-label="modules">
      <NavLink to="/" end>
        Dashboard
      </NavLink>
      <ul>
        {pages.map((p) => (
          <li key={p.routePath}>
            <NavLink to={p.routePath}>{p.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
