import React from 'react';
import { Link } from 'react-router-dom';
import { IndicatorBadge } from './IndicatorBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';

// The tabs of the third level, under the trail, in the sticky block at the top of the page. They say "current" the way dsl-ui's AppShell
// does for the tabs of the top bar and the rows of the side menu (the "rail" look: grey fill, text color, a 3px accent bar on the inner
// edge, square corners), with the same classes, because AppShell does not draw this level.
export function TertiaryTabs({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement | null {
  // A page without a third level shows nothing.
  if (nav.items.length === 0) {
    return null;
  }
  return (
    // pt-3: room between the trail above and the tabs.
    <nav aria-label={label} className="flex gap-1 px-4 pt-3">
      {nav.items.map((item) => {
        const current = item.id === nav.activeId;
        return (
          <Link
            key={item.id}
            to={item.href}
            aria-current={current ? 'page' : undefined}
            className={`flex items-center px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${current ? 'bg-muted-bg font-medium text-content shadow-[inset_0_-3px_0_0_var(--color-primary)]' : 'text-muted hover:bg-muted-bg hover:text-content'}`}
          >
            {item.label}
            <IndicatorBadge indicator={item.indicator} current={current} />
          </Link>
        );
      })}
    </nav>
  );
}
