import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from '../Breadcrumb.js';
import { BreadcrumbTrail } from '../breadcrumb/BreadcrumbTrail.js';
import type { Crumb } from '../navHelpers.js';
import { CountBadge } from './CountBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';
import { TertiaryPills } from './TertiaryViews.js';

// The trail and the third level in ONE sticky header, under the top bar: they stay in view while the page scrolls, as a single block
// (two sticky bars would stick at the same place and hide each other). It is the last row of the dock because, once a variant is
// chosen, it lays out the trail and the third level itself and the rows above only keep their choice.
//
// What these variants are built on (design-system documentation, read in November 2026; see the notes of the A/B test):
// - the third level is a horizontal row of links to distinct addresses inside the page (Carbon: "use tabs within the page"; PatternFly:
//   "secondary horizontal navigation"; Primer: tabs "directly above the content" they affect);
// - the trail stays above the page title, top left (Atlassian, Carbon);
// - never two tab bars stacked to express levels (Primer, NN/g);
// - a sticky header costs screen height (NN/g: "minimize the vertical height"), so some variants take one row, or fall to one.

export type HeaderVariant = 'off' | 'stack' | 'inline' | 'title' | 'condense' | 'path' | 'headroom';

export function useHeaderVariant(): HeaderVariant {
  const test = useAbTest<HeaderVariant>({
    id: 'shell-header',
    label: 'Sticky header (overrides the rows above)',
    initial: 'off',
    options: {
      off: { label: 'Off', hint: 'The rows above decide (third menu level, breadcrumb). The reference.' },
      stack: { label: 'Stack', hint: 'The trail, then the tabs: two rows in one sticky block. The trail stays above the title, top left.' },
      inline: { label: 'Inline', hint: 'One row: the trail on the left, the tabs on the right. The least sticky height.' },
      title: { label: 'Title row', hint: 'The trail, then a row with the page name followed by the chosen entry, and a segmented control: the title follows the selected entry.' },
      condense: { label: 'Condense', hint: 'Two rows at the top of the page, one row as soon as the page is scrolled: full information at rest, least height while reading.' },
      path: { label: 'Path chips', hint: 'One row: the module logo and the path in a monospace font, the entries as chips on the right.' },
      headroom: { label: 'Headroom', hint: 'The two rows hide when scrolling down and come back when you scroll up a little: no sticky height while reading.' },
    },
  });
  useRegisterAbTests([test]);
  return test.value;
}

const STICKY = 'sticky top-shell-bar z-10 bg-bg';

const LINK = 'rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

// Tabs for a row that is as high as its text: underline, no margin of their own.
function RowTabs({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <nav aria-label={label} className="flex gap-5">
      {nav.items.map((item) => {
        const current = item.id === nav.activeId;
        return (
          <Link
            key={item.id}
            to={nav.hrefFor(item.id)}
            aria-current={current ? 'page' : undefined}
            className={`${LINK} flex items-center border-b-2 px-1 py-2 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}
          >
            {item.label}
            <CountBadge count={item.count} current={current} />
          </Link>
        );
      })}
    </nav>
  );
}

function RowChips({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <nav aria-label={label} className="flex gap-2">
      {nav.items.map((item) => {
        const current = item.id === nav.activeId;
        return (
          <Link
            key={item.id}
            to={nav.hrefFor(item.id)}
            aria-current={current ? 'page' : undefined}
            className={`${LINK} flex shrink-0 items-center border px-3 py-0.5 ${current ? 'border-primary bg-primary-light font-medium text-primary' : 'border-border text-content hover:border-muted'}`}
          >
            {item.label}
            <CountBadge count={item.count} current={current} />
          </Link>
        );
      })}
    </nav>
  );
}

// RowTabs with the page's side padding, to sit under a padded trail.
function RowTabsPadded({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <div className="px-4 pt-1">
      <RowTabs nav={nav} label={label} />
    </div>
  );
}

// True once the page is scrolled: a sentinel at the top leaves the viewport (no scroll listener).
function useScrolled(): { scrolled: boolean; sentinel: React.RefObject<HTMLDivElement | null> } {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (el === null || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setScrolled(entry !== undefined && !entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { scrolled, sentinel };
}

// Hides when the page goes down past 80px, shows again after scrolling up 24px.
function useHeadroom(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let upFrom = last;
    const onScroll = (): void => {
      const y = window.scrollY;
      if (y > last && y > 80) {
        setHidden(true);
        upFrom = y;
      } else if (y < last && (upFrom - y > 24 || y <= 80)) {
        setHidden(false);
      }
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return hidden;
}

export function StickyHeader({
  variant,
  nav,
  title,
  moduleId,
  crumbs,
  children,
}: {
  variant: Exclude<HeaderVariant, 'off'>;
  nav: TertiaryNav;
  title: string;
  moduleId: string | undefined;
  crumbs: Crumb[];
  children: React.ReactNode;
}): React.ReactElement {
  const label = `${title} sections`;
  const scroll = useScrolled();
  const hidden = useHeadroom();
  const trail = <Breadcrumb crumbs={crumbs} />;
  const bareTrail = <Breadcrumb crumbs={crumbs} bare />;
  const activeLabel = nav.items.find((i) => i.id === nav.activeId)?.label;
  const oneRow = (
    <div className={`${STICKY} flex items-end justify-between gap-4 overflow-x-auto border-b border-border px-4`}>
      <div className="shrink-0 pb-2">{bareTrail}</div>
      <RowTabs nav={nav} label={label} />
    </div>
  );
  const twoRows = (extraClass = ''): React.ReactElement => (
    <div className={`${STICKY} border-b border-border ${extraClass}`}>
      {trail}
      <RowTabsPadded nav={nav} label={label} />
    </div>
  );

  switch (variant) {
    case 'stack':
      return (
        <>
          {twoRows()}
          {children}
        </>
      );
    case 'inline':
      return (
        <>
          {oneRow}
          {children}
        </>
      );
    case 'title':
      return (
        <>
          <div className={`${STICKY} border-b border-border pb-2`}>
            {trail}
            <div className="flex items-center justify-between gap-4 px-4 pt-1">
              <p className="truncate text-lg font-semibold text-content">
                {title}
                {activeLabel === undefined ? null : <span className="font-normal text-muted"> · {activeLabel}</span>}
              </p>
              <TertiaryPills nav={nav} label={label} bare />
            </div>
          </div>
          {children}
        </>
      );
    case 'condense':
      return (
        <>
          <div ref={scroll.sentinel} aria-hidden="true" className="h-px" />
          {scroll.scrolled ? oneRow : twoRows()}
          {children}
        </>
      );
    case 'path':
      return (
        <>
          <div className={`${STICKY} flex items-center justify-between gap-4 overflow-x-auto border-b border-border px-4 py-1.5`}>
            <div className="shrink-0">
              <BreadcrumbTrail variant="path" crumbs={crumbs} moduleId={moduleId} />
            </div>
            <RowChips nav={nav} label={label} />
          </div>
          {children}
        </>
      );
    case 'headroom':
      return (
        <>
          {twoRows(`transition-transform duration-200 ${hidden ? '-translate-y-full' : 'translate-y-0'}`)}
          {children}
        </>
      );
  }
}
