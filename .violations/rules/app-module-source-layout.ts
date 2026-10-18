import type { Rule, Violation } from '@wadeck-app/violations-rules';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDir, listFiles, moduleRootOf, OUTPUT_DIR, SRC_DIRS, toPosix } from '../lib/appModuleLayout.js';

// Module layout (decision 81): only manifest.json/package files at the root, sources only under
// src/{backend,dsl-views,dsl-components,commons}, and only data files in src/dsl-views.
// Mirrors `app-core-cli check`. Anchored on manifest.json (always present in a module).
const ROOT_DIRS = new Set(['src', OUTPUT_DIR, 'node_modules']);
const ROOT_FILES = new Set(['manifest.json', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']);
const ROOT_FILE_PATTERNS = [/^README(\..+)?$/i, /^LICENSE(\..+)?$/i, /^CHANGELOG(\..+)?$/i, /^tsconfig(\..+)?\.json$/, /\.config\.(?:[cm]?[jt]s|json)$/];
const VIEW_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);

function isRootEntryAllowed(name: string, isDirectory: boolean): boolean {
  if (name.startsWith('.')) return true;
  if (isDirectory) return ROOT_DIRS.has(name);
  return ROOT_FILES.has(name) || ROOT_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

export const rule: Rule = {
  id: 'app-module/source-layout',
  tags: 'ts',
  defaultScope: ['**/app-module-*/manifest.json'],
  defaultSeverity: 'error',

  async check(files: string[]): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const manifestPath of files) {
      const root = moduleRootOf(manifestPath);
      if (root === undefined || toPosix(path.dirname(manifestPath)) !== root) continue;

      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!isRootEntryAllowed(entry.name, entry.isDirectory())) {
          violations.push({
            file: path.join(root, entry.name),
            line: 1,
            message: `"${entry.name}" is not allowed at the module root. Move sources into src/{${SRC_DIRS.join(',')}}; only src, ${OUTPUT_DIR}, node_modules, dot folders, manifest.json, package files, README*, LICENSE*, tsconfig*.json and *.config.* are allowed.`,
          });
        }
      }

      const srcDir = path.join(root, 'src');
      if (!isDir(srcDir)) {
        violations.push({ file: manifestPath, line: 1, message: `the module has no src/ folder. Create src/ with the folders you need among ${SRC_DIRS.join(', ')}.` });
        continue;
      }
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          violations.push({ file: path.join(srcDir, entry.name), line: 1, message: `files are not allowed directly under src/. Move it into one of src/${SRC_DIRS.join(', src/')}.` });
        } else if (!(SRC_DIRS as readonly string[]).includes(entry.name)) {
          violations.push({ file: path.join(srcDir, entry.name), line: 1, message: `"${entry.name}" is not a known source folder. Use only ${SRC_DIRS.join(', ')} under src/ (shared code goes to src/commons).` });
        }
      }

      const viewsDir = path.join(srcDir, 'dsl-views');
      if (isDir(viewsDir)) {
        for (const file of listFiles(viewsDir)) {
          const ext = path.extname(file).toLowerCase();
          if (!VIEW_EXTENSIONS.has(ext)) {
            violations.push({
              file,
              line: 1,
              message: `only .yaml, .yml and .json files are allowed in src/dsl-views, got "${ext || '(no extension)'}". Move code to src/dsl-components (React) or src/backend.`,
            });
          }
        }
      }
    }

    return violations;
  },
};

export default rule;
