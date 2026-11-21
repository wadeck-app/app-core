import { describe, expect, it } from 'vitest';
import { submitBlockedReason } from './PinField.js';

describe('submitBlockedReason', () => {
  const base = { busy: false, locked: false, remaining: 0, filled: true, fieldsHint: 'Fill the three fields' };

  it('is empty when the button can be used', () => {
    expect(submitBlockedReason(base)).toBeUndefined();
  });

  it('says how long to wait during a lock, before anything about the fields', () => {
    expect(submitBlockedReason({ ...base, locked: true, remaining: 42, filled: false })).toBe('Wait 42 s');
  });

  it('says what is missing', () => {
    expect(submitBlockedReason({ ...base, filled: false })).toBe('Fill the three fields');
  });

  it('says nothing while it asks the server (the button shows a spinner instead)', () => {
    expect(submitBlockedReason({ ...base, busy: true, filled: false })).toBeUndefined();
  });
});
