# Registering a module from a daemon

`@wadeck-app/app-core-sdk/register` is the node-only subpath a daemon (Queue, Orchestrator, Flow...) uses to tell
app-core where its module lives, and to remove it. The main entry of the SDK stays free of node imports.

```ts
import { registerModule, unregisterModule, describeRegistration } from '@wadeck-app/app-core-sdk/register';
```

## API

| Function | What it does |
|---|---|
| `registerModule({ id, manifestPath, env?, timeoutMs? })` | `POST /api/modules/register` (also reloads a known module). Resolves to a `RegistrationOutcome`. |
| `unregisterModule({ id, env?, timeoutMs? })` | `POST /api/modules/unregister`. Resolves to an `UnregistrationOutcome`. |
| `describeRegistration(outcome, id)` | One log line for either outcome type. |
| `describeRegistrationFailure(err)` | One log line for an error thrown by the two calls above. |
| `resolveAppCorePort(env?)` | The port the two calls would use. |

`id` is the module id: the prefix of its components (`<id>:Name`) and routes. It must start with a letter or
digit and contain only letters, digits, `_` and `-`. `manifestPath` is resolved against the caller's working
directory and sent as an absolute path. `env` defaults to `process.env`. `timeoutMs` defaults to 3000.

## Outcomes

| `status` | Meaning |
|---|---|
| `registered` (`port`) | app-core took the module. |
| `refused` (`port`, `httpStatus`, `reason`) | app-core is running and said no; `reason` is its own `error` text. |
| `deferred` (`file`) | app-core is not running; the pickup file it reads at its next start was written. |
| `skipped` (`reason`) | app-core is not installed here; nothing was written. |
| `unregistered` (`port`) | app-core removed the module, its routes and its registry file. |
| `not-registered` (`port`, `reason`) | app-core is running and did not know that id (HTTP 404). |
| `cleared` (`file`) | app-core is not running; the pending pickup file for that id was removed. |

## Rules

- **Port:** `APP_CORE_PORT`, else the `port` in `<config dir>/server.port.json` (the port app-core really
  bound), else `4850`. A malformed `APP_CORE_PORT` throws; it never falls back to another source.
- **Config dir:** `APP_CORE_CONFIG_DIR`, else `~/.config/app-core`.
- **App-core down is not an error.** A connection failure, or an app-core that accepts and never answers within
  `timeoutMs`, resolves to `deferred` or `skipped`. The functions reject only for what the caller must fix: an
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
