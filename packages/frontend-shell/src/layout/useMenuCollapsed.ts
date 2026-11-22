import { useCallback, useEffect, useState } from 'react';

export const MENU_COLLAPSED_KEY = 'app-core.menu-collapsed';

// The pages whose side menu the user hid, by page id (`<moduleId><path>`), in this browser: app-core has no user account to keep it with.
function read(): Record<string, true> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(MENU_COLLAPSED_KEY);
  } catch (err) {
    console.warn(`[nav] cannot read "${MENU_COLLAPSED_KEY}" from localStorage: ${String(err)}. The side menu is shown on every page.`);
    return {};
  }
  if (raw === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('it is not an object of page ids');
    }
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === true)) as Record<string, true>;
  } catch (err) {
    console.warn(`[nav] "${MENU_COLLAPSED_KEY}" in localStorage is not usable (${String(err)}). The side menu is shown on every page; hide it again to rewrite it.`);
    return {};
  }
}

// Whether the user hid the side menu on the page `pageId`, and the way to flip it. `pageId` undefined (a page that does not declare a
// collapsible menu): never hidden. Another tab that changes the choice changes it here too.
export function useMenuCollapsed(pageId: string | undefined): { collapsed: boolean; toggle: () => void } {
  const [stored, setStored] = useState<Record<string, true>>(read);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === MENU_COLLAPSED_KEY) {
        setStored(read());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => {
    if (pageId === undefined) {
      return;
    }
    // From what is stored now, not from what this render saw: another tab may have changed other pages meanwhile.
    const next = { ...read() };
    if (next[pageId] === true) {
      delete next[pageId];
    } else {
      next[pageId] = true;
    }
    setStored(next);
    try {
      window.localStorage.setItem(MENU_COLLAPSED_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn(`[nav] cannot save "${MENU_COLLAPSED_KEY}" to localStorage: ${String(err)}. The menu comes back after a reload.`);
    }
  }, [pageId]);

  return { collapsed: pageId !== undefined && stored[pageId] === true, toggle };
}
