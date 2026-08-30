#!/usr/bin/env bash
# Serve the site locally. No build step, no dependencies beyond Python 3.
set -euo pipefail
PORT="${1:-5199}"
cd "$(dirname "$0")"
echo "→ http://localhost:${PORT}"
python3 -m http.server "$PORT" --bind 127.0.0.1
