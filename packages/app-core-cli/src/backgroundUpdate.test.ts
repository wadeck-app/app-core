import { describe, expect, it } from 'vitest';
import { wantsBackgroundUpdate } from './backgroundUpdate.js';

describe('wantsBackgroundUpdate', () => {
  it('is wanted for an ordinary command', () => {
    expect(wantsBackgroundUpdate('serve', [], {})).toBe(true);
    expect(wantsBackgroundUpdate('check', ['./mod'], {})).toBe(true);
  });

  it('is not wanted for update: the explicit update would lose the updater lock to the background check of the same command', () => {
    expect(wantsBackgroundUpdate('update', [], {})).toBe(false);
  });

  it('is not wanted for self-check, with --no-update, nor with APP_CORE_CLI_NO_UPDATE=1', () => {
    expect(wantsBackgroundUpdate('self-check', [], {})).toBe(false);
    expect(wantsBackgroundUpdate('serve', ['--no-update'], {})).toBe(false);
    expect(wantsBackgroundUpdate('serve', [], { APP_CORE_CLI_NO_UPDATE: '1' })).toBe(false);
  });
});
