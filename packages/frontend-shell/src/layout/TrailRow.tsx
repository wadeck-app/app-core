import React, { useEffect, useRef, useState } from 'react';
import { HeaderActionsSlot } from '@wadeck-app/dsl-ui';
import { Breadcrumb } from './Breadcrumb.js';
import type { Crumb } from './navHelpers.js';
import { useTrailVariant, type TrailVariant } from './trailRowVariants.js';

// Whether something is in the slot: the pages put their header there through a portal, the shell cannot know otherwise. Watches the
// children of the wrapper (a `contents` box: no box of its own, the slot stays a child of the row).
function useFilled(): { ref: React.RefObject<HTMLDivElement | null>; filled: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const wrapper = ref.current;
    if (wrapper === null) {
      return undefined;
    }
    const update = (): void => setFilled((wrapper.firstElementChild?.childElementCount ?? 0) > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return { ref, filled };
}

// The classes of the three parts of the row for a variant, once the slot has content. `trail` is the breadcrumb, `slot` the header.
// @formatter:off
const FILLED: Record<TrailVariant, { row: string; trail: string; slot: string; divider: boolean; hideCurrent: boolean; chevron?: boolean }> = {
  'right':       { row: '',          trail: 'min-w-0 flex-1',  slot: 'ml-auto shrink-0',                   divider: false, hideCurrent: false },
  'right-title': { row: '',          trail: 'min-w-0 flex-1',  slot: 'ml-auto min-w-0 shrink',             divider: false, hideCurrent: true  },
  'gap':         { row: '',          trail: 'shrink-0',        slot: 'ml-6 min-w-0 flex-1',                divider: true,  hideCurrent: true  },
  'merged':      { row: '',          trail: 'shrink-0',        slot: 'ml-1 min-w-0 flex-1',                divider: false, hideCurrent: true, chevron: true },
  'wrap':        { row: 'flex-wrap', trail: 'min-w-0 flex-1',  slot: 'ml-auto max-w-full',                 divider: false, hideCurrent: true  },
};
// @formatter:on

const EMPTY: (typeof FILLED)[TrailVariant] = { row: '', trail: 'min-w-0 flex-1', slot: 'ml-auto shrink-0', divider: false, hideCurrent: false };

// The row of the sticky block that names the page: an optional leading control (the button of the collapsible menu), the trail, and what
// the page put in its header slot.
export function TrailRow({ crumbs, leading }: { crumbs: Crumb[]; leading?: React.ReactNode }): React.ReactElement {
  const variant = useTrailVariant();
  const { ref, filled } = useFilled();
  const layout = filled ? FILLED[variant] : EMPTY;
  return (
    <div className={`flex items-center gap-1 px-4 pt-3 ${layout.row}`}>
      {leading}
      <Breadcrumb crumbs={crumbs} className={layout.trail} hideCurrent={layout.hideCurrent} chevronAfter={layout.chevron === true} />
      {layout.divider ? <span data-trail-divider="" aria-hidden="true" className="ml-6 h-5 w-px shrink-0 bg-border" /> : null}
      <div ref={ref} className="contents">
        <HeaderActionsSlot className={layout.slot} />
      </div>
    </div>
  );
}
