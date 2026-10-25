import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

const settings = vi.hoisted(() => ({ abTests: false }));
vi.mock('./useShellSettings.js', () => ({ useShellSettings: () => settings }));

const abTestView = [
  '$type: AbTest',
  'id: demo',
  'label: Demo test',
  'initial: one',
  'variants:',
  '  one: { label: One, hint: First., view: { $type: Badge, label: variant-one } }',
  '  two: { label: Two, hint: Second., view: { $type: Badge, label: variant-two } }',
  '',
].join('\n');

vi.mock('./useModules.js', () => ({
  useModules: () => ({
    error: undefined,
    data: { modules: [{ id: 'module-ab', version: '1.0.0', extensionPoints: [{ kind: 'page', slot: 'nav', label: 'AB', view: {}, rawYaml: abTestView }] }] },
  }),
}));

// Tests run with NODE_ENV=test, which is not development: the dock is hidden unless `serve --ab-tests` turned it on.
describe('App (A/B test dock outside development)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/modules/module-ab/0');
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('hides the dock and shows the reference variant by default', () => {
    settings.abTests = false;
    render(<App />);
    expect(screen.getByText('variant-one')).toBeInTheDocument();
    expect(screen.queryByTestId('ab-dock')).not.toBeInTheDocument();
  });

  it('shows the dock with the test when the server was started with --ab-tests', () => {
    settings.abTests = true;
    render(<App />);
    expect(screen.getByTestId('ab-dock')).toBeInTheDocument();
    expect(screen.getByText('Demo test')).toBeInTheDocument();
  });
});
