import React from 'react';
import { Link } from 'react-router-dom';
import type { ShellItem } from '@wadeck-app/dsl-ui';
import { CountBadge } from './CountBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';

const LINK = 'rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

// Accordion: entries listed right under the current page of the side menu. They are plain menu entries, indented by their icon; the
// current one is marked like a page, so both the page and its entry are highlighted. The shell's menu entry has no slot for a
// figure yet, so an entry's count is not shown here (dsl-ui's ShellItem would need one).
export function accordionEntries(nav: TertiaryNav, parentId: string): ShellItem[] {
  return nav.items.map((item) => ({
    id: `${parentId}#${item.id}`,
    label: item.label,
    href: nav.hrefFor(item.id),
    icon: <span aria-hidden="true" className={`ml-4 inline-block h-1.5 w-1.5 rounded-full ${item.id === nav.activeId ? 'bg-primary' : 'bg-muted/50'}`} />,
    current: item.id === nav.activeId ? ('page' as const) : undefined,
  }));
}

// A segmented control, for the title row of a sticky header.
export function TertiaryPills({ nav, label, bare = false }: { nav: TertiaryNav; label: string; bare?: boolean }): React.ReactElement {
  return (
    <nav aria-label={label} className={bare ? '' : 'px-4 pt-3'}>
      <div className="inline-flex gap-0.5 rounded-lg bg-bg-secondary p-0.5">
        {nav.items.map((item) => {
          const current = item.id === nav.activeId;
          return (
            <Link
              key={item.id}
              to={nav.hrefFor(item.id)}
              aria-current={current ? 'page' : undefined}
              className={`${LINK} flex items-center px-3 py-1 ${current ? 'bg-primary-light font-medium text-primary shadow-sm' : 'text-muted hover:text-content'}`}
            >
              {item.label}
              <CountBadge count={item.count} current={current} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
