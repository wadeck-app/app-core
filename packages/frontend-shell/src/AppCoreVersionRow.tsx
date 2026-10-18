import React from 'react';
import { VersionRow } from './VersionRow.js';
import type { BuildInfoState } from './useBuildInfo.js';

export function AppCoreVersionRow({ build }: { build: BuildInfoState }): React.ReactElement {
  if (build.state === 'loading') {
    return <VersionRow name="app-core">...</VersionRow>;
  }
  if (build.state === 'error') {
    return (
      <VersionRow name="app-core">
        <span className="text-danger">unknown ({build.message})</span>
      </VersionRow>
    );
  }
  const { appCore, commit } = build.info;
  return <VersionRow name="app-core">{commit === undefined ? appCore : `${appCore} (${commit})`}</VersionRow>;
}
