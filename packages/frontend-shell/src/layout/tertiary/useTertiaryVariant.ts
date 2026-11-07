import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import type { SubBarStyle, TabsStyle } from './TertiaryStyles.js';

export type TertiaryVariant = 'none' | 'accordion' | 'tabs' | 'subbar';

export interface TertiaryChoice {
  placement: TertiaryVariant;
  tabs: TabsStyle;
  subbar: SubBarStyle;
}

// The rows of the A/B dock for the third level of navigation (primary = top bar, secondary = side menu): where it goes, and, once a
// family is chosen, a row for its look. The look rows are only in the dock while their family is the placement.
// What stays is what design-system documentation backs: tabs / horizontal navigation inside the page (Carbon: "use tabs within the
// page"; PatternFly: "secondary horizontal navigation"; Primer: tabs "directly above the content they affect"), and the accordion
// in the side menu (PatternFly: "3-level expandable navigation"; but Carbon and Fluent say their side menus do not go there).
// `replaced`: a sticky header (shell-header) lays out the third level itself, so these rows are left out of the dock.
export function useTertiaryVariant(replaced = false): TertiaryChoice {
  const placement = useAbTest<TertiaryVariant>({
    id: 'shell-tertiary',
    label: 'Third menu level',
    initial: 'none',
    options: {
      none: { label: 'None', hint: 'As the app is today: no third level. The reference.' },
      accordion: { label: 'Accordion', hint: 'The entries open under the current page in the side menu. Contested: Carbon and Fluent keep their side menus at two levels. No figures here (the menu entry has none yet).' },
      tabs: { label: 'Tabs', hint: 'Tabs at the top of the page, above what they switch. Its look: row "Tabs look".' },
      subbar: { label: 'Sub-bar', hint: 'A thin bar under the top bar, sticky, as a horizontal secondary navigation. Its look: row "Sub-bar look".' },
    },
  });
  const tabs = useAbTest<TabsStyle>({
    id: 'shell-tertiary-tabs',
    label: 'Tabs look',
    initial: 'line',
    options: {
      line: { label: 'Line', hint: 'Underlined tabs under the trail. Figures are shown next to the labels.' },
      band: { label: 'Band', hint: 'The trail and the tabs in one tinted band, so the page starts lower and less cluttered.' },
      sticky: { label: 'Sticky', hint: 'The tabs stay stuck under the top bar while the page scrolls.' },
    },
  });
  const subbar = useAbTest<SubBarStyle>({
    id: 'shell-tertiary-subbar',
    label: 'Sub-bar look',
    initial: 'chips',
    options: {
      chips: { label: 'Chips', hint: 'Outlined chips after the page name.' },
      merged: { label: 'Merged', hint: 'One bar instead of two: the trail on the left, the chips on the right.' },
      segmented: { label: 'Segmented', hint: 'The page name on the left, one segmented control on the right.' },
      tabs: { label: 'Tabs', hint: 'Underlined tabs running the height of the bar, on the right.' },
    },
  });
  useRegisterAbTests(replaced ? [] : [placement, ...(placement.value === 'tabs' ? [tabs] : []), ...(placement.value === 'subbar' ? [subbar] : [])]);
  return { placement: placement.value, tabs: tabs.value, subbar: subbar.value };
}
