import * as fs from 'node:fs';
import * as path from 'node:path';
import { build, type BuildFailure } from 'esbuild';
import { load as parseYaml } from 'js-yaml';
import semver from 'semver';
import type { Manifest, SourceManifest } from '@wadeck-app/app-core-sdk';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { appCoreShared } from './appCoreShared.js';
import { BACKEND_ENTRY, checkModule, DSL_COMPONENTS_ENTRY, formatCheckIssues, OUTPUT_DIR, TYPES_OUTPUT } from './check.js';
import { ignoredChildrenWarnings } from './childKeys.js';
import { LINK_USAGE, parseLinkValue, type Links } from './providers.js';
import { validateManifestFile } from './validate.js';

export interface PackageOptions {
  moduleDir: string;
  outDir: string;
  version: string;
  // Package name -> folder, for provider modules that are not installed in node_modules (see providers.ts).
  links?: Links;
}

export interface PackageResult {
  outDir: string;
  manifestPath: string;
  // Non-fatal findings (e.g. unreferenced views); the caller prints them on stderr.
  warnings: string[];
}

export const DEFAULT_OUT_DIR = OUTPUT_DIR;
const BACKEND_OUTPUT = 'api-backend/backend.cjs';
const HOOKS = ['teardown', 'migrate'] as const;
const VIEWS_OUTPUT_DIR = 'dsl-frontend';
const VIEWS_SOURCE_DIR = 'src/dsl-views';
const DSL_LIB_OUTPUT_DIR = 'dsl-lib';
const DSL_LIB_ENTRY_OUTPUT = `${DSL_LIB_OUTPUT_DIR}/entries.mjs`;
const DSL_LIB_CSS_OUTPUT = `${DSL_LIB_OUTPUT_DIR}/style.css`;
const DSL_LIB_CSS_SOURCE = 'src/dsl-components/style.css';

// `--out <dir>`, `--version <v>` and `--link <package>=<folder>` (repeatable); anything else is an error
// (no silently ignored typo).
export function parsePackageArgs(args: string[]): { out: string | undefined; version: string | undefined; links?: Links } {
  const parsed: { out: string | undefined; version: string | undefined; links?: Links } = { out: undefined, version: undefined };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (flag === '--link') {
      const [name, folder] = parseLinkValue(args[i + 1]);
      parsed.links = { ...parsed.links, [name]: folder };
      continue;
    }
    if (flag !== '--out' && flag !== '--version') {
      throw new Error(`Unknown option "${flag}". Usage: app-core-cli package <module-dir> [--out <dir>] [--version <v>] [${LINK_USAGE}]...`);
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} needs a value, e.g. "app-core-cli package ./my-module ${flag} ${flag === '--out' ? 'dist-module' : '1.2.3'}".`);
    }
    parsed[flag === '--out' ? 'out' : 'version'] = value;
  }
  return parsed;
}

// The version has no default: a package stamped with a made-up version would be indistinguishable from a real one.
export function resolveVersion(flag: string | undefined, env: Record<string, string | undefined>): string {
  if (flag !== undefined) {
    if (flag.trim() === '') {
      throw new Error('--version needs a non-empty value, e.g. --version 1.2.3.');
    }
    return flag;
  }
  const fromEnv = env['BUNDLE_VERSION'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return fromEnv;
  }
  throw new Error('No version to stamp into the manifest: pass --version <v> or set the BUNDLE_VERSION environment variable.');
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// The output folder is deleted before every run, so it must never be the module, inside src or above the module.
function assertSafeOutDir(moduleDir: string, outDir: string): void {
  const srcDir = path.join(moduleDir, 'src');
  const tooRisky = outDir === moduleDir || isInside(outDir, moduleDir) || outDir === srcDir || isInside(srcDir, outDir);
  if (tooRisky) {
    throw new Error(
      `The output folder ${outDir} is not allowed: it is cleaned before packaging, so it must not be the module folder, contain it, or be inside src/. Use a folder such as ${path.join(moduleDir, DEFAULT_OUT_DIR)}.`,
    );
  }
}

function describeBuildFailure(what: string, err: unknown): Error {
  const failure = err as Partial<BuildFailure>;
  if (!Array.isArray(failure.errors) || failure.errors.length === 0) {
    return new Error(`${what} failed: ${getErrorMessage(err)}`);
  }
  const lines = failure.errors.map((e) => {
    const where = e.location === null || e.location === undefined ? '' : `${e.location.file}:${e.location.line}:${e.location.column}: `;
    return `  - ${where}${e.text}`;
  });
  return new Error(`${what} failed:\n${lines.join('\n')}\nFix the errors above (a missing package usually needs "npm install" in the module folder).`);
}

// The backend entry and each lifecycle hook share these settings: app-core imports them all the same way.
async function buildBackendFile(moduleDir: string, outDir: string, what: string, entry: string, output: string): Promise<void> {
  try {
    await build({
      absWorkingDir: moduleDir,
      entryPoints: [entry],
      outfile: path.join(outDir, output),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      treeShaking: true,
      // Readable production stack traces; the sourcemap maps them back to src/.
      minify: false,
      sourcemap: true,
      // app-core loads the backend and the hooks with import(), which exposes a CJS module.exports as `default`:
      // without this footer `default` would be { default: fn } and the loader finds no function.
      footer: { js: 'module.exports = module.exports.default;' },
      logLevel: 'silent',
    });
  } catch (err) {
    throw describeBuildFailure(`Bundling ${what} (${entry})`, err);
  }
}

// Bundles each declared lifecycle hook next to the backend; returns the output manifest block.
async function buildHooks(moduleDir: string, outDir: string, manifest: SourceManifest): Promise<Manifest['lifecycle']> {
  const lifecycle: NonNullable<Manifest['lifecycle']> = {};
  for (const hook of HOOKS) {
    const declared = manifest.lifecycle?.[hook];
    if (declared !== undefined) {
      const output = `api-backend/${hook}.cjs`;
      await buildBackendFile(moduleDir, outDir, `the ${hook} hook`, toPosix(path.relative(moduleDir, path.resolve(moduleDir, declared))), output);
      lifecycle[hook] = `./${output}`;
    }
  }
  return Object.keys(lifecycle).length === 0 ? undefined : lifecycle;
}

async function buildDslLib(moduleDir: string, outDir: string): Promise<{ css: boolean }> {
  try {
    await build({
      absWorkingDir: moduleDir,
      entryPoints: [DSL_COMPONENTS_ENTRY],
      outfile: path.join(outDir, DSL_LIB_ENTRY_OUTPUT),
      bundle: true,
      platform: 'browser',
      target: 'es2022',
      format: 'esm',
      treeShaking: true,
      minify: true,
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [appCoreShared],
      logLevel: 'silent',
    });
  } catch (err) {
    throw describeBuildFailure(`Building the dsl-lib (${DSL_COMPONENTS_ENTRY})`, err);
  }
  // Copied as built: compiling CSS (e.g. Tailwind) would be a new dependency of the CLI.
  const cssSource = path.join(moduleDir, DSL_LIB_CSS_SOURCE);
  if (!fs.existsSync(cssSource)) {
    return { css: false };
  }
  fs.copyFileSync(cssSource, path.join(outDir, DSL_LIB_CSS_OUTPUT));
  return { css: true };
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

// Emits only the views the manifest references, parsed and re-emitted compact as JSON (YAML is a JSON
// superset, so the loader and the shell read them unchanged). Returns the manifest with rewritten paths.
function emitViews(moduleDir: string, outDir: string, manifest: SourceManifest, warnings: string[]): SourceManifest['extensionPoints'] {
  const viewsRoot = path.join(moduleDir, VIEWS_SOURCE_DIR);
  const emittedFrom = new Map<string, string>();
  const referenced = new Set<string>();

  const extensionPoints = manifest.extensionPoints.map((ep, index) => {
    if (ep.view.type !== 'path') {
      warnings.push(...ignoredChildrenWarnings(ep.view.value, `manifest.json extensionPoints[${index}] (inline view)`));
      return ep;
    }
    const source = path.resolve(moduleDir, String(ep.view.value));
    const sourceRel = toPosix(path.relative(moduleDir, source));
    const insideViews = toPosix(path.relative(viewsRoot, source));
    const emittedRel = `${VIEWS_OUTPUT_DIR}/${insideViews.replace(/\.[^./]+$/, '')}.json`;
    const previous = emittedFrom.get(emittedRel);
    if (previous !== undefined && previous !== sourceRel) {
      throw new Error(`${previous} and ${sourceRel} would both be emitted as ${emittedRel}. Rename one of them so their names differ.`);
    }
    if (previous === undefined) {
      emittedFrom.set(emittedRel, sourceRel);
      referenced.add(source);
      const target = path.join(outDir, emittedRel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const parsedView = parseYaml(fs.readFileSync(source, 'utf8'));
      warnings.push(...ignoredChildrenWarnings(parsedView, sourceRel));
      fs.writeFileSync(target, JSON.stringify(parsedView));
    }
    return { ...ep, view: { type: 'path' as const, value: `./${emittedRel}` } };
  });

  for (const file of listFiles(viewsRoot)) {
    if (!referenced.has(file)) {
      warnings.push(
        `${toPosix(path.relative(moduleDir, file))} is not referenced by manifest.json, so it is not packaged. Reference it from an extensionPoint, or delete it.`,
      );
    }
  }
  return extensionPoints;
}

// Copies the exposed types file (already checked to hold types only) to dist-module/types/index.d.ts and
// returns the expose block with its path rewritten.
function emitTypes(moduleDir: string, outDir: string, manifest: SourceManifest): SourceManifest['expose'] {
  if (manifest.expose?.types === undefined) {
    return manifest.expose;
  }
  const target = path.join(outDir, TYPES_OUTPUT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.resolve(moduleDir, manifest.expose.types), target);
  return { ...manifest.expose, types: `./${TYPES_OUTPUT}` };
}

// Final gate: the written manifest is parsed with the same schema the server uses and every path it
// names must exist and resolve (symlinks included) inside the output folder.
export function validatePackagedOutput(outDir: string): void {
  const manifestPath = path.join(outDir, 'manifest.json');
  const validated = validateManifestFile(manifestPath);
  if (!validated.ok) {
    throw new Error(`The packaged manifest is invalid: ${validated.message}`);
  }
  const manifest = validated.manifest;
  const referenced: Array<{ field: string; value: string }> = [{ field: 'backendEntryPath', value: manifest.backendEntryPath }];
  if (manifest.expose?.types !== undefined) {
    referenced.push({ field: 'expose.types', value: manifest.expose.types });
  }
  for (const hook of HOOKS) {
    const declared = manifest.lifecycle?.[hook];
    if (declared !== undefined) {
      referenced.push({ field: `lifecycle.${hook}`, value: declared });
    }
  }
  manifest.extensionPoints.forEach((ep, index) => {
    if (ep.view.type === 'path') {
      referenced.push({ field: `extensionPoints[${index}].view.value`, value: String(ep.view.value) });
    }
  });
  if (manifest.dslLib !== undefined) {
    referenced.push({ field: 'dslLib.entry', value: manifest.dslLib.entry });
    if (manifest.dslLib.css !== undefined) {
      referenced.push({ field: 'dslLib.css', value: manifest.dslLib.css });
    }
  }

  const realOut = fs.realpathSync(outDir);
  for (const { field, value } of referenced) {
    const resolved = path.resolve(outDir, value);
    if (!isInside(outDir, resolved)) {
      throw new Error(`The packaged manifest's ${field} "${value}" resolves to ${resolved}, outside the output folder ${outDir}.`);
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`The packaged manifest's ${field} "${value}" does not exist: ${resolved} is missing from the output.`);
    }
    if (!isInside(realOut, fs.realpathSync(resolved))) {
      throw new Error(`The packaged manifest's ${field} "${value}" resolves through a link to ${fs.realpathSync(resolved)}, outside the output folder ${outDir}.`);
    }
  }
}

// Builds dist-module from a module's sources: checks the module, bundles the backend and the dsl-lib,
// emits the referenced views and writes the manifest the server loads (version stamped, paths rewritten).
export async function packageModule(options: PackageOptions): Promise<PackageResult> {
  const moduleDir = path.resolve(options.moduleDir);
  const outDir = path.resolve(options.outDir);
  assertSafeOutDir(moduleDir, outDir);

  const { issues, warnings: checkWarnings, manifest } = await checkModule(moduleDir, { links: options.links });
  if (issues.length > 0 || manifest === undefined) {
    throw new Error(formatCheckIssues(moduleDir, issues));
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const warnings: string[] = [...checkWarnings];
  // A module that others `requires` is matched against ranges in strict semver: with another version it can never be a provider.
  if (semver.valid(options.version) === null) {
    warnings.push(
      `version "${options.version}" is not valid semver (for example 1.2.3 or 2026.10.19-5): modules that "requires" this one will fail to load against it. Ignore this if no module requires it.`,
    );
  }

  await buildBackendFile(moduleDir, outDir, 'the backend', BACKEND_ENTRY, BACKEND_OUTPUT);
  const lifecycle = await buildHooks(moduleDir, outDir, manifest);
  const lib = manifest.dslLib === undefined ? undefined : await buildDslLib(moduleDir, outDir);
  const extensionPoints = emitViews(moduleDir, outDir, manifest, warnings);
  const expose = emitTypes(moduleDir, outDir, manifest);

  const output = {
    id: manifest.id,
    version: options.version,
    backendEntryPath: `./${BACKEND_OUTPUT}`,
    ...(lifecycle === undefined ? {} : { lifecycle }),
    ...(manifest.requires === undefined ? {} : { requires: manifest.requires }),
    ...(manifest.optionalRequires === undefined ? {} : { optionalRequires: manifest.optionalRequires }),
    ...(expose === undefined ? {} : { expose }),
    ...(manifest.showInNav === undefined ? {} : { showInNav: manifest.showInNav }),
    ...(manifest.title === undefined ? {} : { title: manifest.title }),
    extensionPoints,
    ...(manifest.dslLib === undefined || lib === undefined
      ? {}
      : {
          dslLib: {
            entry: `./${DSL_LIB_ENTRY_OUTPUT}`,
            ...(lib.css ? { css: `./${DSL_LIB_CSS_OUTPUT}` } : {}),
            shared: manifest.dslLib.shared,
          },
        }),
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(output, null, 2)}\n`);

  validatePackagedOutput(outDir);
  return { outDir, manifestPath, warnings };
}
