import React from 'react';
import { InitialsTile, initialsOf } from '@wadeck-app/dsl-ui';
import { moduleColor } from './Logo.js';

// A page's tile in the rail, where its label is hidden: the initials of the page, the label as the tooltip.
export function PageTile({ label, moduleId }: { label: string; moduleId: string }): React.ReactElement {
  return (
    <span title={label}>
      <InitialsTile text={initialsOf(label)} color={moduleColor(moduleId)} />
    </span>
  );
}
