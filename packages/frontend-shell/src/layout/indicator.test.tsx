import { act, render, renderHook, waitFor } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shell from './indicator.js';
import { IndicatorBadge } from './IndicatorBadge.js';
import { usePushedIndicators } from './indicatorBus.js';

// The shell keeps its own copy of the words of packages/server/src/indicator.ts (the manifest schema and the SDK use that one): the
// lists and the names must stay equal, and each side tests the same cases with explicit expectations.
describe('indicator: the words of the shell are the words of the server', () => {
  const serverSource = fs.readFileSync(path.join(process.cwd(), '..', 'server', 'src', 'indicator.ts'), 'utf8');
  const listIn = (source: string, name: string): string[] => [...(new RegExp(`${name} = \\[([^\\]]*)\\]`).exec(source)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? '');
  const constIn = (source: string, name: string): string | undefined => new RegExp(`${name} = '([^']+)'`).exec(source)?.[1];
  const shellSource = fs.readFileSync(path.join(process.cwd(), 'src', 'layout', 'indicator.ts'), 'utf8');

  it('has the same tones, icons, event and store', () => {
    expect(listIn(shellSource, 'INDICATOR_TONES')).toEqual(listIn(serverSource, 'INDICATOR_TONES'));
    expect(listIn(shellSource, 'INDICATOR_ICONS')).toEqual(listIn(serverSource, 'INDICATOR_ICONS'));
    expect(listIn(shellSource, 'INDICATOR_TONES')).toEqual([...shell.INDICATOR_TONES]);
    expect(constIn(shellSource, 'ENTRY_INDICATOR_EVENT')).toBe(constIn(serverSource, 'ENTRY_INDICATOR_EVENT'));
    expect(constIn(shellSource, 'ENTRY_INDICATORS_STORE')).toBe(constIn(serverSource, 'ENTRY_INDICATORS_STORE'));
    expect(constIn(shellSource, 'ENTRY_INDICATOR_EVENT')).toBe(shell.ENTRY_INDICATOR_EVENT);
  });

  it('judges values like the server (the server tests the same cases with the same expectations)', () => {
    expect(shell.parseIndicator({ count: -1 })).toEqual({ problem: '"count" is -1, not a whole number of 0 or more' });
    expect(shell.parseIndicator({ count: 1, tone: 'purple' })).toEqual({ problem: '"tone" is "purple"; it is one of neutral, info, success, warning, danger' });
    expect(shell.parseIndicator({ icon: 'star' })).toEqual({ problem: '"icon" is "star"; it is one of info, success, warning, error' });
    expect(shell.parseIndicator({ count: 1, color: 'red' })).toEqual({ problem: 'unknown key "color" (an indicator has count, tone, icon, label)' });
    expect(shell.parseIndicator({ tone: 'info' })).toEqual({ problem: 'an indicator needs a "count" or an "icon": there is nothing to show' });
    expect(shell.parseIndicator({ count: 3, tone: 'warning' })).toEqual({ indicator: { count: 3, tone: 'warning' } });
  });

  it('has an accessible default for every icon, and a default tone', () => {
    for (const icon of shell.INDICATOR_ICONS) {
      expect(shell.DEFAULT_ICON_LABEL[icon]).toBeTruthy();
      expect(shell.INDICATOR_TONES).toContain(shell.DEFAULT_ICON_TONE[icon]);
    }
  });

  it('has the SDK write the same event and store as the shell listens to', () => {
    const sdk = fs.readFileSync(path.join(process.cwd(), '..', 'app-core-sdk', 'src', 'indicators.ts'), 'utf8');
    expect(sdk).toContain('ENTRY_INDICATOR_EVENT');
    expect(sdk).toContain('ENTRY_INDICATORS_STORE');
  });
});

describe('readIndicator', () => {
  it('reads a number, an indicator object, at a path or in the answer itself', () => {
    expect(shell.readIndicator(7, undefined, {})).toEqual({ indicator: { count: 7 } });
    expect(shell.readIndicator({ total: 0 }, 'total', {})).toEqual({ indicator: { count: 0 } });
    expect(shell.readIndicator({ dlq: { count: 4, tone: 'danger' } }, 'dlq', {})).toEqual({ indicator: { count: 4, tone: 'danger' } });
    expect(shell.readIndicator({ icon: 'warning', label: 'Daemon down' }, undefined, {})).toEqual({ indicator: { icon: 'warning', label: 'Daemon down' } });
  });

  it('fills what the answer does not say with the defaults of the manifest, and lets the answer win', () => {
    expect(shell.readIndicator(5, undefined, { tone: 'warning', label: 'failing' })).toEqual({ indicator: { count: 5, tone: 'warning', label: 'failing' } });
    expect(shell.readIndicator({ count: 5, tone: 'danger' }, undefined, { tone: 'warning' })).toEqual({ indicator: { count: 5, tone: 'danger' } });
  });

  it('says why when there is nothing usable', () => {
    expect(shell.readIndicator({ a: {} }, 'a.b', {})).toEqual({ problem: 'the answer has no "a.b" (it stopped at "b")' });
    expect(shell.readIndicator('x', undefined, {})).toHaveProperty('problem');
    expect(shell.readIndicator({ count: 1.5 }, undefined, {})).toEqual({ problem: '"count" is 1.5, not a whole number of 0 or more' });
    expect(shell.readIndicator({}, undefined, { tone: 'info' })).toEqual({ problem: 'an indicator needs a "count" or an "icon": there is nothing to show' });
  });
});

describe('describeIndicator', () => {
  it('says the number, the label, or the default of the icon', () => {
    expect(shell.describeIndicator({ count: 3 })).toBe('3');
    expect(shell.describeIndicator({ count: 3, label: 'failures' })).toBe('3 failures');
    expect(shell.describeIndicator({ icon: 'warning' })).toBe('Warning');
    expect(shell.describeIndicator({ icon: 'error', label: 'Daemon down' })).toBe('Daemon down');
    expect(shell.describeIndicator({ icon: 'info', count: 2 })).toBe('Information (2)');
  });
});

describe('IndicatorBadge', () => {
  it('shows a number, 0 included, read after the label, and nothing without an indicator', () => {
    const { container, rerender } = render(<IndicatorBadge indicator={{ count: 0 }} />);
    expect(container.textContent).toBe(', 0');
    rerender(<IndicatorBadge indicator={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['info', 'bg-info-bg text-info-text'],
    ['success', 'bg-success-bg text-success-text'],
    ['warning', 'bg-warning-bg text-warning-text'],
    ['danger', 'bg-danger-bg text-danger-text'],
    ['neutral', 'bg-muted-bg text-muted'],
  ] as const)('colors a number in the %s tone with theme tokens only', (tone, classes) => {
    const { container } = render(<IndicatorBadge indicator={{ count: 4, tone }} />);
    for (const cls of classes.split(' ')) {
      expect(container.firstElementChild?.className).toContain(cls);
    }
    // No fixed color: only tokens of the theme.
    expect(container.firstElementChild?.className).not.toMatch(/(blue|red|green|orange|yellow)-\d|#[0-9a-f]{3,6}/i);
  });

  it('keeps the accent out of a neutral pill on the current entry: a surface and a hairline', () => {
    const { container } = render(<IndicatorBadge indicator={{ count: 2 }} current />);
    const cls = container.firstElementChild?.className ?? '';
    expect(cls).toContain('bg-surface');
    expect(cls).toContain('ring-border');
    expect(cls).not.toContain('primary');
  });

  it('replaces the number with an icon, in the tone of the icon, with its text for assistive technology', () => {
    const { container } = render(<IndicatorBadge indicator={{ icon: 'warning', count: 3 }} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe(', Warning (3)');
    expect(container.firstElementChild?.className).toContain('text-warning-text');
    expect(container.firstElementChild?.getAttribute('title')).toBe('Warning (3)');
  });

  it('takes the tone it is given over the one of the icon, and the label it is given over the default', () => {
    const { container } = render(<IndicatorBadge indicator={{ icon: 'info', tone: 'danger', label: 'Daemon down' }} />);
    expect(container.firstElementChild?.className).toContain('text-danger');
    expect(container.textContent).toBe(', Daemon down');
  });

  it('draws the four icons differently', () => {
    const markup = (icon: shell.IndicatorIcon) => render(<IndicatorBadge indicator={{ icon }} />).container.querySelector('svg')?.innerHTML;
    expect(new Set(shell.INDICATOR_ICONS.map(markup)).size).toBe(4);
  });
});

describe('usePushedIndicators', () => {
  const push = (id: unknown, indicator: unknown) => window.dispatchEvent(new CustomEvent(shell.ENTRY_INDICATOR_EVENT, { detail: { id, indicator } }));
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
    Reflect.deleteProperty(globalThis, shell.ENTRY_INDICATORS_STORE);
  });

  it('holds what a component sets, by entry id, replaces it, and clears it with null', async () => {
    const { result } = renderHook(() => usePushedIndicators());
    expect(result.current).toEqual({});
    act(() => push('task/tasks', { count: 3, tone: 'warning' }));
    expect(result.current).toEqual({ 'task/tasks': { count: 3, tone: 'warning' } });
    act(() => push('task/tasks', { icon: 'error' }));
    expect(result.current['task/tasks']).toEqual({ icon: 'error' });
    act(() => push('task/tasks', null));
    await waitFor(() => expect(result.current).toEqual({}));
  });

  it('starts with what was set before the shell listened', () => {
    Reflect.set(globalThis, shell.ENTRY_INDICATORS_STORE, new Map<string, unknown>([['flow/executions', { count: 2 }], ['flow/gone', null]]));
    const { result } = renderHook(() => usePushedIndicators());
    expect(result.current).toEqual({ 'flow/executions': { count: 2 } });
  });

  it('refuses a wrong value or an event without an id, says why once, and keeps what it had', () => {
    const { result } = renderHook(() => usePushedIndicators());
    act(() => push('a/b', { count: 1 }));
    act(() => push('a/b', { count: -5 }));
    act(() => push('a/b', { count: -5 }));
    act(() => push('', { count: 1 }));
    expect(result.current).toEqual({});
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('the indicator set for the entry "a/b" is refused: "count" is -5'),
      expect.stringContaining('without an entry id'),
    ]);
  });

  it('stops listening when unmounted', () => {
    const { result, unmount } = renderHook(() => usePushedIndicators());
    unmount();
    act(() => push('a/b', { count: 1 }));
    expect(result.current).toEqual({});
  });
});
