import React from 'react';
import { Eye, RefreshCw, Undo2 } from 'lucide-react';
import { ChipButton, RelativeDate } from '@wadeck-app/dsl-ui';
import { moduleColor } from './layout/Logo.js';
import type { RefreshInterval } from './useDashboardState.js';

// Candidate looks of the bar (A/B tests "dashboard-bar" and "dashboard-chips" in Dashboard.tsx).
//   inline     the bar scrolls away with the page
//   sticky     the bar stays at the top of the page while the widgets scroll under it
//   segmented  the module filter is one connected control instead of separate pills
export type DashboardBarStyle = 'inline' | 'sticky' | 'segmented';
//   plain      the module name and its count
//   dots       a dot in the color of the module before its name
export type DashboardChipStyle = 'plain' | 'dots';

export interface ModuleFilterOption {
  id: string;
  title: string;
  count: number;
}

export interface DashboardBarProps {
  barStyle: DashboardBarStyle;
  chipStyle: DashboardChipStyle;
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

// The strip above the widgets: a filter per module, when the data is from, an automatic refresh and a refresh button,
// and the ways back from what the user changed (hidden widgets, a custom order).
export function DashboardBar(props: DashboardBarProps): React.ReactElement {
  const { barStyle, chipStyle, refreshedAt, onRefresh, hiddenCount, onRestore, orderCustomized, onResetOrder, modules, filter, onFilter, interval, onInterval } = props;

  const label = (m: ModuleFilterOption): React.ReactNode => (
    <>
      {chipStyle === 'dots' ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: moduleColor(m.id) }} /> : null}
      {`${m.title} ${m.count}`}
    </>
  );
  const pick = (id: string): void => onFilter(filter === id ? undefined : id);

  const filters =
    modules.length < 2 ? null : barStyle === 'segmented' ? (
      <div role="group" aria-label="Show widgets of" className="inline-flex divide-x divide-border overflow-hidden rounded-md border border-border bg-surface">
        <button type="button" aria-pressed={filter === undefined} className={`${SEGMENT} ${filter === undefined ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg-secondary'}`} onClick={() => onFilter(undefined)}>
          All
        </button>
        {modules.map((m) => (
          <button key={m.id} type="button" aria-pressed={filter === m.id} className={`${SEGMENT} ${filter === m.id ? 'bg-primary-light font-medium text-primary' : 'text-content hover:bg-bg-secondary'}`} onClick={() => pick(m.id)}>
            {label(m)}
          </button>
        ))}
      </div>
    ) : (
      <div role="group" aria-label="Show widgets of" className="flex flex-wrap items-center gap-1">
        <ChipButton active={filter === undefined} onClick={() => onFilter(undefined)}>
          All
        </ChipButton>
        {modules.map((m) => (
          <ChipButton key={m.id} active={filter === m.id} onClick={() => pick(m.id)}>
            <span className="inline-flex items-center gap-1.5">{label(m)}</span>
          </ChipButton>
        ))}
      </div>
    );

  return (
    <div
      role="toolbar"
      aria-label="Dashboard controls"
      className={`mb-4 flex flex-wrap items-center gap-2 ${barStyle === 'sticky' ? 'sticky top-0 z-10 -mx-2 bg-bg/90 px-2 py-2 backdrop-blur' : ''}`}
    >
      {filters}
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
