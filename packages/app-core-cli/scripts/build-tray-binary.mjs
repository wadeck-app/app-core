/**
 * Builds the tray binary for every supported platform into tray-go/dist (needs the Go toolchain).
 * Usage: node scripts/build-tray-binary.mjs   (or: npm run build-tray --workspace=packages/app-core-cli)
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const trayDir = path.join(__dirname, '..', 'tray-go');
const distDir = path.join(trayDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const targets = [
  { GOOS: 'windows', GOARCH: 'amd64', out: path.join(distDir, 'app-core-tray.exe') },
  { GOOS: 'darwin', GOARCH: 'arm64', out: path.join(distDir, 'app-core-tray-arm64') },
  { GOOS: 'darwin', GOARCH: 'amd64', out: path.join(distDir, 'app-core-tray-amd64') },
];

for (const { GOOS, GOARCH, out } of targets) {
  process.stdout.write(`Building ${GOOS}/${GOARCH} -> ${path.basename(out)} ... `);
  try {
    execSync(
      // Reproducible output: identical sources must produce an identical binary, because the
      // publish step only republishes a platform package when the binary hash changes.
      // -buildvcs=false: this package lives inside the repo, so Go's default -buildvcs=auto
      //   stamps vcs.revision/vcs.time/vcs.modified into every build, making the binary differ
      //   on every commit even when no Go source changed.
      // No -X main.version, for the same reason: the tray gets its version from the CLI.
      `go build -trimpath -buildvcs=false -ldflags "-s -w" -o "${out}" .`,
      { cwd: trayDir, env: { ...process.env, GOOS, GOARCH, CGO_ENABLED: '0' }, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true },
    );
  } catch (err) {
    console.log('FAILED');
    throw new Error(
      `go build failed for ${GOOS}/${GOARCH}. The tray needs the Go toolchain (see tray-go/go.mod for the version): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log('ok');
}
console.log('build-tray done');
