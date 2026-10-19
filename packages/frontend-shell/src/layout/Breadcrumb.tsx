import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Crumb } from './navHelpers.js';

// Where the user is, as nested pages: earlier crumbs are links to their page, the last one is the current place.
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }): React.ReactElement | null {
  if (crumbs.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Breadcrumb" className="px-4 pt-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {crumbs.map((crumb, i) => (
          <li key={`${i}-${crumb.label}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : null}
            {crumb.href === undefined ? (
              <span aria-current="page" className="font-medium text-content">
                {crumb.label}
              </span>
            ) : (
              <Link to={crumb.href} className="hover:text-content hover:underline">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
