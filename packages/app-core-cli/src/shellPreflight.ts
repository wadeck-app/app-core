import * as fs from 'node:fs';
import * as path from 'node:path';
import semver from 'semver';
import { resolveAppCorePort } from '@wadeck-app/app-core-sdk/register';
import { sharedVersionsFromBuildInfo } from '@wadeck-app/app-core-server/dslLib';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

const DEFAULT_TIMEOUT_MS = 1000;

// What `check` and `package` say about a running app-core: does the shell it serves provide the versions of the shared
// packages (`dslLib.shared`) this module's components were built for? app-core refuses the module at registration when it
// does not (HTTP 422), so whoever builds or updates the module should hear it now, not from a failed update later.
// Not a failure of `check`: the module may be meant for another machine. An app-core that is not running says nothing.
export async function shellWarnings(shared: Record<string, string>, env: NodeJS.ProcessEnv = process.env, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
  if (Object.keys(shared).length === 0) {
    return [];
  }
  const port = resolveAppCorePort(env);
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/build-info.json`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // Nothing answers on that port: no app-core to compare with, which is not worth a warning.
    return [];
  }
  const where = `app-core on port ${port}`;
  if (!response.ok) {
    return [`${where} serves no build-info.json (HTTP ${response.status}), so the dslLib.shared ranges of this module cannot be compared with its shell. Run "npm run build:full" there.`];
  }
  let info: { builtAt?: unknown; commit?: unknown };
  try {
    info = (await response.json()) as typeof info;
  } catch (err) {
    return [`${where} serves a build-info.json that is not JSON (${getErrorMessage(err)}): the dslLib.shared ranges of this module cannot be compared with its shell.`];
  }
  const provided = sharedVersionsFromBuildInfo(info);
  const built = typeof info.builtAt === 'string' ? `built ${info.builtAt}` : 'build time unknown';
  const commit = typeof info.commit === 'string' ? `, commit ${info.commit}` : '';
  const warnings: string[] = [];
  for (const [pkg, range] of Object.entries(shared)) {
    const version = provided[pkg];
    if (version !== undefined && semver.validRange(range) !== null && !semver.satisfies(version, range, { includePrerelease: true })) {
      warnings.push(
        `${where} serves a shell with ${pkg} ${version} (build-info.json ${built}${commit}), but dslLib.shared asks "${range}": app-core will refuse this module (HTTP 422) and keep the previous version. ` +
          `Rebuild the components against ${version}, or update that app-core's shell ("npm run build:full", then restart it; a build-info.json older than the installed packages means the shell was not rebuilt).`,
      );
    }
  }
  return warnings;
}

// The same for a module folder: reads the dslLib.shared ranges of its source manifest. A manifest that cannot be read is
// `check`'s business, not a warning here.
export async function shellWarningsForModule(moduleDir: string, env: NodeJS.ProcessEnv = process.env, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
  let shared: Record<string, string> | undefined;
  try {
    shared = (JSON.parse(fs.readFileSync(path.join(moduleDir, 'manifest.json'), 'utf8')) as { dslLib?: { shared?: Record<string, string> } }).dslLib?.shared;
  } catch {
    return [];
  }
  return shared === undefined ? [] : shellWarnings(shared, env, timeoutMs);
}
