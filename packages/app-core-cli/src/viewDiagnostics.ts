import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findUnknownKeys, type DslKeysManifest } from '@wadeck-app/dsl-renderer/build/unknownKeys';
import knownKeys from '@wadeck-app/dsl-ui/known-keys.json' with { type: 'json' };

// What `check` compiles the views of a module against: the known keys of dsl-ui's components (bundled with this CLI, so it is the dsl-ui of the shell
// this CLI serves) and the host contexts that shell provides (`providedContexts` of its build-info.json).
export interface ViewCheckContext {
  providedContexts: string[];
}

export interface ViewProblem {
  problem: string;
  fix: string;
}

const MANIFEST = knownKeys as unknown as DslKeysManifest;

// Warnings of the compiler that still stop a module: a context the shell lacks, and "nobody told the compiler what the shell provides" (this
// CLI always does, so seeing it means a bug here; it must not pass silently). Compared as text: the second code exists from dsl-ui 404.
const BLOCKING_WARNINGS: ReadonlySet<string> = new Set(['missing-host-context', 'host-contexts-unchecked']);

// Where the build-info.json of the bundled shell is: next to the bundle (`dist/public`), or, when this runs from the sources (tests), in the
// `dist/public` of the package. Neither found is an error that says what to build, never a silent "nothing provided" or "everything provided".
export function loadViewCheckContext(from: string = path.dirname(fileURLToPath(import.meta.url))): ViewCheckContext {
  const candidates = [path.join(from, 'public', 'build-info.json'), path.join(from, '..', 'dist', 'public', 'build-info.json')];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (file === undefined) {
    throw new Error(`The build-info.json of the bundled shell was not found (looked in ${candidates.join(' and ')}), so the views cannot be checked against the host contexts it provides. Build the CLI ("npm run build:full" in app-core) or reinstall it.`);
  }
  const info = JSON.parse(fs.readFileSync(file, 'utf8')) as { providedContexts?: unknown };
  if (!Array.isArray(info.providedContexts) || !info.providedContexts.every((name) => typeof name === 'string')) {
    throw new Error(`${file} has no "providedContexts" list (the shell was built before it was written): rebuild the CLI ("npm run build:full" in app-core).`);
  }
  return { providedContexts: info.providedContexts };
}

// Findings of the DSL compiler for one parsed view that stop a module from shipping: every error, and the two warnings that mean a context
// is missing or was not checked (`missing-host-context`, `host-contexts-unchecked`). Types of other modules ("<module>:<Name>") are not judged,
// and when the module has components of its own (`ownComponents`) their types cannot be told from a typo, so unknown types are left alone.
export function viewProblems(doc: Record<string, unknown>, context: ViewCheckContext, ownComponents: boolean): ViewProblem[] {
  const diagnostics = findUnknownKeys(doc, MANIFEST, {
    providedContexts: context.providedContexts,
    skipType: (type) => type.includes(':') || (ownComponents && MANIFEST[type] === undefined),
  });
  return diagnostics
    .filter((d) => d.severity === 'error' || BLOCKING_WARNINGS.has(d.code))
    .map((d) => ({ problem: `[${d.code}] ${d.type} at ${d.nodePath}: ${d.message}`, fix: `Fix the node ${d.nodePath} (${d.type}) as the message says.` }));
}
