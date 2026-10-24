import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { formatBuildDate, readTrayBuildInfo } from './buildInfo.js';

const dirs: string[] = [];
function bundleDirWith(buildInfo: string | undefined): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-cli-buildinfo-test-'));
  dirs.push(dir);
  if (buildInfo !== undefined) {
    fs.mkdirSync(path.join(dir, 'public'));
    fs.writeFileSync(path.join(dir, 'public', 'build-info.json'), buildInfo);
  }
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('formatBuildDate', () => {
  it('writes the local date and minute, zero padded', () => {
    const local = new Date(2026, 0, 5, 9, 7);
    expect(formatBuildDate(local.toISOString())).toBe('2026-01-05 09:07');
  });

  it('refuses what is not a date', () => {
    expect(formatBuildDate('yesterday')).toBeNull();
  });
});

describe('readTrayBuildInfo', () => {
  it('names the build by its date and the dsl packages by their version', () => {
    const builtAt = new Date(2026, 9, 24, 11, 34).toISOString();
    const info = readTrayBuildInfo(bundleDirWith(JSON.stringify({ builtAt, dslUi: '2026.10.24-137-3e64e6e9', dslRenderer: '2026.10.24-137-3e64e6e9' })));
    expect(info).toEqual({ builtLabel: 'dev build 2026-10-24 11:34', dslLabel: 'dsl-ui 2026.10.24-137-3e64e6e9' });
  });

  it('names the renderer too when it is another version than the ui', () => {
    const info = readTrayBuildInfo(bundleDirWith(JSON.stringify({ builtAt: new Date().toISOString(), dslUi: '2026.10.24-137', dslRenderer: '2026.10.24-136' })));
    expect(info.dslLabel).toBe('dsl-ui 2026.10.24-137, dsl-renderer 2026.10.24-136');
  });

  it('says so, loudly, when there is no build-info.json', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const info = readTrayBuildInfo(bundleDirWith(undefined));
    expect(info).toEqual({ builtLabel: 'dev build (date unknown)', dslLabel: null });
    expect(write).toHaveBeenCalledWith(expect.stringContaining('npm run build'));
  });

  it('does not invent a date or a version the file does not have', () => {
    const info = readTrayBuildInfo(bundleDirWith(JSON.stringify({ builtAt: 'soon' })));
    expect(info).toEqual({ builtLabel: 'dev build (date unknown)', dslLabel: null });
  });
});
