#!/bin/sh
# Sentinel-AI — start on macOS / Linux
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Install Node.js LTS from https://nodejs.org then run this again."; exit 1; fi
( sleep 1; (open http://localhost:8787 || xdg-open http://localhost:8787) >/dev/null 2>&1 ) &
exec node server/server.js
