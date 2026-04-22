#!/usr/bin/env bash
set -euo pipefail

source "$HOME/opt/emsdk/emsdk_env.sh"

export EM_CACHE="$PWD/.emscripten-cache"

mkdir -p "$EM_CACHE"
mkdir -p build/web
emcc main.cpp -O2 -sEXIT_RUNTIME=1 -o build/web/main.js
