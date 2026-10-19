import { useEffect, useState } from 'react';
import { pushRecent, type RecentPage } from './navHelpers.js';
import { activeNavModule, activeNavPage, type NavModule } from './navModel.js';

const STORAGE_KEY = 'app-core.recent-pages';
export const MAX_RECENT = 6;

function read(): RecentPage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as RecentPage[]);
  } catch (err) {
    console.warn(`[nav] cannot read "${STORAGE_KEY}" from localStorage: ${String(err)}. The recent pages start over.`);
    return [];
  }
}

// The menu pages the user opened last, newest first, kept in this browser (localStorage).
export function useRecentPages(pathname: string, navModules: NavModule[]): RecentPage[] {
  const [recent, setRecent] = useState<RecentPage[]>(read);

  useEffect(() => {
    const module = activeNavModule(pathname, navModules);
    const page = module === undefined ? undefined : activeNavPage(pathname, module);
    if (module === undefined || page === undefined) {
      return;
    }
    setRecent((previous) => {
      const next = pushRecent(previous, { routePath: page.routePath, label: page.label, moduleId: module.id }, MAX_RECENT);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn(`[nav] cannot save "${STORAGE_KEY}" to localStorage: ${String(err)}. The recent pages are lost on reload.`);
      }
      return next;
    });
  }, [pathname, navModules]);

  return recent;
}
