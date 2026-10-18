import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { portFilePath, readServerPort, removePortFile, writePortFile } from '../src/portFile.js';

describe('port file (orch portFile liveness contract)', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-portfile-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('writes this process pid and the port as JSON, creating the config dir if needed', () => {
    const nested = path.join(configDir, 'not-yet');
    writePortFile(4850, nested);
    expect(JSON.parse(fs.readFileSync(portFilePath(nested), 'utf8'))).toEqual({ pid: process.pid, port: 4850 });
  });

  it('removes the file it wrote', () => {
    writePortFile(4850, configDir);
    removePortFile(configDir);
    expect(fs.existsSync(portFilePath(configDir))).toBe(false);
  });

  it('leaves a file written by another process untouched', () => {
    fs.writeFileSync(portFilePath(configDir), JSON.stringify({ pid: process.pid + 1, port: 4850 }));
    removePortFile(configDir);
    expect(fs.existsSync(portFilePath(configDir))).toBe(true);
  });

  it('does nothing when there is no file', () => {
    expect(() => removePortFile(configDir)).not.toThrow();
  });

  it('reads back the port app-core really bound', () => {
    writePortFile(4861, configDir);
    expect(readServerPort(configDir)).toBe(4861);
  });

  it('has no port when the file is missing, not JSON, or carries no valid port', () => {
    expect(readServerPort(configDir)).toBeUndefined();
    fs.writeFileSync(portFilePath(configDir), 'not json');
    expect(readServerPort(configDir)).toBeUndefined();
    for (const port of ['4861', 0, -1, 70000, 48.5, null]) {
      fs.writeFileSync(portFilePath(configDir), JSON.stringify({ pid: 1, port }));
      expect(readServerPort(configDir), String(port)).toBeUndefined();
    }
  });
});
