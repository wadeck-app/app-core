import React from 'react';
import { Info } from 'lucide-react';
import { IconButton, Popover, useAbExperiments } from '@wadeck-app/dsl-ui';
import { AbTestsSection } from './AbTestsSection.js';
import { AppCoreVersionRow } from './AppCoreVersionRow.js';
import { VersionRow } from './VersionRow.js';
import { useBuildInfo } from './useBuildInfo.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

// Read-only list of what is installed: app-core, every loaded module, the modules that failed to
// load, and the libraries the shell was built with (the ones module bundles share).
export function VersionsMenu({ modules, failed }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[] }): React.ReactElement {
  const build = useBuildInfo();
  // On in development and with `app-core-cli serve --ab-tests`: the host of the dock says so, whatever the reason.
  const abTests = useAbExperiments()?.enabled === true;
  const failedOnly = failed.filter((f) => !modules.some((m) => m.id === f.id));

  return (
    <Popover
      side="bottom"
      align="end"
      trigger={<IconButton icon={<Info size={14} />} aria-label="Versions" variant="ghost" size="icon-sm" />}
    >
      <div className="min-w-72 text-sm">
        <h3 className="mb-1 font-semibold text-content">Versions</h3>
        <dl>
          <AppCoreVersionRow build={build} />
        </dl>

        <h4 className="mb-1 mt-3 font-semibold text-content">Modules</h4>
        {modules.length === 0 && failedOnly.length === 0 ? <p className="text-muted">No module installed.</p> : null}
        <dl>
          {modules.map((m) => (
            <VersionRow key={m.id} name={m.id}>
              {m.version}
            </VersionRow>
          ))}
          {failedOnly.map((f) => (
            <VersionRow key={f.id} name={f.id}>
              <span className="text-danger">failed to load</span>
            </VersionRow>
          ))}
        </dl>

        {abTests ? (
          <p className="mt-3 text-muted">A/B tests are on: the dock is at the bottom of the page.</p>
        ) : null}

        <AbTestsSection />

        {build.state === 'ready' ? (
          <>
            <h4 className="mb-1 mt-3 font-semibold text-content">Frontend built with</h4>
            <dl>
              <VersionRow name="dsl-ui">{build.info.dslUi}</VersionRow>
              <VersionRow name="dsl-renderer">{build.info.dslRenderer}</VersionRow>
              <VersionRow name="react">{build.info.react}</VersionRow>
              <VersionRow name="built">{build.info.builtAt}</VersionRow>
            </dl>
          </>
        ) : null}
      </div>
    </Popover>
  );
}
