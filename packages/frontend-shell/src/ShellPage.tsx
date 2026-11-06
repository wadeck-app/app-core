import React, { useMemo } from 'react';
import { GenericPageRunner, type Fetcher } from '@wadeck-app/dsl-renderer';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';

// A page of the app itself (Modules, A/B tests) written like the pages of the modules: a DSL view run by the same renderer with
// the same components, so it looks and behaves like them. Its data comes from the shell, not from a route: a source whose
// url is `GET shell:<name>` is answered from `data`; every other url goes to the usual fetcher.
export function ShellPage({ yaml, data }: { yaml: string; data: Record<string, unknown> }): React.ReactElement {
  const shellFetcher = useMemo<Fetcher>(
    () =>
      (url, params, body, headers) => {
        const match = /^(?:GET\s+)?shell:([\w-]+)$/.exec(url);
        if (match === null) {
          return fetcher(url, params, body, headers);
        }
        const name = match[1] as string;
        return name in data ? Promise.resolve(data[name]) : Promise.reject(new Error(`The shell has no data named "${name}" for this page (known: ${Object.keys(data).join(', ') || 'none'}).`));
      },
    [data],
  );
  // The sources are read when the page is mounted: it is mounted again when the data changes.
  return <GenericPageRunner key={JSON.stringify(data)} yamlText={yaml} registry={appRegistry} fetcher={shellFetcher} />;
}
