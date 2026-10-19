import React from 'react';
import { GenericPageRunner } from '@wadeck-app/dsl-renderer';
import { appRegistry } from './registry.js';
import { fetcher } from './fetcher.js';

// The one place a module view (page, dashboard widget, navbar/overlay widget) is run: the shared registry and fetcher.
// The feedback of its actions (success, failure) goes through the NotifierProvider mounted once in App (ShellNotifier).
export function ModuleView({ rawYaml }: { rawYaml: string }): React.ReactElement {
  return <GenericPageRunner yamlText={rawYaml} registry={appRegistry} fetcher={fetcher} />;
}
