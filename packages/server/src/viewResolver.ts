import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import type { ExtensionPoint } from './manifest.js';

// Decision #8/#16: a module's UI is DSL view data (YAML/JSON with a `$type`
// discriminator), never code. Resolving it is just reading+parsing data --
// no module loading, no React. Actual rendering (DslRenderer/GenericPageRunner)
// is a frontend (browser/React) concern -- see Phase 1 report for why this
// backend only resolves and serves the view JSON, it does not invoke React.
export function resolveView(ep: ExtensionPoint, manifestDir: string): unknown {
  if (ep.view.type === 'inline') {
    return ep.view.value;
  }
  const viewPath = path.resolve(manifestDir, String(ep.view.value));
  const raw = fs.readFileSync(viewPath, 'utf8');
  return parseYaml(raw);
}

// Decision #26: `page`/`nav` extension points may use `$sources` for live data,
// which dsl-renderer's GenericPageRunner only accepts as raw YAML text (it parses
// yamlText itself, confirmed via dsl-view source) -- a pre-parsed JS object (what
// resolveView returns) is not accepted. For inline views there is no YAML source
// text to read back, so it is reconstructed via js-yaml's dump() -- round-tripping
// through dump() is lossless enough for GenericPageRunner's own re-parse.
export function resolveRawYaml(ep: ExtensionPoint, manifestDir: string): string {
  if (ep.view.type === 'inline') {
    return dumpYaml(ep.view.value);
  }
  const viewPath = path.resolve(manifestDir, String(ep.view.value));
  return fs.readFileSync(viewPath, 'utf8');
}
