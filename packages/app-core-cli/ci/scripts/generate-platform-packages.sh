#!/usr/bin/env bash
# Generates the platform package directories (the ones that hold the tray binary) for npm publish.
# Called by CI before copy-binaries.sh. Not needed locally.
# Usage: bash packages/app-core-cli/ci/scripts/generate-platform-packages.sh
set -euo pipefail

REGISTRY="https://npm.pkg.github.com/"

generate_platform() {
  local name="$1" os="$2" cpu="$3" tray_bin="$4"
  local dir="packages/${name}"
  mkdir -p "$dir"
  cat > "$dir/package.json" <<JSON
{
  "name": "@wadeck-app/${name}",
  "version": "0.0.0",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "files": ["${tray_bin}"],
  "publishConfig": {
    "@wadeck-app:registry": "${REGISTRY}"
  }
}
JSON
  echo "generated $dir/package.json"
}

generate_platform "app-core-cli-win32-x64"    "win32"  "x64"   "app-core-tray.exe"
generate_platform "app-core-cli-darwin-arm64" "darwin" "arm64" "app-core-tray"
generate_platform "app-core-cli-darwin-x64"   "darwin" "x64"   "app-core-tray"
