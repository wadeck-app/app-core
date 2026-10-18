import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import type { ProviderInfo, ProviderLookup } from '@wadeck-app/app-core-server/contributions';
import type { Manifest } from '@wadeck-app/app-core-sdk';
import { OUTPUT_DIR } from './outputDir.js';
import { validateManifestFile } from './validate.js';

// Package name -> the folder of that package, used instead of looking the package up in node_modules.
// For layouts where the dependency is not installed (a monorepo that does not link it, the repository's
// own fixtures): the folder holds the dependency's dist-module.
export type Links = Record<string, string>;

export const LINK_USAGE = '--link <package>=<folder>';

// `<package>=<folder>`; the package name may contain "/" and "@", the folder is resolved from the cwd.
export function parseLinkValue(value: string | undefined): [string, string] {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`--link needs a value: ${LINK_USAGE}, e.g. --link @acme/provider=../provider.`);
  }
  const eq = value.indexOf('=');
  if (eq <= 0 || eq === value.length - 1) {
    throw new Error(`--link "${value}" is not of the form ${LINK_USAGE}, e.g. --link @acme/provider=../provider.`);
  }
  return [value.slice(0, eq), path.resolve(value.slice(eq + 1))];
}

// Parses a list made only of `--link <package>=<folder>` options (the arguments of `check`).
export function parseLinkArgs(args: string[]): Links {
  const links: Links = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] !== '--link') {
      throw new Error(`Unknown option "${args[i]}". Usage: app-core-cli check <module-dir> [${LINK_USAGE}]...`);
    }
    const [name, folder] = parseLinkValue(args[i + 1]);
    links[name] = folder;
  }
  return links;
}

function findInNodeModules(fromDir: string, name: string): string | undefined {
  for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (path.dirname(dir) === dir) {
      return undefined;
    }
  }
}

function dependencyNames(moduleDir: string): { names: string[] } | { missing: string } {
  const file = path.join(moduleDir, 'package.json');
  if (!fs.existsSync(file)) {
    return { missing: 'the module has no package.json, so the package that provides it cannot be located' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { missing: `package.json is unreadable (${getErrorMessage(err)})` };
  }
  const record: { dependencies?: unknown; devDependencies?: unknown; peerDependencies?: unknown } =
    typeof parsed === 'object' && parsed !== null ? parsed : {};
  const names = [record.dependencies, record.devDependencies, record.peerDependencies].flatMap((value) =>
    typeof value === 'object' && value !== null ? Object.keys(value) : [],
  );
  return { names: [...new Set(names)] };
}

export interface LocatedProvider {
  // The dependency package name that provides the module.
  packageName: string;
  // The package folder (holds dist-module and package.json).
  root: string;
  manifestPath: string;
  manifest: Manifest;
  via: 'link' | 'node_modules';
}

export type ProviderLocation =
  | { found: true; located: LocatedProvider }
  // sourceRoot: a dependency whose source module declares the id but has no dist-module (not built yet).
  | { found: false; why: string; fix: string; sourceRoot?: string };

// The id of a SOURCE module (manifest.json and src/ at the root), undefined for anything else.
function sourceModuleId(root: string): string | undefined {
  const file = path.join(root, 'manifest.json');
  if (!fs.existsSync(file) || !fs.existsSync(path.join(root, 'src'))) {
    return undefined;
  }
  try {
    const id = (JSON.parse(fs.readFileSync(file, 'utf8')) as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    // An unreadable manifest only means this is not recognised as a source module; the caller reports "not built".
    return undefined;
  }
}

// Finds the packaged module with manifest id `providerId` among the dependencies of the module in `moduleDir`:
// each dependency's dist-module/manifest.json is read (from `links`, else from node_modules) and its "id" matched.
export function locateProvider(moduleDir: string, providerId: string, links: Links): ProviderLocation {
  const fix =
    `Add the package that provides module "${providerId}" to "dependencies" in package.json, install it, and make sure it is built ` +
    `(its ${OUTPUT_DIR}/manifest.json must exist). If it is not installed in this layout, pass ${LINK_USAGE} to point at its folder.`;
  const dependencies = dependencyNames(moduleDir);
  if ('missing' in dependencies) {
    return { found: false, why: `${dependencies.missing} (module "${providerId}")`, fix };
  }

  const notes: string[] = [];
  let sourceRoot: string | undefined;
  for (const name of dependencies.names) {
    const linked = links[name];
    const root = linked ?? findInNodeModules(moduleDir, name);
    if (root === undefined) {
      notes.push(`${name} (not installed)`);
      continue;
    }
    const manifestPath = path.join(root, OUTPUT_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      notes.push(`${name} (no ${OUTPUT_DIR}/manifest.json in ${root}: not a module, or not built)`);
      if (sourceModuleId(root) === providerId) {
        sourceRoot = root;
      }
      continue;
    }
    const validated = validateManifestFile(manifestPath);
    if (!validated.ok) {
      notes.push(`${name} (${manifestPath} is invalid: ${validated.reason.split('\n')[0]})`);
      continue;
    }
    if (validated.manifest.id === providerId) {
      return {
        found: true,
        located: { packageName: name, root, manifestPath, manifest: validated.manifest, via: linked === undefined ? 'node_modules' : 'link' },
      };
    }
    notes.push(`${name} (module "${validated.manifest.id}")`);
  }
  const looked = notes.length === 0 ? 'package.json lists no dependency' : `looked at the dependencies ${notes.join(', ')}`;
  return { found: false, why: `no dependency provides module "${providerId}" (${looked})`, fix, sourceRoot };
}

export function findProvider(moduleDir: string, providerId: string, links: Links): ProviderLookup {
  const location = locateProvider(moduleDir, providerId, links);
  if (!location.found) {
    return { found: false, why: location.why, fix: location.fix };
  }
  const { manifest } = location.located;
  const provider: ProviderInfo = { version: manifest.version, expose: manifest.expose };
  return { found: true, provider };
}
