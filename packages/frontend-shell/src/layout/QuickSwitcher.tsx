import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@wadeck-app/dsl-ui';
import { Logo } from './Logo.js';
import type { NavModule } from './navModel.js';

export interface SwitcherEntry {
  routePath: string;
  label: string;
  moduleId: string;
  moduleTitle: string;
}

// Every page of every module (a page contributed to another module's menu is listed under that module), plus the dashboard.
export function switcherEntries(navModules: NavModule[]): SwitcherEntry[] {
  return [
    { routePath: '/', label: 'Dashboard', moduleId: '__dashboard', moduleTitle: 'Dashboard' },
    ...navModules.flatMap((m) => m.pages.map((p) => ({ routePath: p.routePath, label: p.label, moduleId: m.id, moduleTitle: m.title }))),
  ];
}

// Entries whose module or page contains every word typed, best first (a label that starts with the query, then the rest).
export function filterEntries(entries: SwitcherEntry[], query: string): SwitcherEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) {
    return entries;
  }
  const matching = entries.filter((e) => {
    const haystack = `${e.moduleTitle} ${e.label}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  const starts = (e: SwitcherEntry): number => (e.label.toLowerCase().startsWith(words[0] ?? '') ? 0 : 1);
  // Array.sort is stable: the menu order is kept inside each group.
  return [...matching].sort((a, b) => starts(a) - starts(b));
}

// Ctrl+K (Cmd+K on a Mac) toggles the switcher from anywhere on the page.
export function useSwitcherShortcut(enabled: boolean, toggle: () => void): void {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, toggle]);
}

// A dialog to jump to any page: type, move with the arrows, Enter to go.
export function QuickSwitcher({ navModules, open, onOpenChange }: { navModules: NavModule[]; open: boolean; onOpenChange: (open: boolean) => void }): React.ReactElement {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const entries = useMemo(() => switcherEntries(navModules), [navModules]);
  const results = filterEntries(entries, query);
  const selected = Math.min(index, Math.max(0, results.length - 1));

  // A fresh search each time it opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const go = (entry: SwitcherEntry | undefined): void => {
    if (entry !== undefined) {
      onOpenChange(false);
      navigate(entry.routePath);
    }
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(Math.min(selected + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(Math.max(selected - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[selected]);
    }
  };

  return (
    <Dialog title="Go to" open={open} onOpenChange={onOpenChange} size="md">
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="quick-switcher-results"
        aria-activedescendant={results[selected] === undefined ? undefined : `quick-switcher-${selected}`}
        aria-label="Search pages"
        placeholder="Type a module or a page"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={onKeyDown}
        className="mb-2 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <ul id="quick-switcher-results" role="listbox" aria-label="Pages" className="max-h-80 overflow-y-auto">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted">{`No page matches "${query}".`}</li>
        ) : (
          results.map((entry, i) => (
            <li
              key={entry.routePath}
              id={`quick-switcher-${i}`}
              role="option"
              aria-selected={i === selected}
              className={`flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm ${i === selected ? 'bg-primary-light text-primary' : 'text-content hover:bg-bg-secondary'}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(entry)}
            >
              {entry.moduleId === '__dashboard' ? null : <Logo title={entry.moduleTitle} moduleId={entry.moduleId} />}
              <span className="font-medium">{entry.label}</span>
              {entry.moduleId === '__dashboard' ? null : <span className="ml-auto text-xs text-muted">{entry.moduleTitle}</span>}
            </li>
          ))
        )}
      </ul>
    </Dialog>
  );
}
