/**
 * Generates src/tray/trayIcons.ts: the Lucide "server-plus" icon, white, with the plus colored per state.
 *   dev  -> blue   (#3B82F6, the blue of orchestrator's "running" badge)
 *   prod -> green  (#22C55E, orchestrator's "success" green)
 *   info -> amber  (#F59E0B, orchestrator's "checking" amber): an update is available, being checked or installed
 *
 * Not part of the build: the output is committed, like orchestrator's tray-icons.ts. Needs `sharp`, which app-core does not
 * depend on; point SHARP_MODULE at an existing install, e.g.
 *   SHARP_MODULE=C:/Workspace_Tooling/orchestrator/node_modules/sharp node scripts/gen-tray-icons.mjs
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'tray', 'trayIcons.ts');

function loadSharp() {
  const from = process.env['SHARP_MODULE'] ?? 'sharp';
  try {
    return createRequire(import.meta.url)(from);
  } catch (err) {
    throw new Error(
      `Cannot load sharp from "${from}" (${err instanceof Error ? err.message : String(err)}). ` +
        'Set SHARP_MODULE to a sharp install, e.g. C:/Workspace_Tooling/orchestrator/node_modules/sharp',
    );
  }
}

const BODY = '#FFFFFF';
const COLORS = { dev: '#3B82F6', prod: '#22C55E', info: '#F59E0B' };

// Lucide server-plus (lucide-static 1.61.0, ISC): 24x24 viewBox, stroke-width 2, round caps and joins.
function svg(plus) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="${BODY}">
    <path d="M12.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2"/>
    <path d="M22 18v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h8.5"/>
    <path d="M6 18h.01"/>
    <path d="M6 6h.01"/>
  </g>
  <g stroke="${plus}">
    <path d="M16 12h6"/>
    <path d="M19 9v6"/>
  </g>
</svg>`;
}

const sharp = loadSharp();
const entries = [];
for (const [state, color] of Object.entries(COLORS)) {
  const png = await sharp(Buffer.from(svg(color))).resize(64, 64).png().toBuffer();
  entries.push(`  ${state}: '${png.toString('base64')}',`);
}

fs.writeFileSync(
  OUT,
  `// AUTO-GENERATED - do not edit manually.
// Re-run: SHARP_MODULE=<path to a sharp install> node scripts/gen-tray-icons.mjs  (see that script)
// Lucide server-plus, 64x64 PNG base64: white server, plus colored per state.

export type IconState = 'dev' | 'prod' | 'info';

export const TRAY_ICONS: Record<IconState, string> = {
${entries.join('\n')}
};
`,
);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
