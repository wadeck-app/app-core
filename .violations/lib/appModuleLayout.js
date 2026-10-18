import * as fs from 'node:fs';
import * as path from 'node:path';
import { builtinModules } from 'node:module';

// Shared by the app-module/* rules. These replicate the layout verdicts of `app-core-cli check`
// (packages/app-core-cli/src/check.ts, the authoritative implementation) with plain text scanning
// instead of importing it: the CLI is a bin-only package, and rules must run without building it.
// appModuleLayoutParity.test.ts runs both on the same modules and fails if their verdicts diverge.
//
// This is a .js file with a .d.ts next to it because the violations CLI rewrites a rule's relative
// imports to the source folder without compiling them: only rule files are transpiled.

export const SRC_DIRS = ['backend', 'dsl-views', 'dsl-components', 'commons'];

export const OUTPUT_DIR = 'dist-module';
export const BACKEND_ENTRY = 'src/backend/index.ts';

// Which source folder may not import which.
export const FORBIDDEN_FOLDER_IMPORTS = {
  backend: ['dsl-components'],
  commons: ['backend', 'dsl-components'],
  'dsl-components': ['backend'],
  'dsl-views': [],
};

const NODE_BUILTINS = new Set(builtinModules);

export function toPosix(p) {
  return p.split(path.sep).join('/').replaceAll('\\', '/');
}

// The module folder of a file: the nearest ancestor named app-module-<name>. Generated output and
// installed dependencies are not module sources.
export function moduleRootOf(file) {
  const posix = toPosix(file);
  if (posix.includes(`/${OUTPUT_DIR}/`) || posix.includes('/node_modules/') || posix.includes('/.check-out/')) {
    return undefined;
  }
  const parts = posix.split('/');
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^app-module-.+/.test(parts[i])) {
      return parts.slice(0, i + 1).join('/');
    }
  }
  return undefined;
}

export function srcFolderOf(moduleRoot, absolute) {
  const rel = toPosix(path.relative(path.join(moduleRoot, 'src'), absolute));
  return SRC_DIRS.find((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

export function isReactSpecifier(spec) {
  return spec === 'react' || spec === 'react-dom' || spec.startsWith('react/') || spec.startsWith('react-dom/');
}

export function isNodeSpecifier(spec) {
  return spec.startsWith('node:') || NODE_BUILTINS.has(spec);
}

// Comments are removed first so a commented-out import is not reported. The `//` pattern skips `://`
// so URLs inside strings survive.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Runtime import specifiers. `import type` / `export type` are erased by the compiler, so like the CLI
// (esbuild) they do not count. `line` is where the statement starts.
export function importSpecifiers(source) {
  const stripped = stripComments(source);
  const patterns = [
    /\b(?:import|export)\s+(?!type\s)[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const found = [];
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) {
      found.push({ spec: match[1], line: stripped.slice(0, match.index).split('\n').length });
    }
  }
  return found;
}

export function hasDefaultExport(source) {
  const stripped = stripComments(source);
  return /\bexport\s+default\b/.test(stripped) || /\bexport\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(stripped);
}

export function isDir(p) {
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

export function listFiles(dir) {
  const files = [];
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
