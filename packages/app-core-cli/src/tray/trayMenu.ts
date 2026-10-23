// The tray menu as a pure function of the state, so every state is testable without a tray.
import { iconBase64, type IconState } from './trayIcons.js';
import type { MenuItemSnapshot, MenuSnapshot } from './trayProcess.js';

export const TRAY_ACTIONS = ['open', 'check-update', 'update-install', 'restart', 'quit'] as const;
export type TrayActionId = (typeof TRAY_ACTIONS)[number];

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'updating' | 'updated' | 'failed';

export interface TrayState {
  /** Port of the running server, or null when it is not running. */
  port: number | null;
  version: string;
  update: UpdateStatus;
  latestVersion: string | null;
  /** `serve`: the tray belongs to the server and quitting it stops the server. `watch`: it only observes one. */
  mode: 'serve' | 'watch';
}

const UPDATE_LABELS: Partial<Record<UpdateStatus, (state: TrayState) => string>> = {
  checking: () => 'Checking for update...',
  'up-to-date': (state) => `app-core-cli v${state.version} (up to date)`,
  updating: () => 'Updating...',
  updated: (state) => `Updated to v${state.latestVersion ?? '?'}`,
  failed: (state) => `app-core-cli v${state.version} (update check failed, see the log)`,
};

function versionLabel(state: TrayState): string {
  const label = UPDATE_LABELS[state.update];
  return label ? label(state) : `app-core-cli v${state.version} (click to check for update)`;
}

function iconState(state: TrayState): IconState {
  if (state.update === 'checking' || state.update === 'updating') {
    return 'busy';
  }
  if (state.update === 'available' || state.update === 'updated') {
    return 'update';
  }
  return state.port === null ? 'stopped' : 'running';
}

export function buildMenuSnapshot(state: TrayState): MenuSnapshot {
  const running = state.port !== null;
  const busy = state.update === 'checking' || state.update === 'updating';
  const items: MenuItemSnapshot[] = [
    { id: 'status', type: 'normal', title: running ? `app-core is running on port ${state.port}` : 'app-core is not running', enabled: false },
    { id: 'sep1', type: 'separator', title: '', enabled: false },
    { id: 'open', type: 'normal', title: 'Open app-core', enabled: running },
    { id: 'sep2', type: 'separator', title: '', enabled: false },
    { id: 'check-update', type: 'normal', title: versionLabel(state), enabled: !busy },
  ];
  if (state.update === 'available') {
    items.push({ id: 'update-install', type: 'normal', title: `Update to v${state.latestVersion ?? '?'}`, enabled: true });
  }
  items.push({ id: 'sep3', type: 'separator', title: '', enabled: false });
  // A restart only makes sense for the process that owns the server; an observing tray cannot start it again.
  if (state.mode === 'serve' && state.update === 'updated') {
    items.push({ id: 'restart', type: 'normal', title: 'Restart to apply the update', enabled: true });
  }
  items.push({ id: 'quit', type: 'normal', title: state.mode === 'serve' ? 'Quit app-core' : 'Quit tray', enabled: true });
  return {
    icon: iconBase64(iconState(state)),
    isTemplateIcon: false,
    tooltip: running ? `app-core (port ${state.port})` : 'app-core (not running)',
    items,
  };
}
