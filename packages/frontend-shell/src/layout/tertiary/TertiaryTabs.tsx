import React from 'react';
import { Link } from 'react-router-dom';
import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import { CountBadge } from './CountBadge.js';
import type { TertiaryNav } from './tertiaryModel.js';

// The tabs of the third level, under the trail, in the sticky block at the top of the page. Decided: the third level is a row of
// links under the trail (a task opens, its three sections are tabs), the trail and the tabs stick together. What is still open is the
// DRESS of the tabs: each style borrows from a part of the app (the page tabs of dsl-ui, the rows of the side menu, the glow of the
// top bar tabs, the chip buttons).

export type TabsStyle = 'off' | 'line' | 'menu' | 'glow' | 'segmented' | 'chips' | 'folder';

export function useTabsStyle(): TabsStyle {
  const test = useAbTest<TabsStyle>({
    id: 'shell-tabs-style',
    label: 'Tabs style',
    initial: 'line',
    options: {
      off: { label: 'Off', hint: 'No third level (as long as no page declares one, these tabs are samples shown only with the A/B dock).' },
      line: { label: 'Line', hint: 'Underline under the current tab: the page tabs of dsl-ui.' },
      menu: { label: 'Menu row', hint: 'The current tab is a filled rounded row, like the current page in the side menu.' },
      glow: { label: 'Glow', hint: 'The current tab has the accent glow of the top bar tabs.' },
      segmented: { label: 'Segmented', hint: 'One rounded control, the current segment raised.' },
      chips: { label: 'Chips', hint: 'Rounded outlined chips, the current one in the accent color.' },
      folder: { label: 'Folder', hint: 'The current tab is joined to the page below it, like a folder tab.' },
    },
  });
  useRegisterAbTests([test]);
  return test.value;
}

const LINK = 'flex items-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';

// The glow of the top bar tabs (dsl-ui ShellTabs): a fade of the accent from the bottom edge and a small glow at its center.
const GLOW = {
  backgroundImage:
    'radial-gradient(60% 90% at 50% 100%, color-mix(in srgb, var(--color-primary) 55%, transparent), transparent 100%), linear-gradient(0deg, color-mix(in srgb, var(--color-primary) 26%, transparent), transparent)',
} as const;

interface Look {
  // Around the links.
  nav: string;
  // The group of links, when the style needs one (segmented).
  group?: string;
  link: (current: boolean) => string;
  style?: (current: boolean) => React.CSSProperties | undefined;
}

const LOOKS: Record<Exclude<TabsStyle, 'off'>, Look> = {
  line: {
    nav: 'flex gap-5 px-4 pt-1',
    link: (c) => `-mb-px border-b-2 px-1 pb-2 pt-1 ${c ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`,
  },
  menu: {
    nav: 'flex gap-1 px-4 pb-2 pt-1',
    link: (c) => `rounded-md px-3 py-1.5 ${c ? 'bg-primary-light font-medium text-primary' : 'text-muted hover:bg-bg-secondary hover:text-content'}`,
  },
  glow: {
    nav: 'flex gap-1 px-4 pt-1',
    link: (c) => `-mb-px rounded-t-md border-b-2 px-4 py-2 ${c ? 'border-primary font-medium text-primary' : 'border-transparent text-muted hover:text-content'}`,
    style: (c) => (c ? GLOW : undefined),
  },
  segmented: {
    nav: 'px-4 pb-2 pt-1',
    group: 'inline-flex gap-0.5 rounded-lg bg-muted-bg p-0.5',
    link: (c) => `rounded-md px-3 py-1 ${c ? 'bg-surface font-medium text-primary shadow-sm' : 'text-muted hover:text-content'}`,
  },
  chips: {
    nav: 'flex gap-2 px-4 pb-2 pt-1',
    link: (c) => `rounded-full border px-3 py-0.5 ${c ? 'border-primary bg-primary-light font-medium text-primary' : 'border-border text-content hover:border-muted'}`,
  },
  folder: {
    nav: 'flex gap-1 px-4 pt-1',
    // Over the rule of the block, with the page's background: the current tab and the page below are one surface.
    link: (c) => `relative -mb-px rounded-t-md border border-b-0 px-4 py-1.5 ${c ? 'border-border bg-bg font-medium text-primary' : 'border-transparent text-muted hover:bg-bg-secondary hover:text-content'}`,
  },
};

export function TertiaryTabs({ nav, label, style }: { nav: TertiaryNav; label: string; style: Exclude<TabsStyle, 'off'> }): React.ReactElement {
  const look = LOOKS[style];
  const links = nav.items.map((item) => {
    const current = item.id === nav.activeId;
    return (
      <Link key={item.id} to={nav.hrefFor(item.id)} aria-current={current ? 'page' : undefined} style={look.style?.(current)} className={`${LINK} ${look.link(current)}`}>
        {item.label}
        <CountBadge count={item.count} current={current} />
      </Link>
    );
  });
  return (
    <nav aria-label={label} className={look.nav}>
      {look.group === undefined ? links : <div className={look.group}>{links}</div>}
    </nav>
  );
}
