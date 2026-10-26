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
  // Sort key within a shell slot (navbar and overlay widgets); entries without it come last.
  order?: number;
  // Size of a dashboard widget in grid cells of 100px, 1 to 12. Absent: 3 wide (more if its content is wider), as tall as its content.
  width?: number;
  height?: number;
  // A page of the side menu: a rule above its entry, with `groupLabel` as the caption of the group that follows.
  separatorBefore?: boolean;
  groupLabel?: string;
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
  // From the manifest's `showInNav`: false keeps the module out of the top bar and the dashboard menu. Absent means true.
  showInNav?: boolean;
  // From the manifest's `title`: the display name. Absent means the shell derives one from the id.
  title?: string;
}

// A registered module that could not be loaded; `error` is the reason, `source` the manifest path.
export interface FailedModuleSummary {
  id: string;
  source: string;
  error: string;
  failedAt: string;
  // "requirement" is retried automatically by the server, "error" is not.
  cause?: string;
}

export interface ModulesResponse {
  modules: LoadedModuleSummary[];
  failed?: FailedModuleSummary[];
}
