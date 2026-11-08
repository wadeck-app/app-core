import { describe, expect, it } from 'vitest';
import { parseIndicator } from '../src/indicator.js';

describe('parseIndicator', () => {
  it('accepts a number with a tone, an icon with a label, and both', () => {
    expect(parseIndicator({ count: 3, tone: 'warning' })).toEqual({ indicator: { count: 3, tone: 'warning' } });
    expect(parseIndicator({ icon: 'error', label: 'Daemon down' })).toEqual({ indicator: { icon: 'error', label: 'Daemon down' } });
    expect(parseIndicator({ count: 0, icon: 'info' })).toEqual({ indicator: { count: 0, icon: 'info' } });
  });

  it('refuses what is not an object, naming what it got', () => {
    for (const bad of [3, 'x', null, [1], undefined]) {
      expect(parseIndicator(bad), String(bad)).toHaveProperty('problem');
    }
  });

  it('refuses a count that is not a whole number of 0 or more, a tone or an icon outside the lists, a blank label', () => {
    expect(parseIndicator({ count: -1 })).toEqual({ problem: '"count" is -1, not a whole number of 0 or more' });
    expect(parseIndicator({ count: 1.5 })).toHaveProperty('problem');
    expect(parseIndicator({ count: '3' })).toHaveProperty('problem');
    expect(parseIndicator({ count: 1, tone: 'purple' })).toEqual({ problem: '"tone" is "purple"; it is one of neutral, info, success, warning, danger' });
    expect(parseIndicator({ icon: 'star' })).toEqual({ problem: '"icon" is "star"; it is one of info, success, warning, error' });
    expect(parseIndicator({ count: 1, label: '  ' })).toHaveProperty('problem');
  });

  it('refuses an unknown key rather than ignoring it, and an indicator with nothing to show', () => {
    expect(parseIndicator({ count: 1, color: 'red' })).toEqual({ problem: 'unknown key "color" (an indicator has count, tone, icon, label)' });
    expect(parseIndicator({ tone: 'info' })).toEqual({ problem: 'an indicator needs a "count" or an "icon": there is nothing to show' });
  });
});
