export interface RegistryEntryLike {
  id?: string;
  source?: { type?: string; path?: string };
}
export function serverWatchExcludes(options: { globalNodeModules?: string | undefined; registryEntries: readonly RegistryEntryLike[] }): string[];
