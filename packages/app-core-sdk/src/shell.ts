// For the components of a page (the dsl-lib of a module, running in the shell's page): reach what only the shell holds, the PIN-aware
// fetcher and the PIN dialog, so that a component can call a route the module declared `effect: 'sensitive'`. Browser code, no React.
//
//   const answer = await appFetcher('POST /api/modules/chat/sessions/1/send', undefined, { text });
//
// This code is bundled INTO the module; it talks to the shell through a key of globalThis, which the shell sets at startup.

// The key of globalThis where the shell puts `{ elevate, fetcher }`. The shell keeps the same literal (a test keeps them equal).
export const APP_CORE_SHELL_GLOBAL = '__APP_CORE_SHELL__';

// The shape of dsl-renderer's Fetcher: `url` is "METHOD /path" (a bare path is a GET).
export type AppFetcher = (url: string, params?: Record<string, string>, body?: unknown, extraHeaders?: Record<string, string>) => Promise<unknown>;

interface ShellApi {
  elevate: () => Promise<void>;
  fetcher: AppFetcher;
}

function fromShell<K extends keyof ShellApi>(key: K, publicName: string): ShellApi[K] {
  const api: unknown = Reflect.get(globalThis, APP_CORE_SHELL_GLOBAL);
  const found = typeof api === 'object' && api !== null ? (api as Partial<ShellApi>)[key] : undefined;
  if (typeof found !== 'function') {
    throw new Error(`the app-core shell does not provide ${publicName}(): update app-core (app-core-cli update) or run this code inside the shell.`);
  }
  return found as ShellApi[K];
}

// Opens the PIN dialog if needed (the refresh cookie is tried first) and resolves when the shell holds an access token. Rejects with
// the shell's error ("Sensitive action cancelled: PIN not entered") when the PIN is not entered.
export async function elevate(): Promise<void> {
  return fromShell('elevate', 'elevate')();
}

// The fetcher the pages of the shell use: Bearer token, refresh, PIN dialog and one retry on a sensitive route.
export async function appFetcher(url: string, params?: Record<string, string>, body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
  return fromShell('fetcher', 'appFetcher')(url, params, body, extraHeaders);
}
