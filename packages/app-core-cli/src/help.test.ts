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

describe('helpText: the standalone application guide', () => {
  it('is printed by "help standalone" and by "serve --module <dir> --help", not by the general page of serve', () => {
    const guide = helpText(['help', 'standalone']);
    expect(helpText(['serve', '--module', './dist-module', '--help'])).toBe(guide);
    expect(helpText(['serve', '--help'])).not.toBe(guide);
    expect(helpText(['serve', '--help'])).toContain('app-core-cli help standalone');
  });

  it('gives the steps, every option of the case, how it is shipped and what is not covered', () => {
    const guide = helpText(['help', 'standalone']);
    for (const part of ['app-core-cli check', 'app-core-cli package', 'serve --module', '--config-dir', '--port', '--no-tray', '--no-update', 'APP_CORE_CLI_NO_UPDATE=1', 'createRequire', 'dist-module', 'slot": "nav"', 'Not covered']) {
      expect(guide, part).toContain(part);
    }
  });

  it('is listed among the guides of the bare request, without naming the internal tray command', () => {
    const list = helpText(['--help']);
    expect(list).toContain('Guides (app-core-cli help <guide>):');
    expect(list).toContain('standalone');
    expect(list).not.toContain('tray');
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
