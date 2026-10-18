// Types only: `package` copies this file alone to dist-module/types/index.d.ts (the "./types" export of
// package.json), so other modules can import these shapes. No runtime code, no relative imports.
export interface ExampleItem {
  id: string;
  name: string;
  status: 'active' | 'idle';
}

export interface TickEvent {
  tick: number;
}

// What the slot "example:row-actions" accepts (the root $type of a contribution, see `expose` in manifest.json).
export interface RowActionBadge {
  $type: 'Badge';
  label: string;
}

export interface RowActionLink {
  $type: 'ButtonLink';
  to: string;
  label: string;
}
