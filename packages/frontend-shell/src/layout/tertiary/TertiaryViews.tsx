import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ShellItem } from '@wadeck-app/dsl-ui';
import type { TertiaryNav } from './tertiaryModel.js';

// The placements of the third level. Each takes the same TertiaryNav; none of them changes what a page shows.

const LINK = 'rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

// Accordion: entries listed right under the current page of the side menu (Linear, Notion). They are plain menu entries, indented
// by their icon; the current one is marked like a page, so both the page and its entry are highlighted.
export function accordionEntries(nav: TertiaryNav, parentId: string): ShellItem[] {
  return nav.items.map((item) => ({
    id: `${parentId}#${item.id}`,
    label: item.label,
    href: nav.hrefFor(item.id),
    icon: <span aria-hidden="true" className={`ml-4 inline-block h-1.5 w-1.5 rounded-full ${item.id === nav.activeId ? 'bg-primary' : 'bg-muted/50'}`} />,
    current: item.id === nav.activeId ? ('page' as const) : undefined,
  }));
}

// Pills: a segmented control (Vercel, Linear's view switcher).
export function TertiaryPills({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement {
  return (
    <nav aria-label={label} className="px-4 pt-3">
      <div className="inline-flex gap-0.5 rounded-lg bg-bg-secondary p-0.5">
        {nav.items.map((item) => {
          const current = item.id === nav.activeId;
          return (
            <Link
              key={item.id}
              to={nav.hrefFor(item.id)}
              aria-current={current ? 'page' : undefined}
              className={`${LINK} px-3 py-1 ${current ? 'bg-primary-light font-medium text-primary shadow-sm' : 'text-muted hover:text-content'}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Rail: a sticky list on the right of the page with a line and a marker on the current entry (Stripe docs, Notion).
export function TertiaryRail({ nav, label, children }: { nav: TertiaryNav; label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <nav aria-label={label} className="sticky top-shell-bar mr-4 mt-4 w-44 shrink-0 self-start py-2">
        <p className="mb-2 pl-3 text-xs font-medium text-muted">In this section</p>
        <ul className="border-l border-border">
          {nav.items.map((item) => {
            const current = item.id === nav.activeId;
            return (
              <li key={item.id}>
                <Link
                  to={nav.hrefFor(item.id)}
                  aria-current={current ? 'page' : undefined}
                  className={`${LINK} -ml-px block border-l-2 py-1 pl-3 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

// Flyout: a card that opens to the right of the current page of the side menu (macOS, Figma), on hover, focus or a click on its handle.
// The side menu belongs to the shell, so the card finds its current link in the document and follows it (scroll, resize, menu width).
export function TertiaryFlyout({ nav, label }: { nav: TertiaryNav; label: string }): React.ReactElement | null {
  const [anchor, setAnchor] = useState<{ right: number; top: number; height: number } | undefined>();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const stayOpen = (): void => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short delay so the pointer can cross the gap between the link and the card.
  const leave = (): void => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  };
  useLayoutEffect(() => {
    const currentLink = (): HTMLElement | null => document.querySelector<HTMLElement>('nav[aria-label$=" pages"] a[aria-current="page"]');
    const place = (): void => {
      const link = currentLink();
      if (link === null) {
        setAnchor(undefined);
        return;
      }
      const rect = link.getBoundingClientRect();
      setAnchor((prev) => (prev !== undefined && prev.right === rect.right && prev.top === rect.top && prev.height === rect.height ? prev : { right: rect.right, top: rect.top, height: rect.height }));
    };
    place();
    const link = currentLink();
    link?.addEventListener('pointerenter', stayOpen);
    link?.addEventListener('pointerleave', leave);
    link?.addEventListener('focus', stayOpen);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    // The link moves when the menu is resized or its entries change: the observer says so, no polling.
    const observer = new ResizeObserver(place);
    observer.observe(document.body);
    if (link !== null) {
      observer.observe(link);
    }
    return () => {
      link?.removeEventListener('pointerenter', stayOpen);
      link?.removeEventListener('pointerleave', leave);
      link?.removeEventListener('focus', stayOpen);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer.disconnect();
      window.clearTimeout(closeTimer.current);
    };
  }, [nav.activeId]);
  if (anchor === undefined) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        aria-label={`${label}: open`}
        aria-expanded={open}
        onClick={stayOpen}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
        onPointerEnter={stayOpen}
        onPointerLeave={leave}
        style={{ left: anchor.right - 24, top: anchor.top + (anchor.height - 20) / 2 }}
        className="fixed z-20 flex h-5 w-5 items-center justify-center rounded text-primary outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <nav
          aria-label={label}
          onPointerEnter={stayOpen}
          onPointerLeave={leave}
          onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          style={{ left: anchor.right + 6, top: anchor.top - 4 }}
          className="fixed z-20 w-44 rounded-lg border border-border bg-bg-secondary p-1 shadow-lg"
        >
          <span aria-hidden="true" className="absolute -left-1.5 top-3 h-3 w-3 rotate-45 border-b border-l border-border bg-bg-secondary" />
          <ul className="relative space-y-0.5">
            {nav.items.map((item) => {
              const current = item.id === nav.activeId;
              return (
                <li key={item.id}>
                  <Link
                    to={nav.hrefFor(item.id)}
                    onClick={() => setOpen(false)}
                    aria-current={current ? 'page' : undefined}
                    className={`${LINK} block px-2 py-1.5 ${current ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </>
  );
}

// Breadcrumb switcher: the entry after the last crumb is a button that opens the list (GitHub, Vercel).
export function TertiaryCrumb({ nav }: { nav: TertiaryNav }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const active = nav.items.find((i) => i.id === nav.activeId);
  return (
    <li ref={root} className="relative flex items-center gap-1">
      <ChevronRight className="h-3 w-3 text-muted" aria-hidden="true" />
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${LINK} flex items-center gap-0.5 px-1 text-xs font-medium text-content hover:bg-bg-secondary`}
      >
        {active?.label}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <ul role="menu" className="absolute left-0 top-full z-30 mt-1 w-40 rounded-lg border border-border bg-bg-secondary p-1 shadow-lg">
          {nav.items.map((item) => (
            <li key={item.id} role="none">
              <Link
                role="menuitem"
                to={nav.hrefFor(item.id)}
                onClick={() => setOpen(false)}
                aria-current={item.id === nav.activeId ? 'page' : undefined}
                className={`${LINK} block px-2 py-1.5 ${item.id === nav.activeId ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg'}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
