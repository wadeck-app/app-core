// The guide for one case: a module that is the whole application. Printed by `app-core-cli help standalone` and by
// `app-core-cli serve --module <dir> --help`; written for whoever (a person or an agent) has to ship such an application.
export const STANDALONE_SUMMARY = 'One module as a whole application: no dashboard, no module tabs, no update check. Read it with: app-core-cli help standalone';

export const STANDALONE_HELP = `app-core-cli serve --module <built-module-dir|manifest.json> [--config-dir <dir>] [--port <n>] [--no-tray] [--no-update]

An application made of one module. app-core serves that module and what it requires, and nothing else:
  - no dashboard, no tabs to switch module, no "Modules" or "A/B tests" page; the top bar shows the title of the module;
  - "/" opens the first page the module adds to the menu (a page with "slot": "nav" in its manifest). A module with no such page
    has nothing to open on: the page says so. Add one, or this is not an application.

Steps, from the folder of the module's package:
  1. app-core-cli check <module-dir>                      every problem is listed with its fix
  2. app-core-cli package <module-dir> --version <v>      writes <module-dir>/dist-module (a source manifest cannot be served)
  3. app-core-cli serve --module <module-dir>/dist-module --config-dir <data-dir> --port <n> --no-tray --no-update
  4. open http://127.0.0.1:<n>/

What is loaded: the module, and the modules it "requires" found in the node_modules of its package (as "dev" does; a missing or
unbuilt one stops the start with its name and the fix). The registry in --config-dir is rewritten at each start, so nothing else
ever loads; the data/ and state/ of the modules are kept between runs.

Options
  --module <dir|manifest.json>  The built module (the folder, or its manifest.json). Without it the command is the global app-core
                                with its dashboard.
  --config-dir <dir>            Where the application keeps its registry, data/ and state/. Default: <app-core-cli config dir>/
                                standalone/<module id>. Give the application its own folder. Refused without --module.
  --port <n>                    Port on 127.0.0.1; else APP_CORE_PORT; else 4850, which a global app-core may already use.
  --no-tray                     No tray icon. Without it the icon's menu shows the folder of the data.
  --no-update                   No background self-update of app-core-cli, and no update check or install in the tray menu (it shows
                                the version only). APP_CORE_CLI_NO_UPDATE=1 does the same, for a launcher that cannot add a flag.
                                "app-core-cli update" still updates when it is run on purpose.
  --ab-tests                    Shows the A/B test dock; off in a production build.

Shipping it as a command of the module's package
  - dependencies: "@wadeck-app/app-core-cli"; files: include "dist-module" (and the bin script).
  - "bin": { "<app>": "./bin/<app>.mjs" } with a script that runs the CLI of its own dependency:

      #!/usr/bin/env node
      import { spawn } from 'node:child_process';
      import { createRequire } from 'node:module';
      import { fileURLToPath } from 'node:url';
      const cli = createRequire(import.meta.url).resolve('@wadeck-app/app-core-cli/dist/cli.bundle.js');
      const dist = fileURLToPath(new URL('../dist-module', import.meta.url));
      const args = ['serve', '--module', dist, '--no-update', ...process.argv.slice(2)];
      spawn(process.execPath, [cli, ...args], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 1));

    Arguments given to the command (--port, --config-dir, --no-tray) are passed on after the fixed ones.
  - run "app-core-cli package" before "npm publish" (the dist-module folder must exist in the published files).

Not covered: a window or an installer around the browser, a name or an icon other than the title of the module, hiding the
information menu of the top bar.
`;
