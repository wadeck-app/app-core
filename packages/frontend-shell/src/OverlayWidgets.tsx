import React from 'react';
import { ModuleWidget, widgetsFor } from './ModuleWidgets.js';
import type { LoadedModuleSummary } from './types.js';

// Shell slot widget/overlay: each widget is mounted once at the app root; it positions itself (e.g. fixed).
export function OverlayWidgets({ modules }: { modules: LoadedModuleSummary[] }): React.ReactElement {
  return (
    <>
      {widgetsFor(modules, 'overlay').map((w) => (
        <div key={w.key} className="contents" data-module-widget="overlay" data-module-id={w.moduleId}>
          <ModuleWidget moduleId={w.moduleId} rawYaml={w.rawYaml} slot="overlay" />
        </div>
      ))}
    </>
  );
}
