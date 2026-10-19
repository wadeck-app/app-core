import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { Crumb } from './navHelpers.js';

// Where the user is. `trail`: earlier crumbs are links, the last one is the current place. `back`: on a detail page or a form
// (a trail of three or more), one link to the page it belongs to; nothing on the menu pages.
export function Breadcrumb({ crumbs, mode }: { crumbs: Crumb[]; mode: 'trail' | 'back' }): React.ReactElement | null {
  if (crumbs.length === 0) {
    return null;
  }
  if (mode === 'back') {
    const parent = crumbs[crumbs.length - 2];
    if (crumbs.length < 3 || parent?.href === undefined) {
      return null;
    }
    return (
      <nav aria-label="Back" className="px-4 pt-3">
        <Link to={parent.href} className="inline-flex items-center gap-1 text-xs text-muted hover:text-content hover:underline">
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {`Back to ${parent.label}`}
        </Link>
      </nav>
    );
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
