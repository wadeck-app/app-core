import { MENU_VARIANT_AB_OPTIONS, useAbTest, type ShellMenuVariant } from '@wadeck-app/dsl-ui';
import { useDockTests } from '../useDockTests.js';

// The shell's own A/B tests (dock: development, or `serve --ab-tests`). Outside the dock each one is its `initial` value.
// The top bar and the side menu are drawn by dsl-ui's AppShell; these tests pick how.
export function useShellTests(): { barOnScroll: 'steady' | 'shrink' | 'hide' | 'icons'; menuVariant: ShellMenuVariant } {
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
  const menu = useAbTest({
    id: 'shell-menu',
    label: 'Side menu',
    initial: 'classic',
    // Label and tooltip of each variant come with dsl-ui, next to the values AppShell accepts.
    options: MENU_VARIANT_AB_OPTIONS,
  });
  // @formatter:on
  useDockTests([bar, menu]);
  return { barOnScroll: bar.value, menuVariant: menu.value };
}
