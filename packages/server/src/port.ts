// Hardcoded default port, overridable via env for testing.
const DEFAULT_PORT = 4850;

export function resolvePort(): number {
  const envPort = process.env['APP_CORE_PORT'];
  if (!envPort) {
    return DEFAULT_PORT;
  }
  const parsed = Number(envPort);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid APP_CORE_PORT: "${envPort}" -- must be a positive integer`);
  }
  return parsed;
}
