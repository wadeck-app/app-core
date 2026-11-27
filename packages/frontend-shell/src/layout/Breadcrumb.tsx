import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Crumb } from './navHelpers.js';

// Where the user is, as nested pages: earlier crumbs are links to their page, the last one is the current place.
// `hideCurrent`: the page shows its own title elsewhere (its header is in the row of the trail), so the last crumb is not repeated; `chevronAfter`
// leaves a chevron after the last crumb left, so what follows reads as the next crumb.
export function Breadcrumb({ crumbs: all, className = 'px-4 pt-3', hideCurrent = false, chevronAfter = false }: { crumbs: Crumb[]; className?: string; hideCurrent?: boolean; chevronAfter?: boolean }): React.ReactElement | null {
  const crumbs = hideCurrent ? all.slice(0, -1) : all;
  if (crumbs.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Breadcrumb" className={className}>
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
        {chevronAfter ? (
          <li aria-hidden="true" className="flex items-center">
            <ChevronRight className="h-3 w-3" />
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
