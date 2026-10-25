import { useEffect, useState } from 'react';
import { getErrorMessage } from './errors.js';

export interface ShellSettings {
  // `app-core-cli serve --ab-tests`: the A/B test dock is shown although this is a production build.
  abTests: boolean;
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
  return { abTests: body.abTests };
}

// Read once per page load: the settings are the flags the server was started with. Off until they are known; a failure is
// said in the console (the A/B dock then stays at its default: development builds only) instead of being swallowed.
export function useShellSettings(): ShellSettings {
  const [settings, setSettings] = useState<ShellSettings>({ abTests: false });

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
