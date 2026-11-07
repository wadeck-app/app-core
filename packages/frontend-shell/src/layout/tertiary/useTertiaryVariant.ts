import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

export type TertiaryVariant = 'none' | 'accordion' | 'tabs' | 'pills' | 'column' | 'rail' | 'flyout' | 'crumb' | 'subbar';

// One row of the A/B dock: where the third level of navigation (primary = top bar, secondary = side menu) is placed.
export function useTertiaryVariant(): TertiaryVariant {
  const test = useAbTest<TertiaryVariant>({
    id: 'shell-tertiary',
    label: 'Third menu level',
    initial: 'none',
    options: {
      none: { label: 'None', hint: 'As the app is today: no third level. The reference.' },
      accordion: { label: 'Accordion', hint: 'Linear, Notion: the entries open under the current page in the side menu.' },
      tabs: { label: 'Tabs', hint: 'GitHub, Stripe: underlined tabs at the top of the page.' },
      pills: { label: 'Pills', hint: 'Vercel, Linear views: a segmented control at the top of the page.' },
      column: { label: 'Column', hint: 'Slack, Jira: a third narrow column between the side menu and the page.' },
      rail: { label: 'Rail', hint: 'Stripe docs, Notion: a sticky list on the right of the page, with the current entry marked.' },
      flyout: { label: 'Flyout', hint: 'macOS, Figma: a card next to the current page of the side menu.' },
      crumb: { label: 'Breadcrumb', hint: 'GitHub, Vercel: the last crumb is a dropdown that switches entry.' },
      subbar: { label: 'Sub-bar', hint: 'Shopify, Google Cloud: a thin bar under the top bar, sticky, with the entries as chips.' },
    },
  });
  useRegisterAbTests([test]);
  return test.value;
}
