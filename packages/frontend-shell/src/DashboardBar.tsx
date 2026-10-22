import React from 'react';
import { Eye, RefreshCw, Undo2 } from 'lucide-react';
import { RelativeDate } from '@wadeck-app/dsl-ui';
import type { RefreshInterval } from './useDashboardState.js';

export interface ModuleFilterOption {
  id: string;
  title: string;
  count: number;
}

export interface DashboardBarProps {
  // When the dashboard last ran, shown so a stale screen is never mistaken for a live one.
  refreshedAt: number;
  onRefresh: () => void;
  hiddenCount: number;
  onRestore: () => void;
  // Whether the user changed the order of the widgets, and the way back to the default one.
  orderCustomized: boolean;
  onResetOrder: () => void;
  modules: ModuleFilterOption[];
  // The module the dashboard is narrowed to; undefined shows every module.
  filter: string | undefined;
  onFilter: (id: string | undefined) => void;
  interval: RefreshInterval;
  onInterval: (interval: RefreshInterval) => void;
}

const BUTTON =
  'inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-content transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const SEGMENT = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const segmentClass = (active: boolean): string => `${SEGMENT} ${active ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg-secondary'}`;

// The strip above the widgets, which stays at the top of the page while the widgets scroll under it: the module filter
// (one connected control, each module with the number of its widgets), when the data is from, an automatic refresh and a
// refresh button, and the ways back from what the user changed (hidden widgets, a custom order).
export function DashboardBar(props: DashboardBarProps): React.ReactElement {
  const { refreshedAt, onRefresh, hiddenCount, onRestore, orderCustomized, onResetOrder, modules, filter, onFilter, interval, onInterval } = props;
  return (
    <div role="toolbar" aria-label="Dashboard controls" className="sticky top-0 z-10 -mx-2 mb-4 flex flex-wrap items-center gap-2 border-b border-border bg-bg px-2 py-2">
      {modules.length > 1 ? (
        <div role="group" aria-label="Show widgets of" className="inline-flex divide-x divide-border overflow-hidden rounded-md border border-border bg-surface">
          <button type="button" aria-pressed={filter === undefined} className={segmentClass(filter === undefined)} onClick={() => onFilter(undefined)}>
            All
          </button>
          {modules.map((m) => (
            <button key={m.id} type="button" aria-pressed={filter === m.id} className={segmentClass(filter === m.id)} onClick={() => onFilter(filter === m.id ? undefined : m.id)}>
              {`${m.title} (${m.count})`}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {orderCustomized ? (
          <button type="button" className={BUTTON} onClick={onResetOrder}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Reset order
          </button>
        ) : null}
        {hiddenCount > 0 ? (
          <button type="button" className={BUTTON} onClick={onRestore}>
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {`Show ${hiddenCount} hidden`}
          </button>
        ) : null}
        <span className="text-xs text-muted">
          Updated <RelativeDate date={refreshedAt} live tooltip />
        </span>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Auto-refresh
          <select
            className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={interval}
            onChange={(e) => onInterval(e.target.value as RefreshInterval)}
          >
            <option value="off">Off</option>
            <option value="30s">30 s</option>
            <option value="1m">1 min</option>
            <option value="5m">5 min</option>
          </select>
        </label>
        <button type="button" className={BUTTON} onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>
    </div>
  );
}
