#!/usr/bin/env bash
set -euo pipefail

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOLVER_DIR="$ROOT_DIR/cpp/solver"
WASM_OUT_DIR="$ROOT_DIR/apps/web/public/wasm"

source "$HOME/opt/emsdk/emsdk_env.sh"

export EM_CACHE="$ROOT_DIR/.emscripten-cache"

mkdir -p "$EM_CACHE"
mkdir -p "$WASM_OUT_DIR"
cd "$ROOT_DIR"
echo "Building WebAssembly output..."
emcc "$SOLVER_DIR/main.cpp" -O2 \
  -sEXPORTED_FUNCTIONS='["_main","_malloc","_free","_calculate_combined_stress_pa","_calculate_max_contact_stress_pa","_print_stress_report","_calculate_self_weight_stress_pa","_print_self_weight_report","_calculate_stress_at_point_pa_export","_sample_ground_grid_pa_export","_sample_plane_section_pa_export"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPF64"]' \
  -o "$WASM_OUT_DIR/main.js"
echo "Done: $WASM_OUT_DIR/main.js and $WASM_OUT_DIR/main.wasm"
