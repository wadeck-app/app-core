import React from 'react';
import { Link } from 'react-router-dom';
import { CountBadge } from './CountBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';

// The tabs of the third level, under the trail, in the sticky block at the top of the page. Their look is not decided here: it is the
// third level of the look of the whole navigation (src/navStyles.css, A/B test `shell-nav-style`), so that the top bar, the side menu
// and these tabs say "current" the same way. The inactive state is the same classes as the tabs of the top bar and the rows of the
// side menu.
export function TertiaryTabs({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <nav aria-label={label} data-nav-level="tertiary" className="flex gap-1 px-4 pt-1">
      {nav.items.map((item) => {
        const current = item.id === nav.activeId;
        return (
          <Link
            key={item.id}
            to={nav.hrefFor(item.id)}
            aria-current={current ? 'page' : undefined}
            className={`flex items-center px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${current ? '' : 'text-muted hover:bg-muted-bg hover:text-content'}`}
          >
            {item.label}
            <CountBadge count={item.count} current={current} />
          </Link>
        );
      })}
    </nav>
  );
}
