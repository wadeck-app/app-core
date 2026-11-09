import { useEffect, useState } from 'react';
import { getErrorMessage } from './errors.js';

export interface ShellSettings {
  // `app-core-cli serve --ab-tests`: the A/B test dock is shown although this is a production build.
  abTests: boolean;
  // `app-core-cli serve --module`: the application is this one module, no dashboard.
  standalone: { moduleId: string } | null;
}

async function fetchShellSettings(): Promise<ShellSettings> {
  const res = await fetch('/api/shell-settings');
  if (!res.ok) {
    throw new Error(`GET /api/shell-settings answered ${res.status}`);
  }
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('abTests' in body) || typeof body.abTests !== 'boolean') {
    throw new Error('/api/shell-settings has no boolean "abTests"; the server is older than this frontend');
  }
  // Absent on a server that was not started standalone (and on an older one).
  if (!('standalone' in body) || body.standalone === undefined || body.standalone === null) {
    return { abTests: body.abTests, standalone: null };
  }
  const { standalone } = body;
  if (typeof standalone !== 'object' || !('moduleId' in standalone) || typeof standalone.moduleId !== 'string' || standalone.moduleId === '') {
    throw new Error('/api/shell-settings "standalone" has no "moduleId": the server and this frontend do not match');
  }
  return { abTests: body.abTests, standalone: { moduleId: standalone.moduleId } };
}

// Read once per page load: the settings are the flags the server was started with. Off until they are known; a failure is
// said in the console (the A/B dock then stays at its default: development builds only) instead of being swallowed.
export function useShellSettings(): ShellSettings {
  const [settings, setSettings] = useState<ShellSettings>({ abTests: false, standalone: null });

  useEffect(() => {
    let cancelled = false;
    fetchShellSettings().then(
      (loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      },
      (err: unknown) => {
        console.warn(`[shell] cannot read the server settings, A/B tests keep their default (development only): ${getErrorMessage(err)}`);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
