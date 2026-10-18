import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';
import { build, transform } from 'esbuild';
import { load as parseYaml } from 'js-yaml';
import type { SourceManifest } from '@wadeck-app/app-core-sdk';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';
import { rootTypeOf, validateContributions } from '@wadeck-app/app-core-server/contributions';
import { OUTPUT_DIR } from './outputDir.js';
import { findProvider, type Links } from './providers.js';
import { validateSourceManifestFile } from './validate.js';

export { OUTPUT_DIR };

export interface CheckOptions {
  // Package name -> folder, to find a provider module that is not installed in node_modules (see providers.ts).
  links?: Links;
}

export interface CheckIssue {
  // Path relative to the module folder, with forward slashes.
  file: string;
  problem: string;
  fix: string;
}

export interface CheckResult {
  issues: CheckIssue[];
  // Present when manifest.json parsed as a valid source manifest.
  manifest?: SourceManifest;
}

export const SRC_DIRS = ['backend', 'dsl-views', 'dsl-components', 'commons'] as const;
type SrcDir = (typeof SRC_DIRS)[number];

export const TYPES_OUTPUT = 'types/index.d.ts';
export const BACKEND_ENTRY = 'src/backend/index.ts';
export const DSL_COMPONENTS_ENTRY = 'src/dsl-components/index.ts';
const VIEWS_DIR = 'src/dsl-views';

const ROOT_DIRS = new Set(['src', OUTPUT_DIR, 'node_modules']);
const ROOT_FILES = new Set(['manifest.json', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']);
const ROOT_FILE_PATTERNS = [/^README(\..+)?$/i, /^LICENSE(\..+)?$/i, /^CHANGELOG(\..+)?$/i, /^tsconfig(\..+)?\.json$/, /\.config\.(?:[cm]?[jt]s|json)$/];
const VIEW_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);
const CODE_EXTENSION = /\.[cm]?[jt]sx?$/;
const JSX_EXTENSION = /\.[jt]sx$/;
const NODE_BUILTINS = new Set(builtinModules);

// Dependencies the forbidden-import rules guard: which source folder may not import which.
const FORBIDDEN_FOLDER_IMPORTS: Record<SrcDir, SrcDir[]> = {
  backend: ['dsl-components'],
  commons: ['backend', 'dsl-components'],
  'dsl-components': ['backend'],
  'dsl-views': [],
};

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function isRootEntryAllowed(name: string, isDir: boolean): boolean {
  if (name.startsWith('.')) {
    return true;
  }
  if (isDir) {
    return ROOT_DIRS.has(name);
  }
  return ROOT_FILES.has(name) || ROOT_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(abs));
    } else {
      files.push(abs);
    }
  }
  return files.sort();
}

function isReactSpecifier(spec: string): boolean {
  return spec === 'react' || spec === 'react-dom' || spec.startsWith('react/') || spec.startsWith('react-dom/');
}

function isNodeSpecifier(spec: string): boolean {
  return spec.startsWith('node:') || NODE_BUILTINS.has(spec);
}

interface ScannedFile {
  imports: string[];
  exports: string[];
}

async function buildMetafile(moduleDir: string, files: string[]): Promise<Map<string, ScannedFile>> {
  const result = await build({
    absWorkingDir: moduleDir,
    entryPoints: files,
    bundle: false,
    write: false,
    metafile: true,
    format: 'esm',
    outdir: path.join(moduleDir, '.check-out'),
    outbase: moduleDir,
    logLevel: 'silent',
    tsconfigRaw: JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }),
  });
  const scanned = new Map<string, ScannedFile>();
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.entryPoint !== undefined) {
      scanned.set(path.resolve(moduleDir, output.entryPoint), { imports: output.imports.map((i) => i.path), exports: output.exports });
    }
  }
  return scanned;
}

// Lists the import specifiers and export names of source files using esbuild's own parser, so comments and
// strings are never mistaken for imports. verbatimModuleSyntax keeps unused imports that esbuild would
// otherwise drop from TypeScript files: an unused import is still a layout violation. One build covers all
// files; only when it fails are files built one by one, to name the ones that do not parse.
async function scanFiles(moduleDir: string, files: string[]): Promise<{ scanned: Map<string, ScannedFile>; failures: Map<string, string> }> {
  const failures = new Map<string, string>();
  if (files.length === 0) {
    return { scanned: new Map(), failures };
  }
  try {
    return { scanned: await buildMetafile(moduleDir, files), failures };
  } catch {
    const scanned = new Map<string, ScannedFile>();
    for (const file of files) {
      try {
        for (const [key, value] of await buildMetafile(moduleDir, [file])) {
          scanned.set(key, value);
        }
      } catch (err) {
        failures.set(file, getErrorMessage(err).split('\n').slice(0, 3).join(' '));
      }
    }
    return { scanned, failures };
  }
}

function srcFolderOf(moduleDir: string, absolute: string): SrcDir | undefined {
  const rel = toPosix(path.relative(path.join(moduleDir, 'src'), absolute));
  return SRC_DIRS.find((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function checkSourceFile(moduleDir: string, folder: SrcDir, abs: string, scanned: ScannedFile, issues: CheckIssue[]): void {
  const rel = toPosix(path.relative(moduleDir, abs));

  for (const spec of scanned.imports) {
    if ((folder === 'backend' || folder === 'commons') && isReactSpecifier(spec)) {
      issues.push({
        file: rel,
        problem: `imports React ("${spec}"), which is not allowed in src/${folder}`,
        fix: 'Move the React code to src/dsl-components, or remove the import. Backend and commons code runs without React.',
      });
    }
    if (folder === 'commons' && isNodeSpecifier(spec)) {
      issues.push({
        file: rel,
        problem: `imports the Node builtin "${spec}", which is not allowed in src/commons (it is shared with the browser-side dsl-components)`,
        fix: 'Move the code that needs Node to src/backend, or remove the import.',
      });
    }
    if (spec.startsWith('.')) {
      const target = srcFolderOf(moduleDir, path.resolve(path.dirname(abs), spec));
      if (target !== undefined && FORBIDDEN_FOLDER_IMPORTS[folder].includes(target)) {
        issues.push({
          file: rel,
          problem: `src/${folder} must not import from src/${target} ("${spec}")`,
          fix: `Move what both sides need to src/commons and import it from there.`,
        });
      }
    }
  }

  if (rel === BACKEND_ENTRY && !scanned.exports.includes('default')) {
    issues.push({
      file: rel,
      problem: 'the backend entry has no default export',
      fix: 'Add `export default function (ctx) { ... }`: app-core calls it with the module context when the module loads.',
    });
  }
}

function checkRoot(moduleDir: string, issues: CheckIssue[]): void {
  for (const entry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
    if (!isRootEntryAllowed(entry.name, entry.isDirectory())) {
      issues.push({
        file: entry.name,
        problem: `${entry.isDirectory() ? 'folder' : 'file'} "${entry.name}" is not allowed at the module root`,
        fix: entry.isDirectory()
          ? `Move the sources into src/{${SRC_DIRS.join(',')}}. Only src, ${OUTPUT_DIR}, node_modules and dot folders are allowed at the root.`
          : 'Remove it, or move it under src/. Allowed at the root: manifest.json, package.json, README*, LICENSE*, tsconfig*.json, *.config.* and dotfiles.',
      });
    }
  }
}

// Returns what was scanned in each code file (empty when src is missing), so later checks reuse it.
async function checkSrc(moduleDir: string, issues: CheckIssue[]): Promise<Map<string, ScannedFile>> {
  const codeFiles: Array<{ folder: SrcDir; abs: string }> = [];
  const srcDir = path.join(moduleDir, 'src');
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    issues.push({ file: 'src', problem: 'the src folder is missing', fix: `Create src/ with the folders you need among ${SRC_DIRS.join(', ')}.` });
    return new Map();
  }

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = `src/${entry.name}`;
    if (!entry.isDirectory()) {
      issues.push({ file: rel, problem: 'files are not allowed directly under src', fix: `Move it into one of src/${SRC_DIRS.join(', src/')}.` });
    } else if (!(SRC_DIRS as readonly string[]).includes(entry.name)) {
      issues.push({
        file: rel,
        problem: `"${entry.name}" is not a known source folder`,
        fix: `Use only ${SRC_DIRS.join(', ')} under src (shared code goes to src/commons).`,
      });
    }
  }

  for (const folder of SRC_DIRS) {
    const folderDir = path.join(srcDir, folder);
    if (!fs.existsSync(folderDir) || !fs.statSync(folderDir).isDirectory()) {
      continue;
    }
    for (const abs of listFiles(folderDir)) {
      const rel = toPosix(path.relative(moduleDir, abs));
      const ext = path.extname(abs).toLowerCase();
      if (folder === 'dsl-views' && !VIEW_EXTENSIONS.has(ext)) {
        issues.push({ file: rel, problem: `only .yaml, .yml and .json files are allowed in src/dsl-views, got "${ext || '(no extension)'}"`, fix: 'Move code to src/dsl-components (React) or src/backend, or delete the file.' });
        continue;
      }
      if (folder !== 'dsl-components' && folder !== 'dsl-views' && JSX_EXTENSION.test(abs)) {
        issues.push({ file: rel, problem: `${ext} files are only allowed in src/dsl-components`, fix: 'Move the component to src/dsl-components, or rename the file to .ts/.js if it has no JSX.' });
      }
      if (folder !== 'dsl-views' && CODE_EXTENSION.test(abs)) {
        codeFiles.push({ folder, abs });
      }
    }
  }

  const { scanned, failures } = await scanFiles(
    moduleDir,
    codeFiles.map((f) => f.abs),
  );
  for (const { folder, abs } of codeFiles) {
    const result = scanned.get(abs);
    if (result !== undefined) {
      checkSourceFile(moduleDir, folder, abs, result, issues);
    } else {
      issues.push({
        file: toPosix(path.relative(moduleDir, abs)),
        problem: `cannot be parsed: ${failures.get(abs) ?? 'unknown error'}`,
        fix: 'Fix the syntax error; the file cannot be bundled.',
      });
    }
  }

  if (!fs.existsSync(path.join(moduleDir, BACKEND_ENTRY))) {
    issues.push({
      file: BACKEND_ENTRY,
      problem: 'the backend entry is missing (the backend entry is always src/backend/index.ts)',
      fix: 'Create it with `export default function (ctx) { ... }`.',
    });
  }
  return scanned;
}

function checkViewFile(moduleDir: string, viewValue: string, index: number, seen: Set<string>, issues: CheckIssue[]): void {
  const abs = path.resolve(moduleDir, viewValue);
  const rel = toPosix(path.relative(moduleDir, abs));
  if (seen.has(abs)) {
    return;
  }
  seen.add(abs);
  const insideViews = toPosix(path.relative(path.join(moduleDir, VIEWS_DIR), abs));
  if (insideViews.startsWith('..') || path.isAbsolute(insideViews)) {
    issues.push({
      file: rel,
      problem: `extensionPoints[${index}].view.value "${viewValue}" is not inside ${VIEWS_DIR}`,
      fix: `Move the view file to ${VIEWS_DIR}/ and reference it as "./${VIEWS_DIR}/<file>.yaml".`,
    });
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    issues.push({
      file: rel,
      problem: `referenced by manifest.json (extensionPoints[${index}]) but does not exist`,
      fix: `Create ${rel}, or fix the path in manifest.json.`,
    });
    return;
  }
  try {
    const parsed = parseYaml(fs.readFileSync(abs, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      issues.push({ file: rel, problem: 'a view must be a YAML/JSON object (with a $type), got something else', fix: 'Start the file with `$type: <Component>`.' });
    }
  } catch (err) {
    issues.push({ file: rel, problem: `is not valid YAML: ${(err as Error).message.split('\n')[0]}`, fix: 'Fix the YAML syntax.' });
  }
}

function checkManifest(moduleDir: string, issues: CheckIssue[]): SourceManifest | undefined {
  const result = validateSourceManifestFile(path.join(moduleDir, 'manifest.json'));
  if (!result.ok) {
    issues.push({
      file: 'manifest.json',
      problem: result.reason,
      fix: 'The source manifest holds only id, extensionPoints, dslLib.shared, requires, expose and lifecycle. `package` writes version, backendEntryPath and dslLib.entry/css into dist-module/manifest.json.',
    });
    return undefined;
  }
  const manifest = result.manifest;

  const seen = new Set<string>();
  manifest.extensionPoints.forEach((ep, index) => {
    if (ep.view.type === 'path') {
      checkViewFile(moduleDir, String(ep.view.value), index, seen, issues);
    }
  });

  const componentsDir = path.join(moduleDir, 'src', 'dsl-components');
  const hasComponents = fs.existsSync(componentsDir) && listFiles(componentsDir).length > 0;
  if (manifest.dslLib !== undefined && !fs.existsSync(path.join(moduleDir, DSL_COMPONENTS_ENTRY))) {
    issues.push({
      file: DSL_COMPONENTS_ENTRY,
      problem: 'manifest.json declares dslLib but the dsl-components entry is missing',
      fix: `Create ${DSL_COMPONENTS_ENTRY} default-exporting the ComponentRegistryEntry[], or remove dslLib from manifest.json.`,
    });
  }
  if (manifest.dslLib === undefined && hasComponents) {
    issues.push({
      file: 'manifest.json',
      problem: 'src/dsl-components has files but manifest.json has no dslLib, so they would not be packaged',
      fix: 'Add `"dslLib": { "shared": { "react": "^19" } }` (the shared singleton ranges the components were built for), or delete src/dsl-components.',
    });
  }
  return manifest;
}

function checkPublishing(moduleDir: string, issues: CheckIssue[]): void {
  const gitignore = path.join(moduleDir, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    issues.push({ file: '.gitignore', problem: `missing; ${OUTPUT_DIR} must be gitignored`, fix: `Create .gitignore containing the line "${OUTPUT_DIR}".` });
  } else {
    const lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/).map((l) => l.trim());
    if (!lines.some((line) => /^\/?dist-module\/?$/.test(line))) {
      issues.push({ file: '.gitignore', problem: `does not ignore ${OUTPUT_DIR}, which is generated`, fix: `Add the line "${OUTPUT_DIR}" to .gitignore.` });
    }
  }

  const packageJson = path.join(moduleDir, 'package.json');
  if (!fs.existsSync(packageJson)) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  } catch (err) {
    issues.push({ file: 'package.json', problem: `is not valid JSON: ${(err as Error).message}`, fix: 'Fix the JSON syntax.' });
    return;
  }
  const files = typeof parsed === 'object' && parsed !== null ? (parsed as { files?: unknown }).files : undefined;
  if (!Array.isArray(files) || files.length !== 1 || files[0] !== OUTPUT_DIR) {
    issues.push({
      file: 'package.json',
      problem: `"files" is ${JSON.stringify(files)}, but only ${OUTPUT_DIR} may be published`,
      fix: `Set "files": ["${OUTPUT_DIR}"] in package.json.`,
    });
  }
}

const HOOK_NAMES = ['teardown', 'migrate'] as const;
const BACKEND_SOURCE_DIR = 'src/backend';

// Lifecycle hooks (decision 84): each is a code file under src/backend whose default export is the function.
function checkLifecycle(moduleDir: string, manifest: SourceManifest, scanned: Map<string, ScannedFile>, issues: CheckIssue[]): void {
  for (const hook of HOOK_NAMES) {
    const declared = manifest.lifecycle?.[hook];
    if (declared === undefined) {
      continue;
    }
    const abs = path.resolve(moduleDir, declared);
    const rel = toPosix(path.relative(moduleDir, abs));
    const insideBackend = toPosix(path.relative(path.join(moduleDir, BACKEND_SOURCE_DIR), abs));
    if (insideBackend.startsWith('..') || path.isAbsolute(insideBackend) || !CODE_EXTENSION.test(abs) || JSX_EXTENSION.test(abs)) {
      issues.push({
        file: 'manifest.json',
        problem: `lifecycle.${hook} "${declared}" must be a .ts or .js file inside ${BACKEND_SOURCE_DIR}`,
        fix: `Move the hook to ${BACKEND_SOURCE_DIR}/${hook}.ts and set "lifecycle": { "${hook}": "./${BACKEND_SOURCE_DIR}/${hook}.ts" }.`,
      });
      continue;
    }
    if (rel === BACKEND_ENTRY) {
      issues.push({
        file: 'manifest.json',
        problem: `lifecycle.${hook} points at the backend entry ${BACKEND_ENTRY}, whose default export is the setup function`,
        fix: `Put the ${hook} hook in its own file, e.g. ${BACKEND_SOURCE_DIR}/${hook}.ts.`,
      });
      continue;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      issues.push({
        file: rel,
        problem: `referenced by manifest.json (lifecycle.${hook}) but does not exist`,
        fix: `Create ${rel} with \`export default async function (ctx) { ... }\`, or remove lifecycle.${hook} from manifest.json.`,
      });
      continue;
    }
    // A file that does not parse is already reported by checkSrc.
    const exportedNames = scanned.get(abs)?.exports;
    if (exportedNames !== undefined && !exportedNames.includes('default')) {
      issues.push({
        file: rel,
        problem: `the ${hook} hook has no default export`,
        fix: 'Add `export default async function (ctx) { ... }`: app-core calls it with { id, version, previousVersion, dataDir }.',
      });
    }
  }
}

const TYPES_SOURCE_DIR = 'src/commons';
const RELATIVE_TYPE_IMPORT = /\b(?:from|import)\s*\(?\s*['"]\.{1,2}\//;

// The types file is copied alone to dist-module/types/index.d.ts and consumed as types only: any emitted
// code means a runtime value (const, function, class, enum, value import) that would never exist there.
async function checkExposedTypes(moduleDir: string, manifest: SourceManifest, issues: CheckIssue[]): Promise<void> {
  const declared = manifest.expose?.types;
  if (declared === undefined) {
    return;
  }
  const abs = path.resolve(moduleDir, declared);
  const rel = toPosix(path.relative(moduleDir, abs));
  const insideCommons = toPosix(path.relative(path.join(moduleDir, TYPES_SOURCE_DIR), abs));
  if (insideCommons.startsWith('..') || path.isAbsolute(insideCommons) || !/\.ts$/.test(abs)) {
    issues.push({
      file: 'manifest.json',
      problem: `expose.types "${declared}" must be a .ts or .d.ts file inside ${TYPES_SOURCE_DIR}`,
      fix: `Move the types to ${TYPES_SOURCE_DIR}/types.ts and set "expose": { "types": "./${TYPES_SOURCE_DIR}/types.ts" }.`,
    });
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    issues.push({ file: rel, problem: `referenced by manifest.json (expose.types) but does not exist`, fix: `Create ${rel} with the exported types, or remove expose.types from manifest.json.` });
    return;
  }

  const source = fs.readFileSync(abs, 'utf8');
  try {
    const { code } = await transform(source, {
      loader: 'ts',
      format: 'esm',
      sourcefile: rel,
      logLevel: 'silent',
      // Keeps value imports (only `import type` is erased), so a runtime dependency is not mistaken for a type.
      tsconfigRaw: JSON.stringify({ compilerOptions: { verbatimModuleSyntax: true } }),
    });
    const runtime = code.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, '').trim();
    if (runtime !== '') {
      issues.push({
        file: rel,
        problem: `contains runtime code, but expose.types must hold types only (it is published as a .d.ts); it compiles to: ${runtime.split('\n')[0]}`,
        fix: 'Keep only interface/type declarations and `import type`. Move values (const, function, class, enum) to src/backend or src/commons and export only their types.',
      });
    }
  } catch (err) {
    issues.push({ file: rel, problem: `cannot be parsed: ${getErrorMessage(err).split('\n').slice(0, 3).join(' ')}`, fix: 'Fix the syntax error.' });
    return;
  }
  if (RELATIVE_TYPE_IMPORT.test(source)) {
    issues.push({
      file: rel,
      problem: 'has a relative import of another file, but the types file is copied alone to dist-module/types/index.d.ts, so the import would not resolve there',
      fix: 'Put every exposed type in this one file, or import from an installed package instead of a relative path.',
    });
  }

  const packageJson = path.join(moduleDir, 'package.json');
  if (!fs.existsSync(packageJson)) {
    issues.push({ file: 'package.json', problem: 'is missing, but expose.types needs its exports["./types"]', fix: `Create package.json with "exports": { "./types": { "types": "./${OUTPUT_DIR}/${TYPES_OUTPUT}" } }.` });
    return;
  }
  let exportsField: unknown;
  try {
    exportsField = (JSON.parse(fs.readFileSync(packageJson, 'utf8')) as { exports?: unknown }).exports;
  } catch {
    // Invalid JSON is already reported by checkPublishing.
    return;
  }
  const typesExport = typeof exportsField === 'object' && exportsField !== null ? (exportsField as { './types'?: unknown })['./types'] : undefined;
  const typesPath = typeof typesExport === 'object' && typesExport !== null ? (typesExport as { types?: unknown }).types : undefined;
  if (typesPath !== `./${OUTPUT_DIR}/${TYPES_OUTPUT}`) {
    issues.push({
      file: 'package.json',
      problem: `exports["./types"].types is ${JSON.stringify(typesPath)}, but expose.types is published as ./${OUTPUT_DIR}/${TYPES_OUTPUT}`,
      fix: `Set "exports": { "./types": { "types": "./${OUTPUT_DIR}/${TYPES_OUTPUT}" } } in package.json, so contributors can import the types.`,
    });
  }
}

// The root $type of the view of an extension point, read the same way the server reads it at load.
function viewRootType(moduleDir: string, view: SourceManifest['extensionPoints'][number]['view']): { file: string | undefined; rootType: string | undefined } {
  if (view.type === 'inline') {
    return { file: undefined, rootType: rootTypeOf(view.value) };
  }
  const abs = path.resolve(moduleDir, String(view.value));
  const file = toPosix(path.relative(moduleDir, abs));
  try {
    return { file, rootType: rootTypeOf(parseYaml(fs.readFileSync(abs, 'utf8'))) };
  } catch {
    // A missing or invalid view file is reported by checkViewFile; no root type to compare here.
    return { file, rootType: undefined };
  }
}

// requires + contributions to custom slots (decision 82), against the provider found among the dependencies.
function checkContributions(moduleDir: string, manifest: SourceManifest, links: Links, issues: CheckIssue[]): void {
  const views = manifest.extensionPoints.map((ep) => viewRootType(moduleDir, ep.view));
  const problems = validateContributions({
    moduleId: manifest.id,
    requires: manifest.requires,
    contributions: manifest.extensionPoints.map((ep, index) => ({ index, slot: ep.slot, rootType: views[index]?.rootType })),
    selfExpose: manifest.expose,
    lookup: (providerId) => findProvider(moduleDir, providerId, links),
    mode: 'package',
  });
  for (const problem of problems) {
    const viewFile = problem.about === 'view' && problem.extensionPointIndex !== undefined ? views[problem.extensionPointIndex]?.file : undefined;
    issues.push({ file: viewFile ?? 'manifest.json', problem: problem.problem, fix: problem.fix });
  }
}

// Checks a module folder against the layout rules (decision 81) and its source manifest. Collects every
// problem instead of stopping at the first, so one run shows the whole to-do list.
export async function checkModule(moduleDirArg: string, options: CheckOptions = {}): Promise<CheckResult> {
  // esbuild's absWorkingDir must be absolute, and "check ." is the usual way to call this.
  const moduleDir = path.resolve(moduleDirArg);
  const issues: CheckIssue[] = [];
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) {
    return {
      issues: [{ file: '.', problem: `module folder ${moduleDir} does not exist or is not a folder`, fix: 'Pass the folder that contains manifest.json.' }],
    };
  }
  checkRoot(moduleDir, issues);
  const scanned = await checkSrc(moduleDir, issues);
  const manifest = checkManifest(moduleDir, issues);
  checkPublishing(moduleDir, issues);
  if (manifest !== undefined) {
    checkLifecycle(moduleDir, manifest, scanned, issues);
    await checkExposedTypes(moduleDir, manifest, issues);
    checkContributions(moduleDir, manifest, options.links ?? {}, issues);
  }
  return { issues, manifest };
}

export function formatCheckIssues(moduleDir: string, issues: CheckIssue[]): string {
  const lines = issues.flatMap((issue) => [`  - ${issue.file}: ${issue.problem}`, `    Fix: ${issue.fix}`]);
  return [`Module check failed for ${moduleDir}: ${issues.length} problem(s)`, ...lines].join('\n');
}
