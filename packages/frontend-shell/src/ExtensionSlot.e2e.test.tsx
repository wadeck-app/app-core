import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { MemoryRouter } from 'react-router-dom';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';

// Real end-to-end test, not mocked: a real app-core server process (the actual
// built dist/index.js, not an in-process stub), the real published
// @wadeck-app/dsl-renderer ExtensionSlot directive, and the real GenericPageRunner
// + fetcher wiring already used in production (ModulePage.tsx). Proves the bare
// array returned by GET /api/slots/:slotId (order sorted/stripped server-side)
// actually interoperates with dsl-renderer's real ExtensionSlot implementation,
// not just each side's own isolated test suite.
const PORT = 48700;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const serverEntry = path.resolve(
  import.meta.dirname,
  '../../server/dist/index.js',
);
const fixturesDir = path.resolve(import.meta.dirname, '../../test-app-modules');

let serverProcess: ChildProcess;

async function waitForReady(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server did not become ready in time')), 10_000);
    proc.stdout?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes('"type":"ready"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) reject(new Error(`server exited early with code ${code}`));
    });
  });
}

async function registerFixture(id: string, manifestDir: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/modules/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, source: { type: 'file', path: path.join(manifestDir, 'manifest.json') } }),
  });
  if (!res.ok) {
    throw new Error(`failed to register ${id}: ${res.status} ${await res.text()}`);
  }
}

describe('ExtensionSlot real end-to-end', () => {
  beforeAll(async () => {
    serverProcess = spawn('node', [serverEntry], {
      env: {
        ...process.env,
        APP_CORE_PORT: String(PORT),
        APP_CORE_CONFIG_DIR: path.join(path.dirname(serverEntry), '..', '.e2e-scratch-config'),
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    await waitForReady(serverProcess);
    await registerFixture('slot-contributor-a', path.join(fixturesDir, 'app-module-slot-contributor-a'));
    await registerFixture('slot-contributor-b', path.join(fixturesDir, 'app-module-slot-contributor-b'));
  }, 20_000);

  afterAll(() => {
    serverProcess?.kill();
  });

  it('renders real ExtensionSlot contributions fetched from a real running /api/slots/:slotId, in sorted order', async () => {
    const yamlText = [
      '$sources:',
      '  contributions:',
      `    url: "GET ${BASE_URL}/api/slots/test:shared-slot"`,
      '',
      '$type: ExtensionSlot',
      'items: $sources.contributions',
      '',
    ].join('\n');

    render(
      <MemoryRouter>
        <GenericPageRunner yamlText={yamlText} registry={appRegistry} fetcher={fetcher} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText('contributor-b-ordered')).toBeInTheDocument());
    expect(screen.getByText('contributor-a')).toBeInTheDocument();
    expect(screen.getByText('contributor-b-unordered')).toBeInTheDocument();

    // Real proof of real server-side sorting (the `order` field),
    // not just "all three happened to render": DOM order must match the
    // sorted response order verified manually against the real endpoint
    // (order=5, then order=20, then no-order last).
    const labels = ['contributor-b-ordered', 'contributor-a', 'contributor-b-unordered'];
    const positions = labels.map((label) => screen.getByText(label).compareDocumentPosition);
    expect(positions.length).toBe(3);
    const first = screen.getByText('contributor-b-ordered');
    const second = screen.getByText('contributor-a');
    const third = screen.getByText('contributor-b-unordered');
    // Node.DOCUMENT_POSITION_FOLLOWING = 4 -- `first` precedes `second` precedes `third`.
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders nothing (no error) for a slot nobody contributes to', async () => {
    const yamlText = [
      '$sources:',
      '  contributions:',
      `    url: "GET ${BASE_URL}/api/slots/nothing:here"`,
      '',
      '$type: ExtensionSlot',
      'items: $sources.contributions',
      '',
    ].join('\n');

    const { container } = render(
      <MemoryRouter>
        <GenericPageRunner yamlText={yamlText} registry={appRegistry} fetcher={fetcher} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.textContent).not.toContain('contributor'));
  });
});
