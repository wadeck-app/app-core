declare global {
  // eslint-disable-next-line no-var
  var __APP_CORE_SHARED__: Record<string, unknown> | undefined;
}

let pending: Promise<void> | undefined;

// Module bundles (dsl-lib) are built with these packages externalized and read them from
// globalThis.__APP_CORE_SHARED__, so the shell and every module share one React, one router and
// one dsl-ui. Loaded on demand (dynamic imports keep the namespaces out of the main chunk, whose
// tree-shaking and lazy chunks they would defeat) and resolved to the very same module instances the shell
// itself uses. Must complete before any module bundle is imported.
export function ensureSharedGlobals(): Promise<void> {
  pending ??= (async () => {
    const [react, jsxRuntime, reactDom, reactDomClient, reactRouterDom, dslUi, dslRenderer] = await Promise.all([
      import('react'),
      import('react/jsx-runtime'),
      import('react-dom'),
      import('react-dom/client'),
      import('react-router-dom'),
      import('@wadeck-app/dsl-ui'),
      import('@wadeck-app/dsl-renderer'),
    ]);
    globalThis.__APP_CORE_SHARED__ = {
      react,
      'react/jsx-runtime': jsxRuntime,
      'react-dom': reactDom,
      'react-dom/client': reactDomClient,
      'react-router-dom': reactRouterDom,
      '@wadeck-app/dsl-ui': dslUi,
      '@wadeck-app/dsl-renderer': dslRenderer,
    };
  })();
  return pending;
}
