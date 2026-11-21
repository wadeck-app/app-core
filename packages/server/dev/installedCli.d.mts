export function installedCliEnv(options: { globalNodeModules: string | undefined; isReadable: (file: string) => boolean }): { env: Record<string, string>; message: string };
