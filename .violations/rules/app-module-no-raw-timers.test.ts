import { describe, it, expect, afterEach } from 'vitest';
import { rule } from './app-module-no-raw-timers.js';
import { createModule, type TempModule } from '../lib/appModuleTestUtil.js';

describe('app-module/no-raw-timers', () => {
  it('has the correct rule id and severity', () => {
    expect(rule.id).toBe('app-module/no-raw-timers');
    expect(rule.defaultSeverity).toBe('error');
  });

  it('scopes itself to src/backend of any app-module-* folder, wherever it sits in the repo', () => {
    expect(rule.defaultScope.every((p) => p.startsWith('**/app-module-*/src/backend/'))).toBe(true);
  });

  describe('check()', () => {
    let mod: TempModule;
    afterEach(() => mod.cleanup());

    async function run(content: string, file = 'src/backend/index.ts') {
      mod?.cleanup();
      mod = createModule({ [file]: content });
      return rule.check([mod.at(file)]);
    }

    it('flags a raw setInterval call', async () => {
      const violations = await run('setInterval(() => {}, 1000);\n');
      expect(violations).toHaveLength(1);
      expect(violations[0]!.message).toContain('setInterval');
    });

    it('flags raw setTimeout and addEventListener usage', async () => {
      expect(await run('setTimeout(fn, 1);\n')).toHaveLength(1);
      expect(await run("window.addEventListener('x', fn);\n")).toHaveLength(1);
    });

    it('does not flag moduleContext.setInterval/.on usage', async () => {
      expect(await run("ctx.setInterval(() => {}, 1000);\nctx.on('y', fn);\n")).toHaveLength(0);
    });

    it('ignores test files', async () => {
      expect(await run('setInterval(() => {}, 1000);\n', 'src/backend/index.test.ts')).toHaveLength(0);
    });
  });
});
