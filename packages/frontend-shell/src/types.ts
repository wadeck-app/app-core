// Mirrors the response shape of GET /api/modules in ../../src/routes/modules.ts.
export interface ResolvedExtensionPoint {
  kind: string;
  slot: string;
  label?: string;
  view: Record<string, unknown>;
  // Raw YAML text, required by GenericPageRunner (it parses yamlText itself --
  // a pre-parsed `view` object is not accepted). Used by both widget and page
  // extension points so either can declare $sources for live data.
  rawYaml: string;
  // Route of a page, mounted at /modules/<moduleId><path>; `:name` segments reach the view as $route.<name>.
  path?: string;
}

// Runtime-loaded components of a module (its dsl-lib folder), cache-busted URLs served by app-core.
export interface ModuleDslLib {
  entryUrl: string;
  cssUrl?: string;
}

export interface LoadedModuleSummary {
  id: string;
  version: string;
  extensionPoints: ResolvedExtensionPoint[];
  dslLib?: ModuleDslLib;
}

// A registered module that could not be loaded; `error` is the reason, `source` the manifest path.
export interface FailedModuleSummary {
  id: string;
  source: string;
  error: string;
  failedAt: string;
}

export interface ModulesResponse {
  modules: LoadedModuleSummary[];
  failed?: FailedModuleSummary[];
}
