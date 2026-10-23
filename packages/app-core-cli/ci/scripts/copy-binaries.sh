#!/usr/bin/env bash
# Copies the tray binaries into the platform packages.
#
# The main package deliberately ships NO native binary: the tray is found through
# require.resolve('<platformPkg>/app-core-tray*'). Copying the Windows binary into the main
# package would make every macOS user download an unusable .exe.
#
# Usage: bash packages/app-core-cli/ci/scripts/copy-binaries.sh
set -euo pipefail

TRAY_DIST="packages/app-core-cli/tray-go/dist"

cp "$TRAY_DIST/app-core-tray.exe"   packages/app-core-cli-win32-x64/app-core-tray.exe
cp "$TRAY_DIST/app-core-tray-arm64" packages/app-core-cli-darwin-arm64/app-core-tray
cp "$TRAY_DIST/app-core-tray-amd64" packages/app-core-cli-darwin-x64/app-core-tray
# The executable bit is what npm pack keeps: macOS refuses to run the binary without it.
chmod +x packages/app-core-cli-darwin-arm64/app-core-tray packages/app-core-cli-darwin-x64/app-core-tray

echo "app-core tray binaries copied to platform packages"
