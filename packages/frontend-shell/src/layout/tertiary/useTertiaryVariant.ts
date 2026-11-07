import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import type { ColumnStyle, SubBarStyle, TabsStyle } from './TertiaryStyles.js';

export type TertiaryVariant = 'none' | 'accordion' | 'tabs' | 'pills' | 'column' | 'rail' | 'flyout' | 'crumb' | 'subbar';

export interface TertiaryChoice {
  placement: TertiaryVariant;
  tabs: TabsStyle;
  subbar: SubBarStyle;
  column: ColumnStyle;
}

// The rows of the A/B dock for the third level of navigation (primary = top bar, secondary = side menu): where it goes, and, once a
// family is chosen, a row for its look. The look rows are only in the dock while their family is the placement.
// `replaced`: a sticky header (shell-header) lays out the third level itself, so these rows are left out of the dock.
export function useTertiaryVariant(replaced = false): TertiaryChoice {
  const placement = useAbTest<TertiaryVariant>({
    id: 'shell-tertiary',
    label: 'Third menu level',
    initial: 'none',
    options: {
      none: { label: 'None', hint: 'As the app is today: no third level. The reference.' },
      accordion: { label: 'Accordion', hint: 'Linear, Notion: the entries open under the current page in the side menu.' },
      tabs: { label: 'Tabs', hint: 'GitHub, Stripe: tabs at the top of the page. Its look: row "Tabs look".' },
      pills: { label: 'Pills', hint: 'Vercel, Linear views: a segmented control at the top of the page.' },
      column: { label: 'Column', hint: 'Slack, Jira: a third narrow column between the side menu and the page. Its look: row "Column look".' },
      rail: { label: 'Rail', hint: 'Stripe docs, Notion: a sticky list on the right of the page, with the current entry marked.' },
      flyout: { label: 'Flyout', hint: 'macOS, Figma: a card that opens next to the current page of the side menu.' },
      crumb: { label: 'Breadcrumb', hint: 'GitHub, Vercel: the last crumb is a dropdown that switches entry.' },
      subbar: { label: 'Sub-bar', hint: 'Shopify, Google Cloud: a thin bar under the top bar, sticky. Its look: row "Sub-bar look".' },
    },
  });
  const tabs = useAbTest<TabsStyle>({
    id: 'shell-tertiary-tabs',
    label: 'Tabs look',
    initial: 'line',
    options: {
      line: { label: 'Line', hint: 'Underlined tabs under the trail. The first version.' },
      count: { label: 'Counts', hint: 'Jira, Zendesk: a figure next to the label (sample numbers).' },
      band: { label: 'Band', hint: 'The trail and the tabs in one tinted band, so the page starts lower and less cluttered.' },
      sticky: { label: 'Sticky', hint: 'GitHub: the tabs stay stuck under the top bar while the page scrolls.' },
    },
  });
  const subbar = useAbTest<SubBarStyle>({
    id: 'shell-tertiary-subbar',
    label: 'Sub-bar look',
    initial: 'chips',
    options: {
      chips: { label: 'Chips', hint: 'Outlined chips after the page name. The first version.' },
      merged: { label: 'Merged', hint: 'One bar instead of two: the trail on the left, the chips on the right.' },
      segmented: { label: 'Segmented', hint: 'Notion: the page name on the left, one segmented control on the right.' },
      tabs: { label: 'Tabs', hint: 'Vercel project nav: underlined tabs running the height of the bar, on the right.' },
    },
  });
  const column = useAbTest<ColumnStyle>({
    id: 'shell-tertiary-column',
    label: 'Column look',
    initial: 'plain',
    options: {
      plain: { label: 'Plain', hint: 'A full-height list with a rule on its right. The first version.' },
      collapsible: { label: 'Collapsible', hint: 'Slack, Linear: a button folds it to a strip of initials; kept in this browser.' },
      card: { label: 'Card', hint: 'Notion settings: a floating card instead of a full-height rule.' },
      headed: { label: 'Headed', hint: 'Stripe, Intercom: a heading and a second line under each entry (sample texts).' },
    },
  });
  useRegisterAbTests(replaced ? [] : [placement, ...(placement.value === 'tabs' ? [tabs] : []), ...(placement.value === 'subbar' ? [subbar] : []), ...(placement.value === 'column' ? [column] : [])]);
  return { placement: placement.value, tabs: tabs.value, subbar: subbar.value, column: column.value };
}
