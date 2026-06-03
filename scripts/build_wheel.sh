#!/usr/bin/env bash
# Build a wheel that includes the bundled SPA assets.
#
# Why a wrapper script: `python -m build` alone won't run npm — but the
# wheel needs yz_people/static/ populated for the `pip install`-and-go
# promise to hold (standalone http://127.0.0.1:9003/ serves the SPA). A
# shell wrapper is honest, explicit, and trivial to read. Use this
# instead of `python -m build` directly.
#
# Usage (from satellites/yz-people/):
#     bash scripts/build_wheel.sh
#
# Output: dist/yz_people-{ver}-py3-none-any.whl with the SPA inside.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "── Step 1/3: install UI deps (idempotent)"
cd "$ROOT/ui"
npm install --no-audit --no-fund

echo "── Step 2/3: build SPA → yz_people/static/"
npm run build:pages

# Sanity check — the wheel needs these files present.
if [[ ! -f "$ROOT/yz_people/static/index.html" ]]; then
    echo "✗ SPA build did not produce yz_people/static/index.html — aborting" >&2
    exit 1
fi

echo "── Step 3/3: build Python wheel"
cd "$ROOT"
# `python -m build` requires the `build` package. Pick the python that
# exists (Linux distros often ship `python3` only; Windows + most venvs
# expose `python`). Override with `PYTHON=/path/to/python bash …` if
# neither is on PATH.
PY="${PYTHON:-}"
if [[ -z "$PY" ]]; then
    if command -v python3 >/dev/null 2>&1; then PY=python3
    elif command -v python  >/dev/null 2>&1; then PY=python
    else
        echo "✗ neither 'python3' nor 'python' on PATH — set PYTHON=… and re-run" >&2
        exit 1
    fi
fi
echo "    using: $PY"
"$PY" -m build --wheel --no-isolation

echo
echo "✓ wheel built. Contents include the SPA — verify with:"
echo "    unzip -l dist/yz_people-*.whl | grep -E 'static/'"
echo
echo "Install test:"
echo "    pip install dist/yz_people-*.whl"
echo "    python -m yz_people  # → http://127.0.0.1:9003/ should serve the UI"
