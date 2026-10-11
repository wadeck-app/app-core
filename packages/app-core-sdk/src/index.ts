// Re-exports, never hand-copies, app-core-server's real types/schemas --
// module authors (queue, orchestrator, flow, future daemons) depend on this package
// instead of guessing the contract shape by hand.
export {
  ManifestSchema,
  RegistrationPayloadSchema,
  UnsupportedSourceTypeError,
  parseManifest,
  parseRegistrationPayload,
  type Manifest,
  type ExtensionPoint,
  type RegistrationPayload,
} from '@wadeck-app/app-core-server/manifest';

export {
  createModuleContext,
  type ModuleContext,
} from '@wadeck-app/app-core-server/moduleContext';

export { type ModuleRouteHandler } from '@wadeck-app/app-core-server/moduleRoutes';
