import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { navModulesFor } from './layout/navModel.js';
import type { LoadedModuleSummary } from './types.js';

// /modules/<id> alone (a typed or bookmarked address, a breadcrumb) opens the first page of the module instead of a dead end.
// A module without any menu page says so, and a module that is not loaded says that.
export function ModuleIndex({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  const { moduleId } = useParams<{ moduleId: string }>();
  const target = navModulesFor(modules).find((m) => m.id === moduleId)?.pages[0];
  if (target !== undefined) {
    return <Navigate to={target.routePath} replace />;
  }
  return (
    <p className="p-4 text-muted">
      {modules.some((m) => m.id === moduleId)
        ? `Module "${moduleId}" has no page in the menu: open one of its pages by its address, or from the dashboard widgets.`
        : `No module "${moduleId}" is loaded (it may have been unloaded). Pick a module in the top bar.`}
    </p>
  );
}
