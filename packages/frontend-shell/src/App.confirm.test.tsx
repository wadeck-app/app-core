import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { useConfirm } from '@wadeck-app/dsl-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

// The question of an action's `confirm` (`$actions.<name>.confirm`) is asked by the shell with a dsl-ui dialog that follows the theme, not by
// the browser's native `window.confirm`. The page of the test is a probe that asks like the view runner does.
const answers: boolean[] = [];
vi.mock('./ModuleView.js', () => ({
  ModuleView: () => {
    const confirm = useConfirm();
    return (
      <button type="button" onClick={() => void Promise.resolve(confirm('Delete the thing?')).then((answer) => answers.push(answer))}>
        ask
      </button>
    );
  },
}));

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: { modules: [{ id: 'probe-mod', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', path: '/', label: 'Probe', view: {}, rawYaml: 'x' }] }] },
  }),
}));

let nativeConfirm: ReturnType<typeof vi.fn>;
beforeEach(() => {
  answers.length = 0;
  nativeConfirm = vi.fn(() => true);
  vi.stubGlobal('confirm', nativeConfirm);
  window.history.pushState({}, '', '/modules/probe-mod');
});
afterEach(() => {
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('the confirmation of an action', () => {
  it('is asked in a dialog of the shell with the question of the action, never with the native confirm', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'ask' }));
    expect(await screen.findByText('Delete the thing?')).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('answers yes when the user confirms, and no when the user cancels', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'ask' }));
    await screen.findByText('Delete the thing?');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(answers).toEqual([true]));

    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('Delete the thing?');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    await vi.waitFor(() => expect(answers).toEqual([true, false]));
  });
});
