import * as fs from 'node:fs';
import * as path from 'node:path';
import semver from 'semver';
import { DSL_LIB_DIR, type Manifest } from './manifest.js';

export interface DslLibUrls {
  entryUrl: string;
  cssUrl?: string;
}

// Packages the shell provides as singletons to module bundles (globalThis.__APP_CORE_SHARED__),
// mapped to the build-info.json field recording the version the shell was built with.
const SHARED_PACKAGES: Record<string, string> = {
  react: 'react',
  'react-dom': 'reactDom',
  'react-router-dom': 'reactRouterDom',
  '@wadeck-app/dsl-ui': 'dslUi',
  '@wadeck-app/dsl-renderer': 'dslRenderer',
};

export type SharedVersions = Record<string, string>;

// The module declares `dslLib.shared` ranges the app-core shell cannot honour (unknown package, invalid range, or a version the
// shell does not satisfy). The request was fine: the module has to be rebuilt, or app-core updated.
export class SharedVersionError extends Error {
  readonly code = 'shared-version-mismatch';
  constructor(message: string) {
    super(message);
    this.name = 'SharedVersionError';
  }
}

export function sharedVersionsFromBuildInfo(info: unknown): SharedVersions {
  if (typeof info !== 'object' || info === null) {
    return {};
  }
  const fields = new Map<string, unknown>(Object.entries(info));
  const versions: SharedVersions = {};
  for (const [pkg, field] of Object.entries(SHARED_PACKAGES)) {
    const value = fields.get(field);
    if (typeof value === 'string') {
      versions[pkg] = value;
    }
  }
  return versions;
}

export interface SharedCheckResult {
  // Package names whose version could not be compared (build-info.json lacks them).
  unverified: string[];
}

// Throws an actionable Error when a declared range is invalid, names a package the shell does not
// share, or is not satisfied by the version the shell was built with. `versions` undefined means
// build-info.json was unavailable: nothing can be compared and every declared package is unverified.
// `origin` says where the versions come from (which file, built when); it ends up in the message so the one who reads it
// can tell a shell that really is older from a build-info.json that is stale.
export function checkSharedRanges(shared: Record<string, string>, versions: SharedVersions | undefined, origin?: string): SharedCheckResult {
  const unverified: string[] = [];
  for (const [pkg, range] of Object.entries(shared)) {
    if (!(pkg in SHARED_PACKAGES)) {
      throw new SharedVersionError(
        `dslLib.shared["${pkg}"] is not provided by the app-core shell. Shared packages: ${Object.keys(SHARED_PACKAGES).join(', ')}.`,
      );
    }
    if (semver.validRange(range) === null) {
      throw new SharedVersionError(`dslLib.shared["${pkg}"] has an invalid version range "${range}".`);
    }
    const provided = versions?.[pkg];
    if (provided === undefined) {
      unverified.push(pkg);
      continue;
    }
    if (!semver.satisfies(provided, range, { includePrerelease: true })) {
      throw new SharedVersionError(
        `the module's components were built for ${pkg} "${range}" but the app-core shell provides ${provided}${origin === undefined ? '' : ` (${origin})`}. Rebuild the module's dsl-lib against that version, or update app-core.`,
      );
    }
  }
  return { unverified };
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function libDirOf(manifestDir: string): string {
  const libDir = path.resolve(manifestDir, DSL_LIB_DIR);
  if (!fs.existsSync(libDir)) {
    throw new Error(`the manifest declares dslLib but the folder ${libDir} does not exist.`);
  }
  return fs.realpathSync(libDir);
}

function describeLibFile(moduleId: string, version: string, libDir: string, declared: string, field: string, manifestDir: string): string {
  const resolved = path.resolve(manifestDir, declared);
  let real: string;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    throw new Error(`dslLib.${field} "${declared}" does not exist (looked for ${resolved}).`);
  }
  if (!isInside(libDir, real)) {
    throw new Error(`dslLib.${field} "${declared}" resolves outside ${DSL_LIB_DIR}/.`);
  }
  const { mtimeMs, size } = fs.statSync(real);
  const relative = path.relative(libDir, real).split(path.sep).map(encodeURIComponent).join('/');
  return `/api/modules/${moduleId}/_lib/${relative}?v=${encodeURIComponent(version)}-${mtimeMs}-${size}`;
}

// Validates the files declared by manifest.dslLib and returns their cache-busted URLs.
export function resolveDslLib(moduleId: string, manifest: Manifest, manifestDir: string): DslLibUrls | undefined {
  if (manifest.dslLib === undefined) {
    return undefined;
  }
  const libDir = libDirOf(manifestDir);
  const urls: DslLibUrls = {
    entryUrl: describeLibFile(moduleId, manifest.version, libDir, manifest.dslLib.entry, 'entry', manifestDir),
  };
  if (manifest.dslLib.css !== undefined) {
    urls.cssUrl = describeLibFile(moduleId, manifest.version, libDir, manifest.dslLib.css, 'css', manifestDir);
  }
  return urls;
}

// Maps a request path (already URL-decoded by the router) to a real file strictly inside the
// module's dsl-lib/ folder, or undefined when it is missing or tries to leave it.
export function resolveLibRequest(manifestDir: string, requested: string): string | undefined {
  if (requested === '' || requested.includes('\0') || requested.includes('\\') || path.isAbsolute(requested)) {
    return undefined;
  }
  if (requested.split('/').includes('..')) {
    return undefined;
  }
  let libDir: string;
  try {
    libDir = libDirOf(manifestDir);
  } catch {
    return undefined;
  }
  let real: string;
  try {
    real = fs.realpathSync(path.resolve(libDir, requested));
  } catch {
    return undefined;
  }
  if (!isInside(libDir, real) || !fs.statSync(real).isFile()) {
    return undefined;
  }
  return real;
}

const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
};

export function libContentType(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}
