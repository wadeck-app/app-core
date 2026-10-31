import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildServer } from '../src/server.js';
import { msysToWindows, receivedPathHint } from '../src/pathHint.js';

describe('msysToWindows', () => {
  it('turns the Git Bash form of a drive path into the Windows form', () => {
    expect(msysToWindows('/c/Users/x/manifest.json')).toBe('C:/Users/x/manifest.json');
    expect(msysToWindows('/d/app')).toBe('D:/app');
    expect(msysToWindows('/c')).toBe('C:/');
  });

  it('leaves everything else alone', () => {
    expect(msysToWindows('C:/Users/x')).toBeUndefined();
    expect(msysToWindows('/usr/local/x')).toBeUndefined();
    expect(msysToWindows('relative/x')).toBeUndefined();
  });
});

describe('receivedPathHint', () => {
  it('names what was sent, how the server read it, and the form that works, for a Git Bash path on Windows', () => {
    const hint = receivedPathHint('/c/Users/x/manifest.json', 'C:\\c\\Users\\x\\manifest.json', 'win32');
    expect(hint).toContain('You sent "/c/Users/x/manifest.json", the Git Bash form of a Windows path');
    expect(hint).toContain('read it as C:\\c\\Users\\x\\manifest.json');
    expect(hint).toContain('Send "C:/Users/x/manifest.json" (or "C:\\Users\\x\\manifest.json") instead.');
  });

  it('says nothing about a /c/... path on a system that is not Windows: it is a real path there', () => {
    expect(receivedPathHint('/c/Users/x', '/c/Users/x', 'linux')).toBe('');
  });

  it('asks for an absolute path when a relative one was sent', () => {
    const hint = receivedPathHint('dist-module/manifest.json', '/srv/app/dist-module/manifest.json', 'linux');
    expect(hint).toContain('You sent the relative path "dist-module/manifest.json"');
    expect(hint).toContain('Send an absolute path');
  });

  it('adds nothing when the path was read as written', () => {
    expect(receivedPathHint('C:/Users/x/manifest.json', 'C:\\Users\\x\\manifest.json', 'win32')).toBe('');
    expect(receivedPathHint('/srv/app/manifest.json', '/srv/app/manifest.json', 'linux')).toBe('');
  });
});

describe('POST /api/modules/update with a path that leads nowhere', () => {
  let configDir: string;
  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-pathhint-'));
  });
  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  const post = async (sent: string) => {
    const { server } = await buildServer({ configDir, publicDir: path.join(configDir, 'none') });
    try {
      const res = await server.inject({ method: 'POST', url: '/api/modules/update', payload: { id: 'ghost', source: { type: 'file', path: sent } } });
      return { status: res.statusCode, error: (JSON.parse(res.body) as { error: string }).error };
    } finally {
      await server.close();
    }
  };

  it.runIf(process.platform === 'win32')('answers 400 naming the Git Bash path that was sent and the Windows form to send', async () => {
    const { status, error } = await post('/c/Users/nobody/manifest.json');
    expect(status).toBe(400);
    expect(error).toContain('does not exist');
    expect(error).toContain('You sent "/c/Users/nobody/manifest.json"');
    expect(error).toContain('Send "C:/Users/nobody/manifest.json"');
  });

  it('answers 400 naming the relative path that was sent', async () => {
    const { status, error } = await post('no-such-dir/manifest.json');
    expect(status).toBe(400);
    expect(error).toContain('You sent the relative path "no-such-dir/manifest.json"');
  });
});
