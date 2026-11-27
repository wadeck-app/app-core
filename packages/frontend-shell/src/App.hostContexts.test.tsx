import { render, screen } from '@testing-library/react';
import React from 'react';
import { HeaderActions, RouterContext, ThemeContext, UrlParamContext, type HostContext } from '@wadeck-app/dsl-ui';
import { AbExperimentsContext } from '@wadeck-app/dsl-ui/dist/components/dev/AbExperiments.js';
import { ToastContext } from '@wadeck-app/dsl-ui/dist/components/overlay/Toast.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { SHELL_HOST_CONTEXTS, providedHostContexts } from './hostContexts.js';

// What the shell tells the module builds it provides (`providedContexts` of the DSL compiler, written in build-info.json) is
// SHELL_HOST_CONTEXTS (hostContexts.ts), a record with one entry per context dsl-ui names: a new name is a compile error until decided.
// This test mounts the real shell and checks, for every one of them, that a page of a module really finds it (or really does not), so
// the record cannot drift from what App.tsx and AppLayout.tsx provide.

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

beforeEach(() => {
  window.history.pushState({}, '', '/modules/probe-mod');
});
afterEach(() => {
  window.history.pushState({}, '', '/');
  vi.restoreAllMocks();
});

describe('the host contexts the shell says it provides are the ones a page finds', () => {
  it('a page finds every context of SHELL_HOST_CONTEXTS that is true, and none that is false', async () => {
    render(<App />);
    await screen.findByText('probe-ready');
    // HeaderActionsContext has no value to read: a HeaderActions of the page must come out in the slot of the trail row.
    found['HeaderActionsContext'] = screen.queryByText('probe-header') !== null;
    const names = Object.keys(SHELL_HOST_CONTEXTS) as HostContext[];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(found[name], `${name} is declared ${SHELL_HOST_CONTEXTS[name] ? 'provided' : 'not provided'} in hostContexts.ts but a page ${found[name] === true ? 'finds' : 'does not find'} it`).toBe(SHELL_HOST_CONTEXTS[name]);
    }
  });

  it('lists in providedHostContexts() exactly the true ones, sorted', () => {
    expect(providedHostContexts()).toEqual(['AbExperimentsContext', 'HeaderActionsContext', 'RouterContext', 'ToastContext', 'UrlParamContext']);
  });
});
