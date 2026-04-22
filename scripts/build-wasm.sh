#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

. "$HOME/opt/emsdk/emsdk_env.sh"

export EM_CACHE="$ROOT_DIR/.emscripten-cache"

mkdir -p "$EM_CACHE"
mkdir -p "$ROOT_DIR/web"
cd "$ROOT_DIR"
echo "Building WebAssembly output..."
emcc main.cpp -O2 -sEXIT_RUNTIME=1 -o web/main.js
echo "Done: web/main.js and web/main.wasm"
