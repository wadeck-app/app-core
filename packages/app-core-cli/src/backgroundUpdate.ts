// Whether this invocation schedules the background update check.
//
// Not for `self-check` (it would recurse into the package just installed, mid-verification), not with `--no-update` /
// APP_CORE_CLI_NO_UPDATE=1 (an application that must stay on the version it was built with), and not for `update`: the update the user
// asked for runs the same updater under the same lock, and a background check started by that very command takes the lock first, so the
// explicit one answered "updater already running, skipping" and nothing was installed (it needed several tries).
export function wantsBackgroundUpdate(command: string | undefined, args: readonly string[], env: NodeJS.ProcessEnv): boolean {
  if (command === 'self-check' || command === 'update') {
    return false;
  }
  return !args.includes('--no-update') && env['APP_CORE_CLI_NO_UPDATE'] !== '1';
}
