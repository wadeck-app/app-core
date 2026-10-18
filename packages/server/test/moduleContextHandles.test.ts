import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createModuleContext, type ModuleContext } from '../src/moduleContext.js';
import { ModuleRouteRegistry } from '../src/moduleRoutes.js';

// Decision 97: ctx timers return an opaque handle that can be cleared one by one; ctx.on has an off.

describe('moduleContext timer handles and off()', () => {
  let ctx: ModuleContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createModuleContext('m', new ModuleRouteRegistry(), '/data/m');
  });

  afterEach(() => {
    ctx.dispose();
    vi.useRealTimers();
  });

  describe('setInterval / clearInterval', () => {
    it('clearInterval stops that interval only', () => {
      const a = vi.fn();
      const b = vi.fn();
      const handleA = ctx.setInterval(a, 10);
      ctx.setInterval(b, 10);
      vi.advanceTimersByTime(25);
      ctx.clearInterval(handleA);
      vi.advanceTimersByTime(20);

      expect(a).toHaveBeenCalledTimes(2);
      expect(b).toHaveBeenCalledTimes(4);
    });

    it('clearing twice is a no-op', () => {
      const fn = vi.fn();
      const handle = ctx.setInterval(fn, 10);
      ctx.clearInterval(handle);
      expect(() => ctx.clearInterval(handle)).not.toThrow();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();
    });

    it('a module that ignores the returned handle still gets its intervals cleared on dispose', () => {
      const fn = vi.fn();
      ctx.setInterval(fn, 10);
      ctx.dispose();
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();
    });

    it('is a no-op after dispose, whatever the argument', () => {
      const handle = ctx.setInterval(() => {}, 10);
      ctx.dispose();
      expect(() => ctx.clearInterval(handle)).not.toThrow();
      expect(() => ctx.clearInterval(undefined as never)).not.toThrow();
    });
  });

  describe('setTimeout / clearTimeout', () => {
    it('clearTimeout cancels a pending timeout', () => {
      const fn = vi.fn();
      const handle = ctx.setTimeout(fn, 100);
      ctx.clearTimeout(handle);
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it('a timeout that fired is dropped from tracking: clearing it is a no-op and dispose does not touch it again', () => {
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      const fn = vi.fn();
      const handle = ctx.setTimeout(fn, 10);
      vi.advanceTimersByTime(20);
      expect(fn).toHaveBeenCalledTimes(1);

      clear.mockClear();
      ctx.clearTimeout(handle);
      ctx.dispose();
      expect(clear).not.toHaveBeenCalled();
    });

    it('many fired timeouts leave nothing to clear on dispose', () => {
      const clear = vi.spyOn(globalThis, 'clearTimeout');
      for (let i = 0; i < 50; i += 1) {
        ctx.setTimeout(() => {}, 1);
      }
      vi.advanceTimersByTime(5);
      clear.mockClear();
      ctx.dispose();
      expect(clear).not.toHaveBeenCalled();
    });

    it('pending timeouts are cleared on dispose', () => {
      const fn = vi.fn();
      ctx.setTimeout(fn, 100);
      ctx.dispose();
      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it('is a no-op after dispose', () => {
      const handle = ctx.setTimeout(() => {}, 100);
      ctx.dispose();
      expect(() => ctx.clearTimeout(handle)).not.toThrow();
    });
  });

  describe('handle misuse is explicit', () => {
    it('clearInterval with a timeout handle (and the reverse) throws with the right method name', () => {
      const interval = ctx.setInterval(() => {}, 10);
      const timeout = ctx.setTimeout(() => {}, 10);
      expect(() => ctx.clearInterval(timeout)).toThrow('received a timeout handle. Use ctx.clearTimeout for it.');
      expect(() => ctx.clearTimeout(interval)).toThrow('received an interval handle. Use ctx.clearInterval for it.');
    });

    it('a value that is not a handle throws and says what to pass', () => {
      expect(() => ctx.clearInterval(undefined as never)).toThrow('needs the handle returned by ctx.setInterval, got undefined');
      expect(() => ctx.clearTimeout(42 as never)).toThrow('needs the handle returned by ctx.setTimeout, got number');
    });

    it('a handle of another module context is not an error and clears nothing in this one', () => {
      const other = createModuleContext('other', new ModuleRouteRegistry(), '/data/other');
      const fn = vi.fn();
      const foreign = other.setInterval(fn, 10);
      ctx.clearInterval(foreign);
      vi.advanceTimersByTime(25);
      expect(fn).toHaveBeenCalledTimes(2);
      other.dispose();
    });
  });

  describe('on / off', () => {
    it('off removes that listener only', () => {
      const a = vi.fn();
      const b = vi.fn();
      ctx.on('tick', a);
      ctx.on('tick', b);
      ctx.off('tick', a);
      ctx.emit('tick', 1);

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledWith(1);
    });

    it('off of an unknown event or listener, twice, or after dispose, is a no-op', () => {
      const fn = vi.fn();
      expect(() => ctx.off('never', fn)).not.toThrow();
      ctx.on('tick', fn);
      ctx.off('tick', fn);
      expect(() => ctx.off('tick', fn)).not.toThrow();
      ctx.dispose();
      expect(() => ctx.off('tick', fn)).not.toThrow();
    });

    it('a listener removed during an emit does not break the emit', () => {
      const calls: string[] = [];
      const first = (): void => {
        calls.push('first');
        ctx.off('tick', first);
      };
      ctx.on('tick', first);
      ctx.on('tick', () => calls.push('second'));
      ctx.emit('tick');
      ctx.emit('tick');

      expect(calls).toEqual(['first', 'second', 'second']);
    });
  });
});
