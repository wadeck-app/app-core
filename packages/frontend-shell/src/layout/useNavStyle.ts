import { useEffect } from 'react';
import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

export type NavStyle = 'current' | 'underline' | 'soft' | 'glow' | 'solid' | 'outline' | 'rail' | 'ink' | 'raised';

// What each theme of src/navStyles.css does to a CURRENT entry, the same at the top bar, the side menu and the tabs of the third level.
export const NAV_STYLES: Record<NavStyle, { label: string; hint: string }> = {
  current: { label: 'Today', hint: 'As it is: a glow on the top bar tab, a filled row in the side menu, a line under the third level. Three looks.' },
  underline: { label: 'Underline', hint: 'No fill: an accent bar on the inner edge (under the tab, left of the row) and accent text.' },
  soft: { label: 'Soft', hint: 'A soft accent fill, rounded, accent text. The top bar tabs become pills.' },
  glow: { label: 'Glow', hint: 'The glow of the top bar tabs everywhere: a fade from the bottom edge (from the left edge in the side menu), plus the bar.' },
  solid: { label: 'Solid', hint: 'A solid accent fill with white text, rounded: the strongest.' },
  outline: { label: 'Outline', hint: 'A thin accent ring and a faint fill, rounded.' },
  rail: { label: 'Rail', hint: 'Neutral text on a grey fill, with a thick accent bar: the accent only in the bar.' },
  ink: { label: 'Ink', hint: 'Only the text changes: accent color and bold. No fill, no bar.' },
  raised: { label: 'Raised', hint: 'The current entry is a small raised card with a hairline.' },
};

// One row of the A/B dock for the look of the whole navigation. It sets `data-nav-style` on the page; `current` sets nothing.
export function useNavStyle(): NavStyle {
  const test = useAbTest<NavStyle>({ id: 'shell-nav-style', label: 'Navigation look', initial: 'current', options: NAV_STYLES });
  useRegisterAbTests([test]);
  const value = test.value;
  useEffect(() => {
    const root = document.documentElement;
    if (value === 'current') {
      delete root.dataset['navStyle'];
    } else {
      root.dataset['navStyle'] = value;
    }
    return () => {
      delete root.dataset['navStyle'];
    };
  }, [value]);
  return value;
}
