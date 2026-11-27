import { render, screen } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { HeaderActions, HOST_CONTEXTS, RouterContext, ThemeContext, UrlParamContext } from '@wadeck-app/dsl-ui';
import { AbExperimentsContext } from '@wadeck-app/dsl-ui/dist/components/dev/AbExperiments.js';
import { ToastContext } from '@wadeck-app/dsl-ui/dist/components/overlay/Toast.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

// What the shell tells the module builds it provides (`providedContexts` of the DSL compiler, served by GET /api/shell-settings) is
// the list in packages/server/src/hostContexts.ts. This test mounts the real shell and checks, for every context dsl-ui names, that a
// page of a module really finds it (or really does not), so the list cannot drift from what App.tsx and AppLayout.tsx provide.

// The page of the test is a probe: it reports what the contexts around it hold. It stands for the view runner.
const found: Record<string, boolean> = {};
vi.mock('./ModuleView.js', () => ({
  ModuleView: () => {
    found['RouterContext'] = React.useContext(RouterContext) !== null;
    found['UrlParamContext'] = React.useContext(UrlParamContext) !== null;
    found['ToastContext'] = React.useContext(ToastContext) !== null;
    found['AbExperimentsContext'] = React.useContext(AbExperimentsContext) !== null;
    found['ThemeContext'] = React.useContext(ThemeContext) !== null;
    return (
      <div>
        <span>probe-ready</span>
        <HeaderActions>
          <span>probe-header</span>
        </HeaderActions>
      </div>
    );
  },
}));

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: { modules: [{ id: 'probe-mod', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', path: '/', label: 'Probe', view: {}, rawYaml: 'x' }] }] },
  }),
}));

const serverSource = fs.readFileSync(path.join(process.cwd(), '..', 'server', 'src', 'hostContexts.ts'), 'utf8');
const listIn = (name: string): string[] => [...(new RegExp(`${name}[^=]*= \\[([^\\]]*)\\]`).exec(serverSource)?.[1] ?? '').matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1] ?? '');

beforeEach(() => {
  window.history.pushState({}, '', '/modules/probe-mod');
});
afterEach(() => {
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('the host contexts the shell says it provides are the ones a page finds', () => {
  it('provides what PROVIDED_HOST_CONTEXTS says, and nothing of what NOT_PROVIDED_HOST_CONTEXTS says', async () => {
    render(<App />);
    await screen.findByText('probe-ready');
    const provided = listIn('PROVIDED_HOST_CONTEXTS');
    const notProvided = listIn('NOT_PROVIDED_HOST_CONTEXTS');
    expect(provided.length).toBeGreaterThan(0);
    // HeaderActionsContext has no value to read: a HeaderActions of the page must come out in the slot of the trail row.
    found['HeaderActionsContext'] = screen.queryByText('probe-header') !== null;
    for (const name of provided) {
      expect(found[name], `${name} is listed as provided but a page does not find it`).toBe(true);
    }
    for (const name of notProvided) {
      expect(found[name], `${name} is listed as not provided but a page finds it: move it to PROVIDED_HOST_CONTEXTS`).toBe(false);
    }
  });

  it('decides about every context dsl-ui names: a new one in HOST_CONTEXTS fails here until it is listed', () => {
    const decided = [...listIn('PROVIDED_HOST_CONTEXTS'), ...listIn('NOT_PROVIDED_HOST_CONTEXTS')].sort();
    expect(decided).toEqual([...HOST_CONTEXTS].sort());
  });
});
