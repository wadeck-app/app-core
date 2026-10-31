import { DEV_USAGE } from './dev.js';
import { INIT_USAGE } from './init.js';
import { LINK_USAGE } from './providers.js';

interface CommandHelp {
  usage: string;
  // What it does, and what it changes on the machine: `--help` is where a user reads that before running it.
  summary: string;
}

const COMMANDS: Record<string, CommandHelp> = {
  validate: {
    usage: 'app-core-cli validate <path-to-manifest.json> [--json]',
    summary: 'Checks a manifest. Reads only; changes nothing.',
  },
  init: {
    usage: INIT_USAGE,
    summary: 'Creates a new module folder (it refuses a folder that already has content).',
  },
  check: {
    usage: `app-core-cli check <module-dir> [${LINK_USAGE}]...`,
    summary: 'Checks a module folder and lists every problem with its fix. Reads only; changes nothing.',
  },
  package: {
    usage: `app-core-cli package <module-dir> [--out <dir>] [--version <v>] [${LINK_USAGE}]...`,
    summary: 'Builds the module into <module-dir>/dist-module, or into --out. Writes files there only.',
  },
  dev: {
    usage: DEV_USAGE,
    summary: 'Starts a real app-core server with the module and what it requires, then prints the address. Keeps its data in <module-dir>/.app-core-dev.',
  },
  serve: {
    usage: 'app-core-cli serve [--no-tray] [--ab-tests]',
    summary: 'Runs the app-core server and the bundled frontend in the foreground (port from APP_CORE_PORT, default 4850).',
  },
  tray: {
    usage: 'app-core-cli tray --url <address "Open app-core" goes to>',
    summary: 'Shows the tray icon next to a server run from sources. Started by scripts/dev-all.mjs, not meant to be run by hand.',
  },
  version: {
    usage: 'app-core-cli version',
    summary: 'Prints the installed version and the latest published one. Changes nothing.',
  },
  update: {
    usage: 'app-core-cli update',
    summary: 'Installs the latest published release of @wadeck-app/app-core-cli with npm (global install). A build from the repository refuses it.',
  },
  'self-check': {
    usage: 'app-core-cli self-check',
    summary: 'Checks that the installed command is whole. Changes nothing.',
  },
};

const HELP_FLAGS = new Set(['--help', '-h']);

// Whether the user only asks how a command works. `--help` and `-h` never run the command, wherever they stand in the
// arguments, and `help` / `--help` alone lists the commands. A flag used as the value of another one (`--title --help`) is
// not told apart: asking for help wins, nothing is run.
export function isHelpRequest(argv: readonly string[]): boolean {
  const [command, ...args] = argv;
  if (command === undefined || command === 'help') {
    return command === 'help';
  }
  return HELP_FLAGS.has(command) || args.some((arg) => HELP_FLAGS.has(arg));
}

// The text for a help request: the command's own page, or the list of commands.
export function helpText(argv: readonly string[]): string {
  const [first, second] = argv;
  const name = first === 'help' || (first !== undefined && HELP_FLAGS.has(first)) ? second : first;
  const page = name === undefined ? undefined : COMMANDS[name];
  if (page !== undefined) {
    return `${page.usage}\n\n${page.summary}\n`;
  }
  const lines = Object.entries(COMMANDS)
    .filter(([name]) => name !== 'tray')
    .map(([name, c]) => `  ${name.padEnd(11)} ${c.summary}`);
  const unknown = name !== undefined && !HELP_FLAGS.has(name) ? `Unknown command "${name}".\n\n` : '';
  return `${unknown}Usage: app-core-cli <command> [options]\n\nCommands:\n${lines.join('\n')}\n\nRun \`app-core-cli <command> --help\` for the usage of one command; it never runs the command.\n`;
}
