import React from 'react';
import { menuClasses, type MenuMode, type MenuState } from './menuMode.js';

// The page, with the menu's behaviour. A backdrop closes the drawer when the user taps outside it.
export function MenuFrame({ mode, state, children }: { mode: MenuMode; state: MenuState; children: React.ReactNode }): React.ReactElement {
  return (
    <div className={menuClasses(mode, state)} data-menu-mode={mode} data-menu-visible={String(state.visible)}>
      {mode !== 'fixed' && state.narrow && state.drawerOpen && (
        <div data-testid="menu-backdrop" className="fixed inset-0 top-11 z-20 bg-black/30" onClick={state.closeDrawer} aria-hidden="true" />
      )}
      {children}
    </div>
  );
}
