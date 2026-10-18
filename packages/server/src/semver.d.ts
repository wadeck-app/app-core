declare module 'semver' {
  interface SatisfiesOptions {
    includePrerelease?: boolean;
  }
  const semver: {
    satisfies(version: string, range: string, options?: SatisfiesOptions): boolean;
    validRange(range: string): string | null;
    valid(version: string): string | null;
  };
  export default semver;
}
