import React from 'react';
import { Link } from 'react-router-dom';
import { CountBadge } from './CountBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';

// Variations inside the two families the A/B test keeps (tabs, sub-bar). Same entries, same links, same
// current-entry marking as TertiaryViews.tsx; only the dress and the position change.

const LINK = 'rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

// ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TabsStyle = 'line' | 'band' | 'sticky';

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
              <CountBadge count={item.count} current={current} />
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
        <Link key={item.id} {...common} className={`${LINK} flex items-center px-3 py-0.5 ${current ? 'bg-bg font-medium text-primary shadow-sm' : 'text-muted hover:text-content'}`}>
          {item.label}
          <CountBadge count={item.count} current={current} />
        </Link>
      );
    }
    if (style === 'tabs') {
      return (
        <Link key={item.id} {...common} className={`${LINK} flex items-center self-stretch rounded-none border-b-2 px-1 ${current ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`}>
          {item.label}
          <CountBadge count={item.count} current={current} />
        </Link>
      );
    }
    return (
      <Link key={item.id} {...common} className={`${LINK} flex shrink-0 items-center border px-3 py-0.5 ${current ? 'border-primary bg-primary-light font-medium text-primary' : 'border-border text-content hover:border-muted'}`}>
        {item.label}
        <CountBadge count={item.count} current={current} />
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
