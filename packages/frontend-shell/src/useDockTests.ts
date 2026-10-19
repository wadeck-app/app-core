import { useEffect, useRef } from 'react';
import { useAbExperiments, type AbExperimentsContextValue } from '@wadeck-app/dsl-ui';

type DockTests = Parameters<AbExperimentsContextValue['store']['set']>[1][];

// Shows the shell's own A/B tests (made with useAbTest) in the one dock of the app-wide <AbExperiments> host, next to the
// ones that module views declare, instead of a second dock stacked on top of it. Returns whether a host took them; when it
// did not (no host mounted, or A/B tests disabled), the caller renders its own <AbDock>.
export function useDockTests(tests: DockTests): boolean {
  const host = useAbExperiments();
  const owner = useRef(Symbol('shell-ab-tests')).current;
  const active = host !== null && host.enabled;
  // The tests are new objects on every render; what changes the dock is the id, the options and the chosen value.
  const signature = JSON.stringify(tests.map((t) => [t.id, t.value, t.options]));
  const latest = useRef(tests);
  latest.current = tests;

  useEffect(() => {
    if (host === null || !host.enabled) {
      return undefined;
    }
    const ids = latest.current.map((t) => t.id);
    for (const test of latest.current) {
      host.store.set(owner, test, JSON.stringify([test.id, test.value, test.options]));
    }
    return () => ids.forEach((id) => host.store.remove(owner, id));
    // The host and the owner are stable; the tests are re-registered when their signature changes.
  }, [active, host, owner, signature]);

  return active;
}
