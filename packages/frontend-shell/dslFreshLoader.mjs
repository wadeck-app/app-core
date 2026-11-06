// Node module-customization hook (registered by vite.config.ts through module.register). A module imported with a `?dsl=<version>`
// query gets the same query on every relative import it makes, recursively, so the whole graph of the entries generator is
// evaluated again when the version changes instead of coming from the module cache of the running process. Bare imports
// (ts-morph, node:fs...) are left alone: they do not depend on the dsl version.
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const parentQuery = context.parentURL === undefined ? '' : new URL(context.parentURL).search;
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && parentQuery.startsWith('?dsl=') && resolved.url.startsWith('file:') && new URL(resolved.url).search === '') {
    return { ...resolved, url: resolved.url + parentQuery };
  }
  return resolved;
}
