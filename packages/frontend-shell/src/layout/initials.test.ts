import { describe, expect, it } from 'vitest';
import { colorFromId, initialsOf } from './initials.js';

describe('initialsOf', () => {
  it('uses the first two letters of a single word, and the first letter of the first two words otherwise', () => {
    expect(initialsOf('Queue')).toBe('QU');
    expect(initialsOf('Orchestrator')).toBe('OR');
    expect(initialsOf('Audit log')).toBe('AL');
    expect(initialsOf('Payment methods and more')).toBe('PM');
  });

  it('splits on "-" and "_" too', () => {
    expect(initialsOf('audit-log')).toBe('AL');
    expect(initialsOf('audit_log')).toBe('AL');
  });

  it('upper-cases', () => {
    expect(initialsOf('queue')).toBe('QU');
  });

  it('copes with a one-letter name, extra separators and an empty name', () => {
    expect(initialsOf('X')).toBe('X');
    expect(initialsOf('  --a  b--')).toBe('AB');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('---')).toBe('?');
  });
});

describe('colorFromId', () => {
  const NINE = ['#e11d48', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3'];

  it('is stable: the same id always gets the same entry', () => {
    expect(colorFromId('queue', NINE)).toBe(colorFromId('queue', NINE));
  });

  it('always returns an entry of the palette', () => {
    for (const id of ['', 'a', 'queue', 'orchestrator', 'audit-log', 'x'.repeat(200)]) expect(NINE).toContain(colorFromId(id, NINE));
  });

  it('spreads short ids over several entries (a plain hash * 31 sent half of them to one)', () => {
    const ids = ['queue', 'orchestrator', 'billing', 'inventory', 'reports', 'audit-log', 'settings'];
    expect(new Set(ids.map((id) => colorFromId(id, NINE))).size).toBeGreaterThan(3);
  });

  it('gives the two first real modules different entries', () => {
    expect(colorFromId('queue', NINE)).not.toBe(colorFromId('orchestrator', NINE));
  });

  it('follows the palette it is given', () => {
    expect(colorFromId('queue', ['only'])).toBe('only');
    expect(['a', 'b']).toContain(colorFromId('queue', ['a', 'b']));
  });

  it('fails loudly on an empty palette instead of returning undefined', () => {
    expect(() => colorFromId('queue', [])).toThrow(/non-empty palette/);
  });
});
