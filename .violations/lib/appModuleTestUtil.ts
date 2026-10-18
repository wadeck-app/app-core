import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Inline temp modules for the app-module/* rule tests: never the real fixtures, which are migrated
// independently. `files` overrides or adds files by module-relative path; null deletes a default file.
export const VALID_MODULE_FILES: Record<string, string> = {
  'manifest.json': JSON.stringify({
    id: 'fixture',
    extensionPoints: [{ kind: 'page', slot: 'nav', label: 'Fixture', view: { type: 'path', value: './src/dsl-views/page.yaml' } }],
  }),
  'package.json': JSON.stringify({ name: 'app-module-fake', files: ['dist-module'] }),
  '.gitignore': 'dist-module\n',
  'src/backend/index.ts': 'export default function (ctx: unknown): void {\n  void ctx;\n}\n',
  'src/dsl-views/page.yaml': '$type: Badge\nlabel: ok\n',
};

export interface TempModule {
  /** Parent folder of the module; remove it after the test. */
  base: string;
  /** Module root (…/packages/app-module-fake). */
  root: string;
  /** Absolute path of a module-relative path. */
  at(rel: string): string;
  cleanup(): void;
}

export function createModule(files: Record<string, string | null> = {}, folderName = 'app-module-fake'): TempModule {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-app-module-'));
  const root = path.join(base, 'packages', folderName);
  const merged: Record<string, string | null> = { ...VALID_MODULE_FILES, ...files };
  for (const [rel, content] of Object.entries(merged)) {
    if (content === null) continue;
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.mkdirSync(root, { recursive: true });
  return { base, root, at: (rel) => path.join(root, rel), cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}
