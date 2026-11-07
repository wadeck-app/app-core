import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { TertiaryItem, TertiaryNav } from './tertiaryModel.js';

// Variations inside the three families the A/B test is undecided about (tabs, sub-bar, column). Same entries, same links, same
// current-entry marking as TertiaryViews.tsx; only the dress and the position change.

const LINK = 'rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

const Count = ({ item, current }: { item: TertiaryItem; current: boolean }): React.ReactElement | null =>
  item.count === undefined ? null : (
    <span className={`ml-1.5 rounded-full px-1.5 text-xs ${current ? 'bg-primary-light text-primary' : 'bg-muted-bg text-muted'}`}>{item.count}</span>
  );

// ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TabsStyle = 'line' | 'count' | 'band' | 'sticky';

// Underlined tabs. `count`: a figure next to the label (Jira, Zendesk). `sticky`: stuck under the top bar with the page scrolling
// under it (GitHub). `lead`: put before the tabs in the same band (the trail, for `band`).
export function StyledTabs({ nav, label, style, lead }: { nav: TertiaryNav; label: string; style: TabsStyle; lead?: React.ReactNode }): React.ReactElement {
  const band = style === 'band';
  return (
    <div className={`${style === 'sticky' ? 'sticky top-shell-bar z-10 bg-bg' : ''} ${band ? 'border-b border-border bg-bg-secondary' : ''}`}>
      {lead}
      <nav aria-label={label} className={`flex gap-5 px-4 ${band ? 'pt-1' : 'mt-2'} ${band ? '' : 'border-b border-border'}`}>
        {nav.items.map((item) => {
          const current = item.id === nav.activeId;
          return (
            <Link
              key={item.id}
              to={nav.hrefFor(item.id)}
              aria-current={current ? 'page' : undefined}
              className={`${LINK} -mb-px flex items-center border-b-2 px-1 pb-2 pt-1 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}
            >
              {item.label}
              {style === 'count' ? <Count item={item} current={current} /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ── Sub-bar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SubBarStyle = 'chips' | 'merged' | 'segmented' | 'tabs';

// A thin bar stuck under the top bar. `lead` is what is on its left: the page name, or the trail (`merged`: one bar instead of two).
// `chips` are outlined (Shopify), `segmented` is one control (Notion), `tabs` are underlined and run the full height (Vercel).
export function StyledSubBar({ nav, label, style, lead }: { nav: TertiaryNav; label: string; style: SubBarStyle; lead: React.ReactNode }): React.ReactElement {
  const entries = nav.items.map((item) => {
    const current = item.id === nav.activeId;
    const common = { to: nav.hrefFor(item.id), 'aria-current': current ? ('page' as const) : undefined };
    if (style === 'segmented') {
      return (
        <Link key={item.id} {...common} className={`${LINK} px-3 py-0.5 ${current ? 'bg-bg font-medium text-primary shadow-sm' : 'text-muted hover:text-content'}`}>
          {item.label}
        </Link>
      );
    }
    if (style === 'tabs') {
      return (
        <Link key={item.id} {...common} className={`${LINK} flex items-center self-stretch rounded-none border-b-2 px-1 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}>
          {item.label}
        </Link>
      );
    }
    return (
      <Link key={item.id} {...common} className={`${LINK} shrink-0 border px-3 py-0.5 ${current ? 'border-primary bg-primary-light font-medium text-primary' : 'border-border text-content hover:border-muted'}`}>
        {item.label}
      </Link>
    );
  });
  return (
    <nav aria-label={label} className={`sticky top-shell-bar z-10 flex items-center gap-3 overflow-x-auto border-b border-border bg-bg-secondary px-4 ${style === 'tabs' ? 'py-0' : 'py-1.5'}`}>
      <div className="shrink-0 text-xs font-medium text-muted">{lead}</div>
      {style === 'segmented' ? (
        <div className="ml-auto inline-flex shrink-0 gap-0.5 rounded-lg bg-muted-bg p-0.5">{entries}</div>
      ) : (
        <div className={`flex min-w-0 items-center self-stretch ${style === 'tabs' ? 'gap-5' : 'gap-2'} ${style === 'merged' || style === 'tabs' ? 'ml-auto' : ''}`}>{entries}</div>
      )}
    </nav>
  );
}

// ── Column ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ColumnStyle = 'plain' | 'collapsible' | 'card' | 'headed';

const COLLAPSED_KEY = 'app-core.tertiary-column-collapsed';
const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

// A list between the side menu and the page. `collapsible`: folds to a strip of initials (Slack, Linear; kept in this browser).
// `card`: a floating card instead of a full-height rule (Notion settings). `headed`: a heading and a second line under each entry
// (Stripe settings, Intercom).
export function StyledColumn({ nav, label, title, style, children }: { nav: TertiaryNav; label: string; title: string; style: ColumnStyle; children: React.ReactNode }): React.ReactElement {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const fold = style === 'collapsible' && collapsed;
  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Not kept: the column still folds for this visit.
    }
  };
  const frame =
    style === 'card'
      ? 'sticky top-shell-bar m-4 mr-0 w-48 shrink-0 self-start rounded-xl border border-border bg-bg-secondary p-2 shadow-sm'
      : `sticky top-shell-bar shrink-0 self-start border-r border-border px-3 py-4 ${fold ? 'w-14' : style === 'headed' ? 'w-60' : 'w-48'}`;
  return (
    <div className="flex items-start">
      <nav aria-label={label} className={frame}>
        {style === 'collapsible' ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={fold ? `Expand ${label}` : `Collapse ${label}`}
            aria-expanded={!fold}
            className={`${LINK} mb-2 flex h-6 w-6 items-center justify-center text-muted hover:bg-bg-secondary hover:text-content ${fold ? 'mx-auto' : 'ml-auto'}`}
          >
            {fold ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
        {fold ? null : style === 'headed' ? (
          <div className="mb-3 px-2">
            <p className="truncate text-base font-semibold text-content">{title}</p>
            <p className="text-xs text-muted">{nav.items.length} sections</p>
          </div>
        ) : (
          <p className="mb-2 truncate px-2 text-xs font-medium text-muted">{title}</p>
        )}
        <ul className="space-y-0.5">
          {nav.items.map((item) => {
            const current = item.id === nav.activeId;
            return (
              <li key={item.id}>
                <Link
                  to={nav.hrefFor(item.id)}
                  title={fold ? item.label : undefined}
                  aria-label={fold ? item.label : undefined}
                  aria-current={current ? 'page' : undefined}
                  className={`${LINK} block px-2 py-1.5 ${fold ? 'text-center' : ''} ${current ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg-secondary'}`}
                >
                  {fold ? item.label.slice(0, 2) : item.label}
                  {style === 'headed' && !fold && item.caption !== undefined ? <span className="block text-xs font-normal text-muted">{item.caption}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
