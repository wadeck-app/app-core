import React from 'react';
import type { LayoutVariant } from './LayoutSwitcher.js';
import { SidebarTreeLayout } from './SidebarTreeLayout.js';
import { TopTabsLayout } from './TopTabsLayout.js';
import type { LayoutProps } from './types.js';

export type NewLayoutVariant = Exclude<LayoutVariant, 'classic'>;

// Single place mapping a variant id to its layout, shared by the real app and the dev comparison page.
export function LayoutByVariant({ variant, ...props }: LayoutProps & { variant: NewLayoutVariant }): React.ReactElement {
  switch (variant) {
    case 'a':
      return <TopTabsLayout {...props} />;
    case 'b':
      return <SidebarTreeLayout {...props} />;
    case 'c':
      return <TopTabsLayout {...props} collapsible />;
    case 'd':
      return <TopTabsLayout {...props} sidebar="always" />;
    case 'd1':
      return <TopTabsLayout {...props} sidebar="always" look="accent" />;
    case 'd2':
      return <TopTabsLayout {...props} sidebar="always" look="pills" logo="initial" />;
    case 'd3':
      return <TopTabsLayout {...props} sidebar="always" look="dark" logo="initial" />;
    case 'd4':
      return <TopTabsLayout {...props} sidebar="always" look="pills" logo="duo" />;
    case 'd5':
      return <TopTabsLayout {...props} sidebar="always" look="dark" logo="duo" />;
    case 'd6':
      return <TopTabsLayout {...props} sidebar="always" look="pills" logo="duo-colored" />;
    case 'd7':
      return <TopTabsLayout {...props} sidebar="always" look="dark" logo="duo-colored" />;
  }
}
