import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-import-boundaries.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/import-boundaries', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  async function run(files: Record<string, string>) {
    mod = createModule(files);
    return rule.check(Object.keys(files).map((f) => mod.at(f)));
  }

  it('lets backend and dsl-components import commons and node/third-party code', async () => {
    const violations = await run({
      'src/commons/types.ts': 'export type T = string;\n',
      'src/backend/index.ts': "import { readFileSync } from 'node:fs';\nimport { a } from '../commons/types.js';\nexport default () => {};\n",
      'src/dsl-components/index.ts': "import { b } from '../commons/types.js';\nexport default [];\n",
    });
    expect(violations).toHaveLength(0);
  });

  it('flags a Node builtin in commons, with or without the node: prefix', async () => {
    const violations = await run({
      'src/commons/a.ts': "import fs from 'node:fs';\nexport const a = fs;\n",
      'src/commons/b.ts': "import path from 'path';\nexport const b = path;\n",
      'src/commons/c.ts': "const x = require('fs/promises');\n",
    });
    expect(violations).toHaveLength(3);
  });

  it('flags backend importing dsl-components, and the reverse', async () => {
    const violations = await run({
      'src/backend/index.ts': "import { Card } from '../dsl-components/Card.js';\nexport default () => {};\n",
      'src/dsl-components/Card.tsx': "import { db } from '../backend/db.js';\nexport const Card = db;\n",
    });
    expect(violations).toHaveLength(2);
    expect(violations[0]!.message).toContain('src/commons');
  });

  it('flags commons importing backend or dsl-components', async () => {
    const violations = await run({
      'src/commons/a.ts': "import { x } from '../backend/x.js';\n",
      'src/commons/b.ts': "export { y } from '../dsl-components/y.js';\n",
    });
    expect(violations).toHaveLength(2);
  });

  it('flags a dynamic import and a multi-line import', async () => {
    const violations = await run({
      'src/backend/a.ts': "const m = await import('../dsl-components/x.js');\n",
      'src/backend/b.ts': "import {\n  one,\n  two,\n} from '../dsl-components/y.js';\n",
    });
    expect(violations).toHaveLength(2);
    expect(violations.find((v) => v.file.endsWith('b.ts'))!.line).toBe(1);
  });

  it('ignores type-only imports and commented-out imports (the compiler erases them)', async () => {
    const violations = await run({
      'src/commons/a.ts': "import type { X } from 'node:fs';\n// import fs from 'node:fs';\n/* import b from '../backend/b.js'; */\n",
    });
    expect(violations).toHaveLength(0);
  });
});
