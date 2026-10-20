import { useAbExperiments, useRegisterAbTests } from '@wadeck-app/dsl-ui';

type DockTests = Parameters<typeof useRegisterAbTests>[0];

// Shows the shell's own A/B tests (made with useAbTest) in the one dock of the app-wide <AbExperiments> host, next to the
// ones that module views declare, instead of a second dock stacked on top of it. Returns whether a host took them; when it
// did not (no host mounted, or A/B tests disabled), the caller renders its own <AbDock>.
export function useDockTests(tests: DockTests): boolean {
  const host = useAbExperiments();
  useRegisterAbTests(tests);
  return host !== null && host.enabled;
}
