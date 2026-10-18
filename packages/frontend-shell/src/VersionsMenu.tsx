import React from 'react';
import { Info } from 'lucide-react';
import * as RadixPopover from '@radix-ui/react-popover';
import { IconButton } from '@wadeck-app/dsl-ui';
import { AppCoreVersionRow } from './AppCoreVersionRow.js';
import { VersionRow } from './VersionRow.js';
import { useBuildInfo } from './useBuildInfo.js';
import type { FailedModuleSummary, LoadedModuleSummary } from './types.js';

// Read-only list of what is installed: app-core, every loaded module, the modules that failed to
// load, and the libraries the shell was built with (the ones module bundles share).
//
// Radix directly, not dsl-ui's Popover: that one wraps its trigger in a `display: contents` span,
// which has no box, so the panel is anchored at the page's top-left corner instead of under the icon.
export function VersionsMenu({ modules, failed }: { modules: LoadedModuleSummary[]; failed: FailedModuleSummary[] }): React.ReactElement {
  const build = useBuildInfo();
  const failedOnly = failed.filter((f) => !modules.some((m) => m.id === f.id));

  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>
        <IconButton icon={<Info size={14} />} aria-label="Versions" variant="ghost" size="icon-sm" />
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          role="dialog"
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 rounded-lg border border-border bg-surface p-4 shadow-lg outline-none"
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
          <RadixPopover.Arrow className="fill-border" />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
