import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-no-react.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/no-react', () => {
  let mod: TempModule;
  afterEach(() => mod.cleanup());

  it('allows .tsx and react in src/dsl-components', async () => {
    mod = createModule({
      'src/dsl-components/Card.tsx': "import { useState } from 'react';\nexport const Card = () => <div />;\n",
    });
    expect(await rule.check([mod.at('src/dsl-components/Card.tsx')])).toHaveLength(0);
  });

  it('flags a .tsx file in src/backend', async () => {
    mod = createModule({ 'src/backend/Widget.tsx': 'export const x = 1;\n' });
    const violations = await rule.check([mod.at('src/backend/Widget.tsx')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('src/dsl-components');
  });

  it('flags a .jsx file in src/commons', async () => {
    mod = createModule({ 'src/commons/x.jsx': 'export const x = 1;\n' });
    expect(await rule.check([mod.at('src/commons/x.jsx')])).toHaveLength(1);
  });

  it('flags a react import in src/backend', async () => {
    mod = createModule({ 'src/backend/index.ts': "import { useState } from 'react';\nexport default () => {};\n" });
    const violations = await rule.check([mod.at('src/backend/index.ts')]);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(1);
  });

  it('flags react-dom and subpath imports in src/commons', async () => {
    mod = createModule({ 'src/commons/a.ts': "import { createRoot } from 'react-dom/client';\nexport const a = createRoot;\n", 'src/commons/b.ts': "export * from 'react/jsx-runtime';\n" });
    expect(await rule.check([mod.at('src/commons/a.ts'), mod.at('src/commons/b.ts')])).toHaveLength(2);
  });

  it('does not flag type-only imports, comments or packages that merely start with react', async () => {
    mod = createModule({
      'src/backend/index.ts': "// import x from 'react';\nimport type { ReactNode } from 'react';\nimport q from 'react-query';\nexport default () => {};\n",
    });
    expect(await rule.check([mod.at('src/backend/index.ts')])).toHaveLength(0);
  });

  it('applies to test files too, like `check`', async () => {
    mod = createModule({ 'src/backend/index.test.ts': "import { useState } from 'react';\n" });
    expect(await rule.check([mod.at('src/backend/index.test.ts')])).toHaveLength(1);
  });

  it('ignores generated dist-module files', async () => {
    mod = createModule({ 'dist-module/api-backend/backend.cjs': "require('react');\n" });
    expect(await rule.check([mod.at('dist-module/api-backend/backend.cjs')])).toHaveLength(0);
  });
});
