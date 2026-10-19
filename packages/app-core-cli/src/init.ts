import * as fs from 'node:fs';
import * as path from 'node:path';
import { MODULE_ID_PATTERN, MODULE_ID_RULE } from '@wadeck-app/app-core-server/moduleId';

export const INIT_USAGE = 'app-core-cli init <module-dir> [--id <module-id>] [--title <display name>]';

export interface InitArgs {
  id: string | undefined;
  title: string | undefined;
}

// Only `--id` and `--title`; anything else is an error naming the usage, so a typo is never silently ignored.
export function parseInitArgs(args: string[]): InitArgs {
  const parsed: InitArgs = { id: undefined, title: undefined };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag !== '--id' && flag !== '--title') {
      throw new Error(`Unknown option "${flag}". Usage: ${INIT_USAGE}`);
    }
    if (value === undefined || value.trim() === '' || value.startsWith('--')) {
      throw new Error(`${flag} needs a value. Usage: ${INIT_USAGE}`);
    }
    parsed[flag === '--id' ? 'id' : 'title'] = value;
  }
  return parsed;
}

// "app-module-billing" -> "billing": the folder convention is not part of the id.
export function defaultIdFor(moduleDir: string): string {
  return path.basename(path.resolve(moduleDir)).replace(/^app-module-/, '');
}

export interface InitResult {
  id: string;
  files: string[];
}

// Writes the smallest module that passes `check`: one page in the navigation, one backend route. Refuses a folder that
// already has content rather than mixing with it.
export function initModule(moduleDir: string, args: InitArgs): InitResult {
  const id = args.id ?? defaultIdFor(moduleDir);
  if (!MODULE_ID_PATTERN.test(id)) {
    throw new Error(
      `"${id}" is not a valid module id: it must ${MODULE_ID_RULE}. ` +
        (args.id === undefined ? `Pass one with --id <module-id> (the folder name "${path.basename(path.resolve(moduleDir))}" was used as the default).` : 'Pick another with --id.'),
    );
  }
  if (fs.existsSync(moduleDir) && fs.readdirSync(moduleDir).length > 0) {
    throw new Error(`${moduleDir} already has content: init writes into an empty or new folder. Choose another folder, or edit the module by hand.`);
  }

  const label = args.title ?? id;
  const files: Record<string, string> = {
    'manifest.json': `${JSON.stringify(
      {
        id,
        ...(args.title === undefined ? {} : { title: args.title }),
        extensionPoints: [{ kind: 'page', slot: 'nav', label, view: { type: 'path', value: './src/dsl-views/page.yaml' } }],
      },
      null,
      2,
    )}\n`,
    'package.json': `${JSON.stringify({ name: `app-module-${id}`, version: '0.0.0', private: true, files: ['dist-module'] }, null, 2)}\n`,
    '.gitignore': 'node_modules\ndist-module\n.app-core-dev\n',
    'src/dsl-views/page.yaml': `$sources:\n  ping:\n    url: GET /api/modules/${id}/ping\n$type: Badge\nlabel: $sources.ping.message\n`,
    'src/backend/index.ts':
      "export default function register(ctx: { registerRoute: (method: string, path: string, handler: (req: unknown, reply: { send: (body: unknown) => void }) => void) => void }): void {\n" +
      "  ctx.registerRoute('GET', '/ping', (_req, reply) => reply.send({ message: 'hello from " +
      id +
      "' }));\n}\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(moduleDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return { id, files: Object.keys(files) };
}
