import { useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

// A/B test "Header row": how the sticky row of the trail lays out what a page puts in its header slot (`HeaderActions` / `PageHeader` with
// placement "trail"), so a dense page can gain the line its own header used to take. It acts only while the slot has content: a page
// that puts nothing there is drawn as before, whatever the choice.
export const TRAIL_VARIANTS = ['right', 'right-title', 'gap', 'merged', 'wrap'] as const;
export type TrailVariant = (typeof TRAIL_VARIANTS)[number];

// @formatter:off
const OPTIONS: Record<TrailVariant, { label: string; hint: string }> = {
  'right':       { label: 'Right, crumb kept',   hint: 'The header sits at the right end of the row. The trail keeps its last crumb (the page name), as before.' },
  'right-title': { label: 'Right, title only',   hint: 'The header sits at the right end of the row. The last crumb is dropped: the header already shows the page title.' },
  'gap':         { label: 'After a gap',         hint: 'The header follows the trail after a gap and a thin divider, and takes all the width left (the search grows). The last crumb is dropped.' },
  'merged':      { label: 'Merged with trail',   hint: 'The header follows the trail closely, no divider: the title reads as the last crumb. It takes all the width left. The last crumb is dropped.' },
  'wrap':        { label: 'Wraps when tight',    hint: 'Like "Right, title only", but when the header does not fit next to the trail it goes under it instead of squeezing. The last crumb is dropped.' },
};
// @formatter:on

// The choice (stored in this browser as `ab.header-row`, forced by `?ab.header-row=<variant>`) and its row in the A/B dock.
export function useTrailVariant(): TrailVariant {
  const test = useAbTest<TrailVariant>({ id: 'header-row', label: 'Header row', initial: 'right', options: OPTIONS });
  useRegisterAbTests([test]);
  return test.value;
}
