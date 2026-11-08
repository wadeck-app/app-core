import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTRY_HIDDEN_STORE, ENTRY_INDICATORS_STORE } from '@wadeck-app/app-core-server/indicator';
import { setEntryHidden, setEntryIndicator } from './indicators.js';

// A page component runs in a browser; here a window made of an event target is enough to see what it sends.
describe('setEntryIndicator', () => {
  let target: EventTarget;
  const heard: Array<{ id: string; indicator: unknown }> = [];

  beforeEach(() => {
    target = new EventTarget();
    heard.length = 0;
    target.addEventListener('app-core:entry-indicator', (event) => heard.push((event as CustomEvent).detail));
    vi.stubGlobal('window', Object.assign(target, { dispatchEvent: target.dispatchEvent.bind(target) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, ENTRY_INDICATORS_STORE);
  });

  it('tells the shell which entry has which indicator, and keeps the last state for a shell that listens later', () => {
    setEntryIndicator('task/tasks', { count: 3, tone: 'warning' });
    expect(heard).toEqual([{ id: 'task/tasks', indicator: { count: 3, tone: 'warning' } }]);
    const store: unknown = Reflect.get(globalThis, ENTRY_INDICATORS_STORE);
    expect(store).toBeInstanceOf(Map);
    expect((store as Map<string, unknown>).get('task/tasks')).toEqual({ count: 3, tone: 'warning' });
  });

  it('clears an entry with null, in the event and in the store', () => {
    setEntryIndicator('task/tasks', { count: 3 });
    setEntryIndicator('task/tasks', null);
    expect(heard.at(-1)).toEqual({ id: 'task/tasks', indicator: null });
    const store: unknown = Reflect.get(globalThis, ENTRY_INDICATORS_STORE);
    expect((store as Map<string, unknown>).get('task/tasks')).toBeNull();
  });

  it('throws in the component that gives a wrong value, saying what is wrong and for which entry, and sends nothing', () => {
    expect(() => setEntryIndicator('task/tasks', { count: -2 })).toThrow('setEntryIndicator("task/tasks"): "count" is -2, not a whole number of 0 or more.');
    expect(() => setEntryIndicator('task/tasks', { count: 1, tone: 'blue' as never })).toThrow('"tone" is "blue"');
    expect(() => setEntryIndicator('task/tasks', { tone: 'info' })).toThrow('nothing to show');
    expect(heard).toEqual([]);
  });

  it('refuses an empty entry id and says what an id looks like', () => {
    expect(() => setEntryIndicator(' ', { count: 1 })).toThrow('"<moduleId><path>", for example "queue/dlq"');
  });
});

describe('setEntryHidden', () => {
  const heard: Array<{ id: string; hidden: boolean }> = [];
  beforeEach(() => {
    heard.length = 0;
    const target = new EventTarget();
    target.addEventListener('app-core:entry-hidden', (event) => heard.push((event as CustomEvent).detail));
    vi.stubGlobal('window', Object.assign(target, { dispatchEvent: target.dispatchEvent.bind(target) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, ENTRY_HIDDEN_STORE);
  });

  it('tells the shell which tab is hidden, keeps the set for a shell that listens later, and shows the tab again', () => {
    setEntryHidden('user/users/:id/preferences', true);
    expect(heard).toEqual([{ id: 'user/users/:id/preferences', hidden: true }]);
    expect([...(Reflect.get(globalThis, ENTRY_HIDDEN_STORE) as Set<string>)]).toEqual(['user/users/:id/preferences']);
    setEntryHidden('user/users/:id/preferences', false);
    expect([...(Reflect.get(globalThis, ENTRY_HIDDEN_STORE) as Set<string>)]).toEqual([]);
    expect(heard.at(-1)).toEqual({ id: 'user/users/:id/preferences', hidden: false });
  });

  it('refuses an empty id and says what an id looks like', () => {
    expect(() => setEntryHidden('', true)).toThrow('"<moduleId><path>", for example "user/users/p/:id/preferences"');
  });
});
