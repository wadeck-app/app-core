// Whether the app runs in development. The only place that knows how to tell: port this one function (and nothing
// else) to the bundler of the host project. Fails closed: when the environment cannot tell, it is not development, so
// a dev-only tool stays hidden unless the caller forces it explicitly (see AbDock's `enabled`).
export const isDev = (): boolean => Boolean(import.meta.env?.DEV);
