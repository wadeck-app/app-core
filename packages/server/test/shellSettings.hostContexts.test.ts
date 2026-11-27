import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HOST_CONTEXTS } from '@wadeck-app/dsl-ui';
import { NOT_PROVIDED_HOST_CONTEXTS, PROVIDED_HOST_CONTEXTS } from '../src/hostContexts.js';
import { buildServer, type AppCoreServer } from '../src/server.js';

describe('the host contexts the shell provides', () => {
  let dir: string;
  let app: AppCoreServer;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-core-hostctx-'));
    app = await buildServer({ configDir: path.join(dir, 'cfg') });
  });
  afterEach(async () => {
    await app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('are served by GET /api/shell-settings as providedContexts, for the module builds that give them to the DSL compiler', async () => {
    const res = await app.server.inject({ method: 'GET', url: '/api/shell-settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json().providedContexts).toEqual([...PROVIDED_HOST_CONTEXTS]);
  });

  it('are all names of dsl-ui, each context of dsl-ui being either provided or not provided, never both nor forgotten', () => {
    const everything = [...PROVIDED_HOST_CONTEXTS, ...NOT_PROVIDED_HOST_CONTEXTS];
    expect([...everything].sort()).toEqual([...HOST_CONTEXTS].sort());
    expect(new Set(everything).size).toBe(everything.length);
  });
});
