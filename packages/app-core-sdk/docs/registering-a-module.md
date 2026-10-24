# Registering a module from a daemon

`@wadeck-app/app-core-sdk/register` is the node-only subpath a daemon (Queue, Orchestrator, Flow...) uses to tell
app-core where its module lives, and to remove it. The main entry of the SDK stays free of node imports.

```ts
import { registerModule, unregisterModule, describeRegistration } from '@wadeck-app/app-core-sdk/register';
```

## API

| Function | What it does |
|---|---|
| `registerModule({ id, manifestPath, env?, timeoutMs?, probeTimeoutMs? })` | `POST /api/modules/register` (also reloads a known module). Resolves to a `RegistrationOutcome`. |
| `unregisterModule({ id, env?, timeoutMs?, probeTimeoutMs? })` | `POST /api/modules/unregister`. Resolves to an `UnregistrationOutcome`. |
| `describeRegistration(outcome, id)` | One log line for either outcome type. |
| `describeRegistrationFailure(err)` | One log line for an error thrown by the two calls above. |
| `resolveAppCorePort(env?)` | The port the two calls would use. |

`id` is the module id: the prefix of its components (`<id>:Name`) and routes. It must start with a letter or
digit and contain only letters, digits, `_` and `-`. `manifestPath` is resolved against the caller's working
directory and sent as an absolute path. `env` defaults to `process.env`. `timeoutMs` (wait for the registration's answer) defaults to 3000; `probeTimeoutMs` (the check described under
`unconfirmed`) defaults to 1000.

## Outcomes

| `status` | Meaning |
|---|---|
| `registered` (`port`, `note?`) | app-core took the module. `note` is set when its answer was missed but `GET /api/modules` then showed the manifest's version. |
| `unconfirmed` (`port`, `failure`, `timeoutMs?`, `detail?`, `loadedVersion?`, `expectedVersion?`) | app-core is reachable but did not answer in time (`failure: 'timeout'`) or the connection broke (`'reset'`). It may have applied the registration: nothing is written; check `GET /api/modules` or register again. |
| `refused` (`port`, `httpStatus`, `reason`, `code?`, `retained?`) | app-core is running and said no; `reason` is its own `error` text. `retained: true` means the previous version of the module keeps running. `code: 'shared-version-mismatch'` (HTTP 422): the module's components were built for other versions of the shared packages (`dslLib.shared`) than app-core's shell provides; registering the same files again changes nothing, rebuild the module or update the shell. |
| `deferred` (`file`) | Nothing listens on the port (connection refused / unknown host); the pickup file it reads at its next start was written. |
| `skipped` (`reason`) | app-core is not installed here; nothing was written. |
| `unregistered` (`port`, `note?`) | app-core removed the module, its routes and its registry file. `note` is set when its answer was missed but it was then seen no longer serving the module. |
| `unconfirmed` (`action: 'unregister'`, `port`, `failure`, `timeoutMs?`, `detail?`, `loadedVersion?`) | app-core is reachable, gave no answer and still serves the module (`loadedVersion`). Nothing was cleared; check `GET /api/modules` or unregister again. |
| `not-registered` (`port`, `reason`) | app-core is running and did not know that id (HTTP 404). |
| `cleared` (`file`) | app-core is not running; the pending pickup file for that id was removed. |

## Rules

- **Port:** `APP_CORE_PORT`, else the `port` in `<config dir>/server.port.json` (the port app-core really
  bound), else `4850`. A malformed `APP_CORE_PORT` throws; it never falls back to another source.
- **Config dir:** `APP_CORE_CONFIG_DIR`, else `~/.config/app-core`.
- **Slow is not down.** app-core answers a registration only after the module's load (teardown, migrate, setup)
  finished, and its routes are live before that. After a timeout or a broken connection, `registerModule` asks
  `GET /api/modules` (`probeTimeoutMs`): the manifest's version is served -> `registered` with a `note`; otherwise
  `unconfirmed`. `GET /api/modules` does not list a module while it reloads, so a slow load stays `unconfirmed`.
  Only a refused connection or unknown host means app-core is down: `deferred` or `skipped`.
  `unregisterModule` does the same: after a missing answer, a module no longer served -> `unregistered` with a `note`; still served -> `unconfirmed` (the pending pickup file is left alone); only an unreachable app-core gives `cleared` or `skipped`.
- **App-core down is not an error.** The functions reject only for what the caller must fix: an
  invalid id, a malformed `APP_CORE_PORT`, or a manifest that does not exist.
- **Files:** `<config dir>/modules/<id>.json` is written only when app-core is down AND the config dir already
  exists. A machine that never installed app-core gets no app-core folder.

## Example

```ts
import { registerModule, describeRegistration, describeRegistrationFailure } from '@wadeck-app/app-core-sdk/register';

export async function registerWithAppCore(manifestPath: string, log: (line: string) => void): Promise<void> {
  try {
    log(describeRegistration(await registerModule({ id: 'queue', manifestPath }), 'queue'));
  } catch (err) {
    log(describeRegistrationFailure(err)); // the daemon keeps running
  }
}
```

## Before updating a module

`app-core-cli check` and `package` ask the app-core running on this machine (`GET /build-info.json`) which versions of react, react-dom, react-router-dom, dsl-ui and dsl-renderer its shell provides, and print a `warning:` for each `dslLib.shared` range of the module that the shell does not satisfy. The exit code does not change: the module may be meant for another machine. A `refused` outcome with `code: 'shared-version-mismatch'` is the same problem found at registration. An updater should treat any `refused` as a failed update (the old version still runs) and report `describeRegistration(outcome, id)`, not swallow it.
