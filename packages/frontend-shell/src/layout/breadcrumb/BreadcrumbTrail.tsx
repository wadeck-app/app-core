import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Breadcrumb } from '../Breadcrumb.js';
import { Logo } from '../Logo.js';
import type { Crumb } from '../navHelpers.js';
import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

export type BreadcrumbVariant = 'classic' | 'sticky' | 'path' | 'back' | 'right' | 'bar';

// One row of the A/B dock: where and how the trail of nested pages is drawn.
// `replaced`: a sticky header (shell-header) lays out the trail itself, so this row is left out of the dock.
export function useBreadcrumbVariant(replaced = false): BreadcrumbVariant {
  const test = useAbTest<BreadcrumbVariant>({
    id: 'shell-breadcrumb',
    label: 'Breadcrumb',
    initial: 'classic',
    options: {
      classic: { label: 'Classic', hint: 'As it is today: small text above the page, left. The reference.' },
      sticky: { label: 'Sticky', hint: 'GitHub: a band stuck under the top bar, so the trail stays in view while the page scrolls.' },
      path: { label: 'Path', hint: 'Vercel, GitHub paths: the module logo, then names separated by slashes in a monospace font.' },
      back: { label: 'Back', hint: 'Linear, iOS: only a "back to the parent" link and the name of the current page.' },
      right: { label: 'Right', hint: 'Stripe: the trail on the right of the page, out of the way of the title.' },
      bar: { label: 'Bottom bar', hint: 'macOS Finder path bar: the trail in a bar at the bottom of the content area.' },
    },
  });
  useRegisterAbTests(replaced ? [] : [test]);
  return test.value;
}

const LINK = 'rounded outline-none hover:text-content hover:underline focus-visible:ring-2 focus-visible:ring-primary';

// A trail of nested pages in the style the A/B test picked. `trailing` is an extra item after the last crumb (a switcher).
export function BreadcrumbTrail({ variant, crumbs, moduleId, trailing }: { variant: BreadcrumbVariant; crumbs: Crumb[]; moduleId?: string; trailing?: React.ReactNode }): React.ReactElement | null {
  if (crumbs.length === 0) {
    return null;
  }
  const last = crumbs[crumbs.length - 1] as Crumb;
  switch (variant) {
    case 'sticky':
      return (
        <div className="sticky top-shell-bar z-10 border-b border-border bg-bg pb-2">
          <Breadcrumb crumbs={crumbs} trailing={trailing} />
        </div>
      );
    case 'path':
      return (
        <nav aria-label="Breadcrumb" className="px-4 pt-3">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted">
            {moduleId === undefined ? null : (
              <li aria-hidden="true" className="mr-1 flex">
                <Logo title={crumbs[0]?.label ?? moduleId} moduleId={moduleId} />
              </li>
            )}
            {crumbs.map((crumb, i) => (
              <li key={`${i}-${crumb.label}`} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href === undefined ? (
                  <span aria-current="page" className="font-semibold text-content">
                    {crumb.label}
                  </span>
                ) : (
                  <Link to={crumb.href} className={LINK}>
                    {crumb.label}
                  </Link>
                )}
              </li>
            ))}
            {trailing}
          </ol>
        </nav>
      );
    case 'back': {
      const parent = [...crumbs].reverse().find((c, i) => i > 0 && c.href !== undefined);
      return (
        <nav aria-label="Breadcrumb" className="px-4 pt-3">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {parent === undefined ? null : (
              <li className="flex items-center">
                <Link to={parent.href as string} className={`${LINK} flex items-center gap-1`}>
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {parent.label}
                </Link>
                <span aria-hidden="true" className="ml-2 h-4 w-px bg-border" />
              </li>
            )}
            <li aria-current="page" className="font-medium text-content">
              {last.label}
            </li>
            {trailing}
          </ol>
        </nav>
      );
    }
    case 'right':
      return (
        <div className="flex justify-end">
          <Breadcrumb crumbs={crumbs} trailing={trailing} />
        </div>
      );
    case 'bar':
      return (
        <>
          {/* Room for the bar, so it never hides the end of the page. */}
          <div aria-hidden="true" className="h-10" />
          <div className="fixed bottom-0 left-[var(--app-shell-menu-width,15rem)] right-0 z-10 flex items-center border-t border-border bg-bg-secondary px-4 py-1.5">
            <Breadcrumb crumbs={crumbs} trailing={trailing} bare />
          </div>
        </>
      );
    default:
      return <Breadcrumb crumbs={crumbs} trailing={trailing} />;
  }
}
