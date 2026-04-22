#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

. "$HOME/opt/emsdk/emsdk_env.sh"

export EM_CACHE="$ROOT_DIR/.emscripten-cache"

mkdir -p "$EM_CACHE"
mkdir -p "$ROOT_DIR/build/web"
cd "$ROOT_DIR"
echo "Building WebAssembly output..."
emcc main.cpp -O2 -sEXIT_RUNTIME=1 -o build/web/main.js
echo "Done: build/web/main.js and build/web/main.wasm"
