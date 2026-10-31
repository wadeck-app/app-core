import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AbExperiments, useRegisterAbTests } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbTestsSeenRecorder, noteSeen, readSeen, SEEN_KEY } from './abTestsSeen.js';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('noteSeen', () => {
  it('records the address of a test, most recent first, and keeps five at most', () => {
    let seen = {};
    for (let i = 1; i <= 7; i++) {
      seen = noteSeen(seen, [{ id: 't', label: 'T' }], `/p${i}`) ?? seen;
    }
    expect((seen as Record<string, { paths: string[] }>)['t']?.paths).toEqual(['/p7', '/p6', '/p5', '/p4', '/p3']);
  });

  it('moves an address already known to the front and returns nothing when nothing changed', () => {
    const first = noteSeen({}, [{ id: 't', label: 'T' }], '/a')!;
    const second = noteSeen(first, [{ id: 't', label: 'T' }], '/b')!;
    expect(noteSeen(second, [{ id: 't', label: 'T' }], '/b')).toBeUndefined();
    expect(noteSeen(second, [{ id: 't', label: 'T' }], '/a')?.['t']?.paths).toEqual(['/a', '/b']);
  });
});

describe('readSeen', () => {
  it('reads what was kept', () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ t: { label: 'T', paths: ['/a'] } }));
    expect(readSeen()).toEqual({ t: { label: 'T', paths: ['/a'] } });
  });

  it('says what is wrong with a value that is not usable, and starts again from nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.setItem(SEEN_KEY, '{nope');
    expect(readSeen()).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"${SEEN_KEY}" in localStorage is not usable`));
    window.localStorage.setItem(SEEN_KEY, '[]');
    expect(readSeen()).toEqual({});
  });

  it('drops an entry that is not a test', () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ ok: { label: 'L', paths: [] }, bad: 3, worse: { label: 1 } }));
    expect(Object.keys(readSeen())).toEqual(['ok']);
  });
});

// A component that registers one test with the dock, like a module view does.
function OneTest(): null {
  useRegisterAbTests([{ id: 'dock-test', label: 'Dock test', summary: 's', options: [{ id: 'a', label: 'A', title: 'a' }], value: 'a', onSelect: () => undefined }]);
  return null;
}

describe('AbTestsSeenRecorder', () => {
  it('notes the address of the page where the dock shows a test, when the dock is on', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/modules/flow/executions/42/logs']}>
          <AbExperiments enabled>
            <AbTestsSeenRecorder />
            <OneTest />
          </AbExperiments>
        </MemoryRouter>,
      );
    });
    expect(readSeen()).toEqual({ 'dock-test': { label: 'Dock test', paths: ['/modules/flow/executions/42/logs'] } });
  });

  it('notes nothing when the dock is off', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/x']}>
          <AbExperiments enabled={false}>
            <AbTestsSeenRecorder />
            <OneTest />
          </AbExperiments>
        </MemoryRouter>,
      );
    });
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull();
  });
});
