// Mirrors the response shape of GET /api/modules in ../../src/routes/modules.ts.
export interface ResolvedExtensionPoint {
  kind: string;
  slot: string;
  label?: string;
  view: Record<string, unknown>;
  // Decision #26/#28: raw YAML text, required by GenericPageRunner (it parses
  // yamlText itself -- a pre-parsed `view` object is not accepted). Used by both
  // widget and page extension points so either can declare $sources for live data.
  rawYaml: string;
}

export interface LoadedModuleSummary {
  id: string;
  version: string;
  extensionPoints: ResolvedExtensionPoint[];
}

export interface ModulesResponse {
  modules: LoadedModuleSummary[];
}
