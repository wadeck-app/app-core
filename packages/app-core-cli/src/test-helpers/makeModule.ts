import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const BASE_MANIFEST = {
  id: 'tiny',
  extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Home', view: { type: 'path', value: './src/dsl-views/home.yaml' } }],
};

// A module in the decision-81 layout that passes `check` as is. Tests override or remove single files.
export function validModuleFiles(): Record<string, string> {
  return {
    'manifest.json': JSON.stringify(BASE_MANIFEST, null, 2),
    'package.json': JSON.stringify({ name: 'tiny', files: ['dist-module'] }),
    '.gitignore': 'node_modules\ndist-module\n',
    'README.md': '# tiny\n',
    'src/backend/index.ts':
      "import { GREETING } from '../commons/greeting.js';\n" +
      'export default function (ctx: { registerRoute: (m: string, p: string, h: (req: unknown, reply: { send: (b: unknown) => void }) => void) => void }): void {\n' +
      "  ctx.registerRoute('GET', '/ping', (_req, reply) => reply.send({ greeting: GREETING }));\n" +
      '}\n',
    'src/commons/greeting.ts': "export const GREETING: string = 'hello';\n",
    'src/dsl-views/home.yaml': '$type: Badge\nlabel: hi\n',
  };
}

// Writes `files` (relative path -> content; null removes a file of the base set) into a fresh temp dir.
export function makeModule(overrides: Record<string, string | null> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-module-'));
  const files: Record<string, string | null> = { ...validModuleFiles(), ...overrides };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) {
      continue;
    }
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

export function removeModule(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export const DSL_COMPONENT_FILES: Record<string, string> = {
  'manifest.json': JSON.stringify({ ...BASE_MANIFEST, dslLib: { shared: { react: '^19' } } }, null, 2),
  'src/dsl-components/Hello.tsx':
    "import { createElement } from 'react';\n" +
    "import { Badge } from '@wadeck-app/dsl-ui/dist/components/display/Badge.js';\n" +
    "export function Hello({ who }: { who: string }) { return <div>{createElement(Badge, { label: who })}</div>; }\n" +
    "export function Unused() { return <span>never referenced</span>; }\n",
  'src/dsl-components/index.ts':
    "import { Hello } from './Hello.js';\n" +
    "export default [{ name: 'Hello', component: Hello }];\n",
};
