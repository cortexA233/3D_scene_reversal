#!/usr/bin/env bash
# Run the gt_designer Three.js scene locally.
#   ./run.sh                → http://localhost:8000 (three.js from the CDN)
#   ./run.sh --lab          → open the isolated single-mesh reference scene
#   ./run.sh --replacement  → open the reference-independent procedural scene
#   ./run.sh --evaluation   → open the fixed-view Evaluation Harness
#   ./run.sh --local-three  → use an installed three package instead; works offline
#   ./run.sh --port 5173    → pick the port
#   ./run.sh --no-open      → don't open a browser
set -euo pipefail

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 ./serve.py "$@"
fi

# Fallback: no python3 on this machine, use node's http-server.
if command -v npx >/dev/null 2>&1; then
  echo "python3 not found — falling back to npx http-server" >&2
  exec npx --yes http-server ./gt_designer -p 8000 -c-1 -o
fi

echo "need python3 or node/npx to serve the scene" >&2
exit 1
