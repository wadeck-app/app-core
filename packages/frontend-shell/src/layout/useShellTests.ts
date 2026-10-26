import { useAbTest } from '@wadeck-app/dsl-ui';
import { useDockTests } from '../useDockTests.js';

// The shell's own A/B tests (dock: development, or `serve --ab-tests`). Outside the dock each one is its `initial` value.
// The top bar is drawn by dsl-ui's AppShell; this test picks how it behaves once the page is scrolled.
export function useShellTests(): { barOnScroll: 'steady' | 'shrink' | 'hide' | 'icons' } {
  // @formatter:off
  const bar = useAbTest({
    id: 'shell-bar',
    label: 'Top bar on scroll',
    initial: 'steady',
    options: {
      steady: { label: 'Steady',   hint: 'The bar keeps its full height while the page scrolls.' },
      shrink: { label: 'Shrink',   hint: 'About half the height once scrolled, smaller text; full again at the top or on hover.' },
      hide:   { label: 'Hide',     hint: 'Slides away when scrolling down, back as soon as you scroll up a little.' },
      icons:  { label: 'Icons',    hint: 'A thin strip of module icons once scrolled; the name is the tooltip.' },
    },
  });
  // @formatter:on
  useDockTests([bar]);
  return { barOnScroll: bar.value };
}
