// CI stamps a release as YYYY.MM.DD-BBB-xxxxxxxx (zero-padded build number, 8 hex characters of the commit). Anything else
// (0.0.1, 0.0.0-dev, a local bundle) is built from the repository. Strict on purpose: a wrong "release" lets a repo build
// run `npm install -g`, a wrong "dev" only makes an update refuse loudly.
// Same rule as the scrapers' devBuildGuard; a third copy is the moment to extract it (see docs/tray.md for the same rule).
const CALVER_RE = /^\d{4}\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])-\d{3,}-[0-9a-f]{8}$/;

export function isReleaseBuild(version: string): boolean {
  return CALVER_RE.test(version);
}

// An interrupted `npm install -g` leaves the CLI uninstalled (incident 2026-10-25): a repo build must never start one.
export function devBuildRefusalMessage(binary: string, version: string): string {
  return (
    `dev build ${version}: refusing to update the global install of ${binary}; this is a repo-built bundle, not a CalVer ` +
    `release. Run the installed \`${binary} update\` instead.`
  );
}
