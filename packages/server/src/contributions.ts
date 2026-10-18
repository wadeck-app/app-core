import semver from 'semver';
import type { ModuleExpose } from './manifest.js';
import { splitCustomSlot } from './slotIds.js';

// What a contribution is validated against (decision 82). Pure: the server feeds it the loaded modules,
// the CLI feeds it the provider found in node_modules, so both reject the same things.

export interface ProviderInfo {
  version?: string;
  expose?: ModuleExpose;
}

export type ProviderLookup = { found: true; provider: ProviderInfo } | { found: false; why: string; fix: string };

export interface Contribution {
  // Index in the manifest's extensionPoints, for the message.
  index: number;
  slot: string;
  // `$type` of the root node of the contributed view; undefined when the view has none.
  rootType: string | undefined;
}

export interface ContributionProblem {
  // `manifest`: fix manifest.json. `view`: fix the contributed view itself.
  about: 'manifest' | 'view';
  extensionPointIndex?: number;
  problem: string;
  fix: string;
}

export interface ValidateContributionsInput {
  moduleId: string;
  requires: Record<string, string> | undefined;
  contributions: Contribution[];
  // The module's own `expose`, for contributions to its own slots.
  selfExpose?: ModuleExpose;
  lookup: (providerId: string) => ProviderLookup;
  // load: every required module must be loaded and satisfy its range. package: only the providers the
  // module contributes to are looked up, and versions are not compared (a package is built before it is installed).
  mode: 'load' | 'package';
}

// The `$type` of a view's root node; children are deliberately not looked at.
export function rootTypeOf(view: unknown): string | undefined {
  if (typeof view !== 'object' || view === null) {
    return undefined;
  }
  const type = (view as { $type?: unknown }).$type;
  return typeof type === 'string' ? type : undefined;
}

function checkRequiredProvider(id: string, range: string, input: ValidateContributionsInput, problems: ContributionProblem[]): boolean {
  const result = input.lookup(id);
  if (!result.found) {
    problems.push({ about: 'manifest', problem: `requires "${id}" ${JSON.stringify(range)}: ${result.why}`, fix: result.fix });
    return false;
  }
  const version = result.provider.version;
  if (version === undefined) {
    return true;
  }
  if (semver.valid(version) === null) {
    problems.push({
      about: 'manifest',
      problem: `requires "${id}" ${JSON.stringify(range)} but the loaded version of "${id}", "${version}", is not a valid semver version, so it cannot be matched`,
      fix: `Re-package "${id}" with a semver version (for example 1.2.3), then register it again.`,
    });
    return false;
  }
  if (!semver.satisfies(version, range, { includePrerelease: true })) {
    problems.push({
      about: 'manifest',
      problem: `requires "${id}" ${JSON.stringify(range)} but version ${version} of "${id}" is loaded`,
      fix: `Register a version of "${id}" that satisfies ${range}, or change "requires" in this module's manifest.json to a range that includes ${version}.`,
    });
    return false;
  }
  return true;
}

function checkContribution(contribution: Contribution, input: ValidateContributionsInput, unusable: Set<string>, problems: ContributionProblem[]): void {
  const custom = splitCustomSlot(contribution.slot);
  if (custom === undefined) {
    return;
  }
  const { providerId, local } = custom;
  const where = `extensionPoints[${contribution.index}]`;
  let expose: ModuleExpose | undefined;
  let providerVersion = '';

  if (providerId === input.moduleId) {
    expose = input.selfExpose;
  } else {
    if (input.requires?.[providerId] === undefined) {
      problems.push({
        about: 'manifest',
        extensionPointIndex: contribution.index,
        problem: `${where} contributes to "${contribution.slot}" but "requires" does not list "${providerId}"`,
        fix: `Add "requires": { "${providerId}": "^1.0.0" } to manifest.json (use the range of the ${providerId} versions you built against).`,
      });
      return;
    }
    // Already reported by the requires check (load mode): do not repeat it for each contribution.
    if (unusable.has(providerId)) {
      return;
    }
    const result = input.lookup(providerId);
    if (!result.found) {
      problems.push({
        about: 'manifest',
        extensionPointIndex: contribution.index,
        problem: `${where} contributes to "${contribution.slot}" but ${result.why}`,
        fix: result.fix,
      });
      return;
    }
    expose = result.provider.expose;
    providerVersion = result.provider.version === undefined ? '' : ` (version ${result.provider.version})`;
  }

  const slot = expose?.slots?.[local];
  if (slot === undefined) {
    const exposed = Object.keys(expose?.slots ?? {});
    problems.push({
      about: 'manifest',
      extensionPointIndex: contribution.index,
      problem: `${where} contributes to "${contribution.slot}" but module "${providerId}"${providerVersion} does not expose the slot "${local}"`,
      fix:
        exposed.length === 0
          ? `Module "${providerId}" exposes no slot: add \`"expose": { "slots": { "${local}": { "accepts": ["<$type>"] } } }\` to its manifest.json, or contribute elsewhere.`
          : `Contribute to one of the slots "${providerId}" exposes (${exposed.map((s) => `${providerId}:${s}`).join(', ')}), or have it expose "${local}" in its manifest.json "expose.slots".`,
    });
    return;
  }
  if (contribution.rootType === undefined) {
    problems.push({
      about: 'view',
      extensionPointIndex: contribution.index,
      problem: `${where} contributes a view with no root $type to "${contribution.slot}", which accepts only: ${slot.accepts.join(', ')}`,
      fix: `Start the view with \`$type: ${slot.accepts[0] ?? '<Component>'}\` (one of ${slot.accepts.join(', ')}). Only the root $type is checked, not its children.`,
    });
  } else if (!slot.accepts.includes(contribution.rootType)) {
    problems.push({
      about: 'view',
      extensionPointIndex: contribution.index,
      problem: `${where} contributes a "${contribution.rootType}" to "${contribution.slot}", which accepts only: ${slot.accepts.join(', ')}`,
      fix: `Change the root $type of the view to one of ${slot.accepts.join(', ')}, or contribute it to a slot that accepts "${contribution.rootType}". Only the root $type is checked, not its children.`,
    });
  }
}

// Checks the `requires` of a module and its contributions to custom slots. Returns every problem found,
// each with its fix, so one run shows the whole to-do list.
export function validateContributions(input: ValidateContributionsInput): ContributionProblem[] {
  const problems: ContributionProblem[] = [];
  const unusable = new Set<string>();

  for (const [id, range] of Object.entries(input.requires ?? {})) {
    if (semver.validRange(range) === null) {
      problems.push({
        about: 'manifest',
        problem: `requires "${id}" has an invalid semver range ${JSON.stringify(range)}`,
        fix: 'Use a semver range such as "^1.0.0", ">=1.2.0 <2" or "*".',
      });
      unusable.add(id);
    } else if (input.mode === 'load' && !checkRequiredProvider(id, range, input, problems)) {
      unusable.add(id);
    }
  }

  for (const contribution of input.contributions) {
    checkContribution(contribution, input, unusable, problems);
  }
  return problems;
}

// One message for a thrown error: the module, then each problem with its fix. `heading` completes
// `module "<id>" ...` (default: it cannot load).
export function formatContributionProblems(moduleId: string, problems: ContributionProblem[], heading = 'cannot load'): string {
  const lines = problems.flatMap((p) => [`  - ${p.problem}`, `    Fix: ${p.fix}`]);
  return [`module "${moduleId}" ${heading}: ${problems.length} problem(s) with its requires/slots`, ...lines].join('\n');
}
