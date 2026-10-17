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
}

export interface LoadedModuleSummary {
  id: string;
  version: string;
  extensionPoints: ResolvedExtensionPoint[];
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
