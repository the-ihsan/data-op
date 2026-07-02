#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/ui/public/wasm"
GOROOT="$(go env GOROOT)"

mkdir -p "$OUT_DIR"
cp "$GOROOT/lib/wasm/wasm_exec.js" "$OUT_DIR/wasm_exec.js"

cd "$ROOT/api"
GOOS=js GOARCH=wasm go build -o "$OUT_DIR/sanitize.wasm" ./wasm/sanitize/

echo "Built $OUT_DIR/sanitize.wasm ($(du -h "$OUT_DIR/sanitize.wasm" | cut -f1))"
