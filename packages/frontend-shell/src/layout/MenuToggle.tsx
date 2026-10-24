import React from 'react';
import { PanelLeft } from 'lucide-react';
import type { MenuState } from './menuMode.js';

// First thing in the top bar, before the brand.
export function MenuToggle({ state, label }: { state: MenuState; label: string }): React.ReactElement {
  const verb = state.visible ? 'Hide' : 'Show';
  return (
    <button
      type="button"
      onClick={state.toggle}
      aria-label={`${verb} ${label}`}
      aria-expanded={state.visible}
      title={`${verb} ${label}`}
      className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted-bg hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <PanelLeft size={18} aria-hidden="true" />
    </button>
  );
}
