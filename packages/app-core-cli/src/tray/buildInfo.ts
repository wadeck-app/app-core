import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from '@wadeck-app/app-core-server/errors';

// What the tray says about the build it belongs to: when it was built and with which dsl packages. Read from the
// build-info.json that `npm run build` writes next to the bundle (dist/public/build-info.json), the same file the server
// serves; a dev server has no published version, so the date of its build is what tells which one it is.
export interface TrayBuildInfo {
  /** "dev build 2026-10-24 11:34", local time, or why there is none. */
  builtLabel: string;
  /** "dsl-ui 2026.10.24-137" (and the renderer when it is another version), or null when unknown. */
  dslLabel: string | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "2026-10-24 11:34" in local time; null when `iso` is not a date. */
export function formatBuildDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function readTrayBuildInfo(bundleDir: string): TrayBuildInfo {
  const file = path.join(bundleDir, 'public', 'build-info.json');
  let info: { builtAt?: unknown; dslUi?: unknown; dslRenderer?: unknown };
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof info;
  } catch (err) {
    process.stderr.write(`[tray] cannot read ${file} (${getErrorMessage(err)}): the menu cannot show the build date. Build with: npm run build\n`);
    return { builtLabel: 'dev build (date unknown)', dslLabel: null };
  }
  const built = typeof info.builtAt === 'string' ? formatBuildDate(info.builtAt) : null;
  const dslUi = typeof info.dslUi === 'string' ? info.dslUi : null;
  const dslRenderer = typeof info.dslRenderer === 'string' ? info.dslRenderer : null;
  const renderer = dslRenderer !== null && dslRenderer !== dslUi ? `, dsl-renderer ${dslRenderer}` : '';
  return {
    builtLabel: built === null ? 'dev build (date unknown)' : `dev build ${built}`,
    dslLabel: dslUi === null ? null : `dsl-ui ${dslUi}${renderer}`,
  };
}
