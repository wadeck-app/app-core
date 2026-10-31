import { describe, expect, it } from 'vitest';
import { helpText, isHelpRequest, updatePlan } from './help.js';

describe('isHelpRequest', () => {
  it('is a request for help with --help or -h anywhere, and with the word help', () => {
    expect(isHelpRequest(['update', '--help'])).toBe(true);
    expect(isHelpRequest(['dev', './mod', '--watch', '-h'])).toBe(true);
    expect(isHelpRequest(['--help'])).toBe(true);
    expect(isHelpRequest(['-h'])).toBe(true);
    expect(isHelpRequest(['help'])).toBe(true);
    expect(isHelpRequest(['help', 'dev'])).toBe(true);
  });

  it('is not one otherwise (no arguments keeps the old usage error)', () => {
    expect(isHelpRequest([])).toBe(false);
    expect(isHelpRequest(['update'])).toBe(false);
    expect(isHelpRequest(['check', './mod'])).toBe(false);
  });
});

describe('helpText', () => {
  it('gives the usage and what the command changes, for every command', () => {
    for (const command of ['validate', 'init', 'check', 'package', 'dev', 'serve', 'tray', 'version', 'update', 'self-check']) {
      const text = helpText([command, '--help']);
      expect(text, command).toMatch(new RegExp(`^app-core-cli ${command}`));
      expect(text.split('\n').filter((l) => l.trim() !== '').length, command).toBeGreaterThanOrEqual(2);
    }
  });

  it('says that update installs a release, so nobody learns it by running it', () => {
    expect(helpText(['update', '--help'])).toContain('Installs the latest published release');
  });

  it('lists the commands for the bare request, and names an unknown command', () => {
    const list = helpText(['--help']);
    expect(list).toContain('Commands:');
    expect(list).toContain('update');
    expect(list).not.toContain('tray');
    expect(helpText(['help', 'frobnicate'])).toContain('Unknown command "frobnicate".');
  });
});

describe('updatePlan', () => {
  it('says what update will do, which version it starts from, and how to read about it first', () => {
    const plan = updatePlan('@wadeck-app/app-core-cli', '2026.10.31-12-abc');
    expect(plan).toContain('@wadeck-app/app-core-cli (installed: 2026.10.31-12-abc)');
    expect(plan).toContain('npm install -g');
    expect(plan).toContain('app-core-cli update --help');
  });
});
