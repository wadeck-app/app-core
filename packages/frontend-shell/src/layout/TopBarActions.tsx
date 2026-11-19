import React from 'react';
import { ModuleWidget, widgetsFor } from '../ModuleWidgets.js';
import type { FailedModuleSummary, LoadedModuleSummary } from '../types.js';
import { VersionsMenu } from '../VersionsMenu.js';
import { DateSettingsButton } from '../dates/DateSettingsDialog.js';
import { LockControl } from '../auth/LockControl.js';
import { ThemeControls } from '../theme/ThemeControls.js';

// Right-aligned group shared by every top bar: navbar widgets, date settings, versions menu, theme toggle.
export function TopBarActions({ modules, failed = [] }: { modules: LoadedModuleSummary[]; failed?: FailedModuleSummary[] }): React.ReactElement {
  return (
    <span className="ml-auto flex items-center gap-3">
      {widgetsFor(modules, 'navbar').map((w) => (
        <span key={w.key} className="flex items-center" data-module-widget="navbar" data-module-id={w.moduleId}>
          <ModuleWidget moduleId={w.moduleId} rawYaml={w.rawYaml} slot="navbar" />
        </span>
      ))}
      <LockControl />
      <DateSettingsButton />
      <VersionsMenu modules={modules} failed={failed} />
      <ThemeControls />
    </span>
  );
}
