import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton, useTheme } from '@wadeck-app/dsl-ui';
import { ModuleWidget, widgetsFor } from '../ModuleWidgets.js';
import type { FailedModuleSummary, LoadedModuleSummary } from '../types.js';
import { VersionsMenu } from '../VersionsMenu.js';

// Right-aligned group shared by every top bar: navbar widgets, versions menu, theme toggle.
export function TopBarActions({ modules, failed = [] }: { modules: LoadedModuleSummary[]; failed?: FailedModuleSummary[] }): React.ReactElement {
  const { theme, setTheme } = useTheme();
  return (
    <span className="ml-auto flex items-center gap-3">
      {widgetsFor(modules, 'navbar').map((w) => (
        <span key={w.key} className="flex items-center" data-module-widget="navbar" data-module-id={w.moduleId}>
          <ModuleWidget moduleId={w.moduleId} rawYaml={w.rawYaml} slot="navbar" />
        </span>
      ))}
      <VersionsMenu modules={modules} failed={failed} />
      <IconButton
        icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        variant="ghost"
        size="icon-sm"
      />
    </span>
  );
}
