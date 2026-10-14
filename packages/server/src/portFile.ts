import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveConfigDir } from './configDir.js';

// Orchestrator's `portFile` liveness strategy reads this JSON file and skips a startup job
// while `pid` is alive, so a second start never collides with a running server.
export function portFilePath(configDir = resolveConfigDir()): string {
  return path.join(configDir, 'server.port.json');
}

export function writePortFile(port: number, configDir = resolveConfigDir()): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(portFilePath(configDir), JSON.stringify({ pid: process.pid, port }) + '\n');
}

// Only removes a file this process wrote: after a crash and restart the file belongs to the successor.
export function removePortFile(configDir = resolveConfigDir()): void {
  const file = portFilePath(configDir);
  if (!fs.existsSync(file)) {
    return;
  }
  const { pid } = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: unknown };
  if (pid === process.pid) {
    fs.rmSync(file);
  }
}
