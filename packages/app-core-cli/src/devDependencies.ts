import { LINK_USAGE, locateProvider, type Links } from './providers.js';

export interface DevDependency {
  id: string;
  version: string;
  manifestPath: string;
  packageName: string;
  // The package folder the built module was found in.
  root: string;
  via: 'link' | 'node_modules';
  // Module ids that require it (the module under development included), in discovery order.
  requiredBy: string[];
}

export interface DevRoot {
  id: string;
  // The package folder of the module under development (holds package.json), not its dist-module.
  dir: string;
  requires: string[];
}

// Resolves every module `root` requires, transitively, to a built package (dist-module/manifest.json).
// Each dependency's own requires are resolved from the dependency's own folder with the same links. The
// result lists dependencies before the modules that need them, each id once (first location found wins).
// Throws, naming the id and the fix, on a missing or unbuilt package and on a require cycle.
export function resolveDevDependencies(root: DevRoot, links: Links): DevDependency[] {
  const resolved = new Map<string, DevDependency>();
  const ordered: DevDependency[] = [];

  const visit = (owner: { id: string; dir: string; requires: string[] }, trail: string[]): void => {
    for (const requiredId of owner.requires) {
      const cycleStart = trail.indexOf(requiredId);
      if (cycleStart !== -1) {
        throw new Error(
          `Module require cycle: ${[...trail.slice(cycleStart), requiredId].join(' -> ')}. Remove one of the "requires" in the cycle (extract what the modules share into a third module).`,
        );
      }
      const known = resolved.get(requiredId);
      if (known !== undefined) {
        known.requiredBy.push(owner.id);
        continue;
      }
      const location = locateProvider(owner.dir, requiredId, links);
      if (!location.found) {
        if (location.sourceRoot !== undefined) {
          throw new Error(
            `Module "${requiredId}" (required by "${owner.id}") is a source module in ${location.sourceRoot} and has not been built, dev does not package dependencies. ` +
              `Build it first ("app-core-cli package ${location.sourceRoot} --version <v>"), then run dev again.`,
          );
        }
        throw new Error(
          `Module "${requiredId}" (required by "${owner.id}") has no built package to register: ${location.why}. ` +
            `Fix: install the package that provides it, build it ("app-core-cli package <its folder> --version <v>"), or pass ${LINK_USAGE} to point at its folder.`,
        );
      }
      const { located } = location;
      const dependency: DevDependency = {
        id: requiredId,
        version: located.manifest.version,
        manifestPath: located.manifestPath,
        packageName: located.packageName,
        root: located.root,
        via: located.via,
        requiredBy: [owner.id],
      };
      resolved.set(requiredId, dependency);
      visit({ id: requiredId, dir: located.root, requires: Object.keys(located.manifest.requires ?? {}) }, [...trail, requiredId]);
      ordered.push(dependency);
    }
  };

  visit(root, [root.id]);
  return ordered;
}
