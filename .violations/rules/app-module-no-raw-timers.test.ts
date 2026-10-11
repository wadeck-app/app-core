import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rule } from './app-module-no-raw-timers.js';

describe('app-module/no-raw-timers', () => {
  it('has the correct rule id and severity', () => {
    expect(rule.id).toBe('app-module/no-raw-timers');
    expect(rule.defaultSeverity).toBe('error');
  });

  it('scopes itself to packages/*-app-module/** so it auto-applies with no config (Decision #22/#37)', () => {
    expect(rule.defaultScope.some((p) => p.includes('packages/*-app-module'))).toBe(true);
  });

  describe('check()', () => {
    let dir: string;
    let fakeAppModuleFile: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'violations-app-module-'));
      const appModuleDir = path.join(dir, 'packages', 'fake-app-module', 'src');
      fs.mkdirSync(appModuleDir, { recursive: true });
      fakeAppModuleFile = path.join(appModuleDir, 'backend.ts');
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('flags a raw setInterval call', async () => {
      fs.writeFileSync(fakeAppModuleFile, "setInterval(() => {}, 1000);\n");
      const violations = await rule.check([fakeAppModuleFile]);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.message).toContain('setInterval');
    });

    it('flags raw addEventListener usage', async () => {
      fs.writeFileSync(fakeAppModuleFile, "window.addEventListener('x', fn);\n");
      const violations = await rule.check([fakeAppModuleFile]);
      expect(violations).toHaveLength(1);
    });

    it('does not flag moduleContext.setInterval/.on usage', async () => {
      fs.writeFileSync(fakeAppModuleFile, "ctx.setInterval(() => {}, 1000);\nctx.on('y', fn);\n");
      const violations = await rule.check([fakeAppModuleFile]);
      expect(violations).toHaveLength(0);
    });

    it('ignores test files', async () => {
      const testFile = fakeAppModuleFile.replace('.ts', '.test.ts');
      fs.writeFileSync(testFile, "setInterval(() => {}, 1000);\n");
      const violations = await rule.check([testFile]);
      expect(violations).toHaveLength(0);
    });
  });
});
