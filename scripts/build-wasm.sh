#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$HOME/opt/emsdk/emsdk_env.sh"

export EM_CACHE="$ROOT_DIR/.emscripten-cache"

mkdir -p "$EM_CACHE"
mkdir -p "$ROOT_DIR/web"
cd "$ROOT_DIR"
echo "Building WebAssembly output..."
emcc main.cpp -O2 -sEXIT_RUNTIME=1 -o web/main.js
echo "Done: web/main.js and web/main.wasm"
