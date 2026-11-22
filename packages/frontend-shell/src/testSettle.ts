import { act } from '@testing-library/react';

// For an assertion that something did NOT happen ("the popover stays open", "no alert"): a positive condition cannot be waited for, so
// the test lets everything already scheduled run first. Two turns of the macrotask queue, inside act: the timers a library queued before
// (Radix returns the focus in a setTimeout(0)) run before ours, in order, whatever the speed of the machine. No guessed duration.
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}
