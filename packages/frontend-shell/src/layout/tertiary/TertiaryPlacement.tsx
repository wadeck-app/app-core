import React from 'react';
import { BreadcrumbTrail, type BreadcrumbVariant } from '../breadcrumb/BreadcrumbTrail.js';
import type { Crumb } from '../navHelpers.js';
import type { TertiaryNav } from './tertiaryModel.js';
import { StickyHeader, type HeaderVariant } from './StickyHeader.js';
import { StyledSubBar, StyledTabs } from './TertiaryStyles.js';
import type { TertiaryChoice } from './useTertiaryVariant.js';

// Puts the trail and the third level where the A/B tests say. `children` is the page. The accordion (in the side menu) is built in
// AppLayout and leaves everything here as it is. Placements that carry the trail themselves (tabs `band`, sub-bar `merged`) ignore
// the breadcrumb variant: that is what they are about.
export function TertiaryPlacement({
  choice,
  breadcrumb,
  header,
  nav,
  title,
  moduleId,
  crumbs,
  children,
}: {
  choice: TertiaryChoice;
  breadcrumb: BreadcrumbVariant;
  header: HeaderVariant;
  nav: TertiaryNav;
  title: string;
  moduleId: string | undefined;
  crumbs: Crumb[];
  children: React.ReactNode;
}): React.ReactElement {
  const label = `${title} sections`;
  // A sticky header lays out the trail and the third level together, whatever the other two tests say.
  if (header !== 'off') {
    return (
      <StickyHeader variant={header} nav={nav} title={title} moduleId={moduleId} crumbs={crumbs}>
        {children}
      </StickyHeader>
    );
  }
  const trail = <BreadcrumbTrail variant={breadcrumb} crumbs={crumbs} moduleId={moduleId} />;
  // The trail of a bar of its own: the classic look, without its padding.
  const compactTrail = <BreadcrumbTrail variant="classic" crumbs={crumbs} />;

  // A sticky trail and a sticky bar would both stick at the top and the second would hide the first: they stick together, in one block.
  const bothSticky = breadcrumb === 'sticky' && ((choice.placement === 'tabs' && choice.tabs === 'sticky') || (choice.placement === 'subbar' && choice.subbar !== 'merged'));
  if (bothSticky) {
    return (
      <>
        <div className="sticky top-shell-bar z-10 border-b border-border bg-bg">
          {choice.placement === 'tabs' ? (
            <>
              <BreadcrumbTrail variant="classic" crumbs={crumbs} moduleId={moduleId} />
              <StyledTabs nav={nav} label={label} style="line" />
            </>
          ) : (
            <>
              <StyledSubBar nav={nav} label={label} style={choice.subbar} lead={title} />
              <BreadcrumbTrail variant="classic" crumbs={crumbs} moduleId={moduleId} />
            </>
          )}
        </div>
        {children}
      </>
    );
  }

  switch (choice.placement) {
    case 'tabs':
      if (choice.tabs === 'band') {
        return (
          <>
            <StyledTabs nav={nav} label={label} style="band" lead={compactTrail} />
            {children}
          </>
        );
      }
      return (
        <>
          {trail}
          <StyledTabs nav={nav} label={label} style={choice.tabs} />
          {children}
        </>
      );
    case 'subbar':
      if (choice.subbar === 'merged') {
        return (
          <>
            <StyledSubBar nav={nav} label={label} style="merged" lead={compactTrail} />
            {children}
          </>
        );
      }
      return (
        <>
          <StyledSubBar nav={nav} label={label} style={choice.subbar} lead={title} />
          {trail}
          {children}
        </>
      );
    default:
      return (
        <>
          {trail}
          {children}
        </>
      );
  }
}
