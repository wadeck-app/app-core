import React from 'react';
import { Search } from 'lucide-react';

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

// The top bar button that opens the switcher, with the shortcut written on it.
export function SwitcherButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open the quick switcher"
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs text-muted transition-colors hover:bg-bg-secondary hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="rounded border border-border px-1 font-sans text-[10px]">{isMac() ? 'Cmd K' : 'Ctrl K'}</kbd>
    </button>
  );
}
