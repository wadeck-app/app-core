import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export interface TertiaryItem {
  id: string;
  label: string;
  // Sample figures for the placements that show them (a count next to the label, a second line under it).
  count?: number;
  caption?: string;
}

// The A/B test is about WHERE a third level of navigation goes, not about what is in it. No module declares a third level yet (the
// manifest has no such field), so every page of a module gets these sample entries; the choice is kept in the address (?tertiary=).
export const SAMPLE_TERTIARY: readonly TertiaryItem[] = [
  { id: 'summary', label: 'Summary', caption: 'Totals and trends' },
  { id: 'activity', label: 'Activity', count: 12, caption: 'Latest events' },
  { id: 'alerts', label: 'Alerts', count: 3, caption: 'Needs attention' },
  { id: 'settings', label: 'Settings', caption: 'Options of this page' },
];

export const TERTIARY_PARAM = 'tertiary';

export interface TertiaryNav {
  items: readonly TertiaryItem[];
  activeId: string;
  // The address of the current page with this entry selected (the other parameters are kept).
  hrefFor: (id: string) => string;
}

export function useTertiaryNav(): TertiaryNav {
  const { pathname, search } = useLocation();
  return useMemo(() => {
    const current = new URLSearchParams(search).get(TERTIARY_PARAM);
    const activeId = SAMPLE_TERTIARY.some((i) => i.id === current) ? (current as string) : (SAMPLE_TERTIARY[0] as TertiaryItem).id;
    const hrefFor = (id: string): string => {
      const next = new URLSearchParams(search);
      next.set(TERTIARY_PARAM, id);
      return `${pathname}?${next.toString()}`;
    };
    return { items: SAMPLE_TERTIARY, activeId, hrefFor };
  }, [pathname, search]);
}
