import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from '../Breadcrumb.js';
import { BreadcrumbTrail } from '../breadcrumb/BreadcrumbTrail.js';
import { Logo } from '../Logo.js';
import type { Crumb } from '../navHelpers.js';
import type { TertiaryNav } from './tertiaryModel.js';
import { StyledColumn } from './TertiaryStyles.js';
import { TertiaryCrumb, TertiaryPills, TertiaryRail } from './TertiaryViews.js';

// The trail and the third level in ONE sticky header, under the top bar (the trail and the level stay in view while the page
// scrolls). Each variant is a way to lay the two out; when one is chosen it replaces the separate "Third menu level" and
// "Breadcrumb" tests of the dock.

export type HeaderVariant = 'off' | 'stack' | 'inline' | 'title' | 'condense' | 'path' | 'crumb' | 'column' | 'rail' | 'tinted' | 'headroom';

export function useHeaderVariant(): HeaderVariant {
  const test = useAbTest<HeaderVariant>({
    id: 'shell-header',
    label: 'Sticky header',
    initial: 'off',
    options: {
      off: { label: 'Off', hint: 'Use the separate tests below (third menu level, breadcrumb). The reference.' },
      stack: { label: 'Stack', hint: 'The trail, then the tabs, two rows in one sticky block (the way repository pages of code hosts do it).' },
      inline: { label: 'Inline', hint: 'One row: the trail on the left, the tabs on the right. Takes the least height.' },
      title: { label: 'Title row', hint: 'The trail, then a row with the page name on the left and a segmented control on the right (Linear, Notion). The page keeps its own heading.' },
      condense: { label: 'Condense', hint: 'Two rows at the top of the page, one row as soon as the page is scrolled (like the top bar does).' },
      path: { label: 'Path chips', hint: 'One row: the module logo and the path in a monospace font, the entries as chips on the right.' },
      crumb: { label: 'Crumb only', hint: 'One row: the last crumb is the switcher of the third level. Nothing else takes room.' },
      column: { label: 'Trail + column', hint: 'The trail is sticky, and the third level is a sticky column under it.' },
      rail: { label: 'Trail + rail', hint: 'The trail is sticky, and the third level is a sticky list on the right under it.' },
      tinted: { label: 'Tinted', hint: 'Two tiers: the trail on a band tinted with the color of the module, the tabs under it (Salesforce-like).' },
      headroom: { label: 'Headroom', hint: 'The two rows hide when scrolling down and come back as soon as you scroll up a little (Medium, many mobile apps).' },
    },
  });
  useRegisterAbTests([test]);
  return test.value;
}

const STICKY = 'sticky top-shell-bar z-10 bg-bg';
// The height of a one-row trail, for what sticks under it.
const TRAIL_HEIGHT = '2.75rem';

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
            className={`${LINK} border-b-2 px-1 py-2 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}
          >
            {item.label}
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
            className={`${LINK} shrink-0 border px-3 py-0.5 ${current ? 'border-primary bg-primary-light font-medium text-primary' : 'border-border text-content hover:border-muted'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
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

  switch (variant) {
    case 'stack':
      return (
        <>
          <div className={`${STICKY} border-b border-border`}>
            {trail}
            <RowTabsPadded nav={nav} label={label} />
          </div>
          {children}
        </>
      );
    case 'inline':
      return (
        <>
          <div className={`${STICKY} flex items-end justify-between gap-4 overflow-x-auto border-b border-border px-4`}>
            <div className="shrink-0 pb-2">{bareTrail}</div>
            <RowTabs nav={nav} label={label} />
          </div>
          {children}
        </>
      );
    case 'title':
      return (
        <>
          <div className={`${STICKY} border-b border-border pb-2`}>
            {trail}
            <div className="flex items-center justify-between gap-4 px-4 pt-1">
              <p className="truncate text-lg font-semibold text-content">{title}</p>
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
          {scroll.scrolled ? (
            <div className={`${STICKY} flex items-end justify-between gap-4 overflow-x-auto border-b border-border px-4`}>
              <div className="shrink-0 pb-2">{bareTrail}</div>
              <RowTabs nav={nav} label={label} />
            </div>
          ) : (
            <div className={`${STICKY} border-b border-border`}>
              {trail}
              <RowTabsPadded nav={nav} label={label} />
            </div>
          )}
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
    case 'crumb':
      return (
        <>
          <div className={`${STICKY} border-b border-border pb-2`}>
            <Breadcrumb crumbs={crumbs} trailing={<TertiaryCrumb nav={nav} />} />
          </div>
          {children}
        </>
      );
    case 'column':
      return (
        <>
          <div className={`${STICKY} border-b border-border pb-2`}>{trail}</div>
          <StyledColumn nav={nav} label={label} title={title} style="plain" stickyOffset={TRAIL_HEIGHT}>
            {children}
          </StyledColumn>
        </>
      );
    case 'rail':
      return (
        <>
          <div className={`${STICKY} border-b border-border pb-2`}>{trail}</div>
          <TertiaryRail nav={nav} label={label} stickyOffset={TRAIL_HEIGHT}>
            {children}
          </TertiaryRail>
        </>
      );
    case 'tinted':
      return (
        <>
          <div className={`${STICKY} border-b border-border`}>
            <div className="flex items-center gap-2 bg-primary-light px-4 py-1.5">
              {moduleId === undefined ? null : (
                <span aria-hidden="true" className="flex">
                  <Logo title={crumbs[0]?.label ?? moduleId} moduleId={moduleId} />
                </span>
              )}
              {bareTrail}
            </div>
            <RowTabsPadded nav={nav} label={label} />
          </div>
          {children}
        </>
      );
    case 'headroom':
      return (
        <>
          <div className={`${STICKY} border-b border-border transition-transform duration-200 ${hidden ? '-translate-y-full' : 'translate-y-0'}`}>
            {trail}
            <RowTabsPadded nav={nav} label={label} />
          </div>
          {children}
        </>
      );
  }
}

// RowTabs with the page's side padding, to sit under a padded trail.
function RowTabsPadded({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <div className="px-4 pt-1">
      <RowTabs nav={nav} label={label} />
    </div>
  );
}

