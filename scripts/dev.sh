#!/usr/bin/env bash
# Run both APIs (mock providers) and the web app in live mode.
#   ./scripts/dev.sh
# Locally both APIs run in ONE process (dev_combined.py) so they share the
# in-memory store, just as the two Cloud Run services share Firestore.
# For browser-only demo mode, just run: cd frontend && npm run dev
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
uvicorn dev_combined:app --port 8081 --reload &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

cd "$ROOT/frontend"
VITE_API_MODE=live VITE_BABY_API_URL=http://localhost:8081 VITE_MOTHER_API_URL=http://localhost:8081 npm run dev
