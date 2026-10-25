import { describe, expect, it } from 'vitest';
import { devBuildRefusalMessage, isReleaseBuild } from './devBuildGuard.js';

describe('isReleaseBuild', () => {
  it('accepts the CalVer stamp CI gives a release', () => {
    expect(isReleaseBuild('2026.10.25-260-0119fde6')).toBe(true);
    expect(isReleaseBuild('2026.10.24-1042-d294afde')).toBe(true);
  });

  it('refuses every version a repository build can carry', () => {
    for (const version of ['0.0.1', '0.0.0-dev', '0.1.0', '2026.10.25', '2026.10.25-260', '2026.13.25-260-0119fde6', '2026.10.25-260-0119FDE6', '', 'undefined']) {
      expect(isReleaseBuild(version), version).toBe(false);
    }
  });
});

describe('devBuildRefusalMessage', () => {
  it('names the version and says what to run instead', () => {
    const message = devBuildRefusalMessage('app-core-cli', '0.0.1');
    expect(message).toContain('0.0.1');
    expect(message).toContain('refusing to update the global install');
    expect(message).toContain('installed `app-core-cli update`');
  });
});
