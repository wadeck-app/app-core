// Hardcoded default port, overridable via env for testing.
export const DEFAULT_PORT = 4850;

// The port named by APP_CORE_PORT, undefined when the variable is unset or empty. A value that is
// not a port number throws: it was set on purpose, and quietly using another port is how a test run
// ends up talking to the user's real app-core.
export function parsePortEnv(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const envPort = env['APP_CORE_PORT'];
  if (envPort === undefined || envPort === '') {
    return undefined;
  }
  const parsed = Number(envPort);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid APP_CORE_PORT: "${envPort}" -- must be an integer between 1 and 65535`);
  }
  return parsed;
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePortEnv(env) ?? DEFAULT_PORT;
}
