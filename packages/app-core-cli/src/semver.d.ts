// Only what this package uses of semver (no @types/semver in the repository; the server declares its own subset the same way).
declare module 'semver' {
  const semver: {
    valid(version: string): string | null;
    validRange(range: string): string | null;
    satisfies(version: string, range: string, options?: { includePrerelease?: boolean }): boolean;
  };
  export default semver;
}
