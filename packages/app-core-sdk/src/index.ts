// violations-suppress: ts/no-barrel-index public API entry point of the published package (bundled to dist/index.bundle.js), consumed by its package name
// Re-exports, never hand-copies, app-core-server's real types/schemas --
// module authors (queue, orchestrator, flow, future daemons) depend on this package
// instead of guessing the contract shape by hand.
export {
  ManifestSchema,
  SourceManifestSchema,
  RegistrationPayloadSchema,
  UnsupportedSourceTypeError,
  parseManifest,
  parseSourceManifest,
  parseRegistrationPayload,
  type Manifest,
  type SourceManifest,
  type ExtensionPoint,
  type ModuleExpose,
  type ModuleRequires,
  type ModuleLifecycle,
  type RegistrationPayload,
} from '@wadeck-app/app-core-server/manifest';

export {
  createModuleContext,
  type ModuleContext,
  type ModuleHookContext,
  type ModuleLifecycleHook,
  type ModuleTeardownHook,
  type ModuleTeardownContext,
  type ModuleTeardownReason,
  type ModuleSetup,
  type ModuleTimerHandle,
} from '@wadeck-app/app-core-server/moduleContext';

export { type ModuleRouteHandler } from '@wadeck-app/app-core-server/moduleRoutes';
