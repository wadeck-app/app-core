import React from 'react';
import { Eye, RefreshCw, Undo2 } from 'lucide-react';
import { ChipButton, RelativeDate } from '@wadeck-app/dsl-ui';
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

// The strip above the widgets: a filter per module, when the data is from, an automatic refresh and a refresh button,
// and the ways back from what the user changed (hidden widgets, a custom order).
export function DashboardBar(props: DashboardBarProps): React.ReactElement {
  const { refreshedAt, onRefresh, hiddenCount, onRestore, orderCustomized, onResetOrder, modules, filter, onFilter, interval, onInterval } = props;
  return (
    <div role="toolbar" aria-label="Dashboard controls" className="mb-4 flex flex-wrap items-center gap-2">
      {modules.length > 1 ? (
        <div role="group" aria-label="Show widgets of" className="flex flex-wrap items-center gap-1">
          <ChipButton active={filter === undefined} onClick={() => onFilter(undefined)}>
            All
          </ChipButton>
          {modules.map((m) => (
            <ChipButton key={m.id} active={filter === m.id} onClick={() => onFilter(filter === m.id ? undefined : m.id)}>
              {`${m.title} ${m.count}`}
            </ChipButton>
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
