import { authFilePath, isPinSet, MAX_PIN_LENGTH, MIN_PIN_LENGTH, pinProblem, setPin } from '@wadeck-app/app-core-server/auth/pin';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

export const PIN_USAGE = 'app-core-cli pin <set|status> [--config-dir <dir>]';

export interface PinDeps {
  configDir: string;
  // Whether stdin is a terminal: the PIN is typed there, never read from a pipe, a file or an argument.
  interactive: boolean;
  readHidden(question: string): Promise<string>;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}

// `app-core-cli pin set | status`. Returns the exit code. `set` replaces the PIN whether it was chosen here or in the dashboard,
// without asking the current one (it runs as the user, on the machine).
export async function runPin(args: string[], deps: PinDeps): Promise<number> {
  const [sub, ...rest] = args;
  const fail = (message: string): number => {
    deps.stderr.write(`app-core-cli pin: ${message}\n`);
    return 1;
  };
  if (sub !== 'set' && sub !== 'status') {
    return fail(sub === undefined ? `a subcommand is missing. Use "app-core-cli pin set" (choose or change the PIN) or "app-core-cli pin status".` : `unknown subcommand "${sub}". Use "app-core-cli pin set" or "app-core-cli pin status".`);
  }
  if (rest.length > 0) {
    return fail(`"pin ${sub}" takes no argument. The PIN is never given on the command line (it would stay in your shell history and in the process list): run "app-core-cli pin set" and type it when asked.`);
  }
  try {
    if (sub === 'status') {
      deps.stdout.write(
        isPinSet(deps.configDir)
          ? `A PIN is set (${authFilePath(deps.configDir)}). Change it with "app-core-cli pin set".\n`
          : `No PIN is set: routes that modules declare sensitive answer 403 until you run "app-core-cli pin set".\n`,
      );
      return 0;
    }
    if (!deps.interactive) {
      return fail('"pin set" needs an interactive terminal: the PIN is typed with the keyboard, hidden, and never taken from the command line, a pipe or a file. Run it in a terminal.');
    }
    const pin = await deps.readHidden(`New PIN (${MIN_PIN_LENGTH} to ${MAX_PIN_LENGTH} characters, hidden): `);
    // Same rule as the dashboard and setPin (one function), checked before asking twice.
    const problem = pinProblem(pin);
    if (problem !== undefined) {
      return fail(`${problem} Nothing was changed.`);
    }
    const again = await deps.readHidden('Type it again: ');
    if (again !== pin) {
      return fail('the two entries do not match. Nothing was changed.');
    }
    const replaced = isPinSet(deps.configDir);
    await setPin(deps.configDir, pin);
    deps.stdout.write(
      `${replaced ? 'PIN replaced' : 'PIN set'}. It is per machine: it unlocks sensitive actions on this computer only, and is stored as a scrypt hash in ${authFilePath(deps.configDir)}.\n` +
        `Every session opened so far is closed: the dashboard asks for the PIN again at the next sensitive action.\n` +
        (process.platform === 'win32' ? 'On Windows the file mode is not enforced: any process of your user account can read that file (a short PIN can then be found offline).\n' : ''),
    );
    return 0;
  } catch (err) {
    return fail(getErrorMessage(err));
  }
}
