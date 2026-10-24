// The tray menu as a pure function of the state, so every state is testable without a tray.
// Laid out like orchestrator's: header with the PIDs, version (click to check), config dir, update, then status, then actions.
import { TRAY_ICONS, type IconState } from './trayIcons.js';
import type { MenuItemSnapshot, MenuSnapshot } from './trayProcess.js';

export const TRAY_ACTIONS = ['check-update', 'update-install', 'open', 'open-logs', 'restart', 'quit'] as const;
export type TrayActionId = (typeof TRAY_ACTIONS)[number];

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'updating' | 'updated' | 'failed';

export interface TrayState {
  /** `dev`: a server run from sources or by `app-core-cli dev` (blue). `prod`: `app-core-cli serve` (green). */
  mode: 'dev' | 'prod';
  /** The published version (prod), or a label such as "dev 3474ba9c" (dev). */
  version: string;
  update: UpdateStatus;
  /** Why `update` is 'failed': which step, and the (ASCII, short) message. */
  failure: { step: 'check' | 'install'; message: string } | null;
  latestVersion: string | null;
  /** Config dir, as shown in the menu (home already shortened). */
  configDir: string;
  nodePid: number;
  trayPid: number | null;
  /** The tray can restart its server (`serve`). */
  canRestart: boolean;
}

const VERSION_TITLES: Partial<Record<UpdateStatus, (state: TrayState) => string>> = {
  checking: () => 'Checking...',
  'up-to-date': (state) => `v${state.version} (up to date)`,
  failed: (state) => (state.failure?.step === 'install' ? `v${state.version}` : `v${state.version} (check failed)`),
  idle: (state) => `v${state.version} (click to check)`,
};

function versionTitle(state: TrayState): string {
  if (state.mode === 'dev') {
    // `version` is already a label here ("dev <commit>"): a dev server has no published version to prefix with v.
    return state.version;
  }
  return VERSION_TITLES[state.update]?.(state) ?? `v${state.version}`;
}

const STATUS_TITLES: Partial<Record<UpdateStatus, (state: TrayState) => string>> = {
  available: (state) => `Update available: v${state.latestVersion ?? '?'}`,
  updating: () => 'Updating...',
  updated: (state) => `Updated to v${state.latestVersion ?? '?'}: restart app-core to apply`,
  checking: () => 'Checking for an update...',
  failed: (state) => `[fail] Update ${state.failure?.step ?? 'check'} failed: ${state.failure?.message ?? 'see the log'}`,
};

function statusTitle(state: TrayState): string {
  return STATUS_TITLES[state.update]?.(state) ?? 'app-core is running';
}

// Anything the user should look at is amber, whatever the mode: an update to take, in progress, or that failed.
function iconState(state: TrayState): IconState {
  return state.update === 'idle' || state.update === 'up-to-date' ? state.mode : 'info';
}

export function buildMenuSnapshot(state: TrayState): MenuSnapshot {
  const busy = state.update === 'checking' || state.update === 'updating';
  const pids = state.trayPid === null ? `node:${state.nodePid}` : `node:${state.nodePid} tray:${state.trayPid}`;
  const items: MenuItemSnapshot[] = [
    { id: 'header', type: 'normal', title: `app-core (${state.mode}) [${pids}]`, enabled: false },
    { id: 'check-update', type: 'normal', title: versionTitle(state), enabled: state.mode === 'prod' && !busy },
    { id: 'config-dir', type: 'normal', title: `Config: ${state.configDir}`, enabled: false },
  ];
  if (state.update === 'available') {
    items.push({ id: 'update-install', type: 'normal', title: `Update to v${state.latestVersion ?? '?'} and restart`, enabled: true });
  } else if (state.update === 'updating') {
    items.push({ id: 'update-install', type: 'normal', title: 'Updating...', enabled: false });
  }
  items.push(
    { id: 'sep1', type: 'separator', title: '', enabled: false },
    { id: 'status', type: 'normal', title: statusTitle(state), enabled: false },
    { id: 'sep2', type: 'separator', title: '', enabled: false },
    { id: 'open', type: 'normal', title: 'Open app-core', enabled: true },
    { id: 'open-logs', type: 'normal', title: 'Open logs', enabled: true },
    { id: 'sep3', type: 'separator', title: '', enabled: false },
  );
  if (state.canRestart) {
    items.push({ id: 'restart', type: 'normal', title: 'Restart', enabled: true });
  }
  items.push({ id: 'quit', type: 'normal', title: 'Quit', enabled: true });
  return {
    icon: TRAY_ICONS[iconState(state)],
    isTemplateIcon: false,
    tooltip: state.update === 'available' ? `app-core (${state.mode}) - update available` : `app-core (${state.mode})`,
    items,
  };
}
