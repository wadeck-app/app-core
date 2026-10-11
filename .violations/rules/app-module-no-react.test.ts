import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-no-react.js';

describe('app-module/no-react', () => {
  let dir: string;
  let fileBase: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-no-react-'));
    const appModuleDir = path.join(dir, 'packages', 'app-module-fake', 'api-backend');
    fs.mkdirSync(appModuleDir, { recursive: true });
    fileBase = appModuleDir;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('flags any .tsx file outright', async () => {
    const file = path.join(fileBase, 'Widget.tsx');
    fs.writeFileSync(file, 'export const x = 1;\n');
    const violations = await rule.check([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('.tsx');
  });

  it('flags a react import in a .ts file', async () => {
    const file = path.join(fileBase, 'index.ts');
    fs.writeFileSync(file, "import { useState } from 'react';\n");
    const violations = await rule.check([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('react');
  });

  it('does not flag plain backend code with no react usage', async () => {
    const file = path.join(fileBase, 'index.ts');
    fs.writeFileSync(file, "export default function (ctx) { ctx.registerRoute('GET', '/x', () => ({})); }\n");
    const violations = await rule.check([file]);
    expect(violations).toHaveLength(0);
  });

  it('ignores test files', async () => {
    const file = path.join(fileBase, 'index.test.ts');
    fs.writeFileSync(file, "import { useState } from 'react';\n");
    const violations = await rule.check([file]);
    expect(violations).toHaveLength(0);
  });
});
