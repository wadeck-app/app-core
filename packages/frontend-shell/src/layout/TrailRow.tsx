import React from 'react';
import { HeaderActionsSlot, useHeaderActionsFilled } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from './Breadcrumb.js';
import type { Crumb } from './navHelpers.js';

// The row of the sticky block that names the page: an optional leading control (the button of the collapsible menu), the trail, and what
// the page put in its header slot (a HeaderActions, or a PageHeader with placement "trail").
// While the slot has content, the header "merges" with the trail: it follows it closely, takes the width left, and its title stands for
// the last crumb (dropped). The trail keeps its own width (a flex-1 trail was squeezed to nothing by a wide header and its crumbs, wrapping,
// were drawn under the header): the header is the one that gives way. Decided by the user among five layouts (A/B "Header row").
export function TrailRow({ crumbs, leading }: { crumbs: Crumb[]; leading?: React.ReactNode }): React.ReactElement {
  const filled = useHeaderActionsFilled();
  return (
    <div className="flex items-center gap-1 px-4 pt-3">
      {leading}
      <Breadcrumb crumbs={crumbs} className={filled ? 'shrink-0' : 'min-w-0 flex-1'} hideCurrent={filled} chevronAfter={filled} />
      <HeaderActionsSlot className={filled ? 'ml-1 min-w-0 flex-1' : 'ml-auto shrink-0'} />
    </div>
  );
}
