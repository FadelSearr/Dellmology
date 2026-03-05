#!/usr/bin/env bash
# cross-platform development starter script for Dellmology
# usage: ./scripts/start-dev.sh

set -euo pipefail

echo "== Dellmology development launcher =="

# load .env if exists
if [ -f ".env" ]; then
  echo "loading environment variables from .env"
  # shellcheck source=/dev/null
  source .env
fi

# ensure python venv activated
if [ -f ".venv/bin/activate" ]; then
  echo "activating Python virtual environment"
  # shellcheck source=/dev/null
  source .venv/bin/activate
else
  echo "no venv detected, creating one..."
  python -m venv .venv
  source .venv/bin/activate
  pip install -r apps/ml-engine/requirements.txt
fi

# build and run go streamer
echo "starting Go streamer (orderflow & real-time) in background"
go run ./apps/streamer/main.go &
GO_PID=$!

echo "starting Python ML engine (optional) in background"
python apps/ml-engine/main.py &
PY_PID=$!

# start frontend (Next.js)
cd apps/web
npm run dev &
NEXT_PID=$!
cd -

echo "All services started. PIDs: GO=$GO_PID PY=$PY_PID NEXT=$NEXT_PID"
echo "Remember to start a tunnel (cloudflared/ngrok) and set PUBLIC_ENGINE_URL variable. "
echo "Press Ctrl-C to stop all services."

# wait on background processes
wait $GO_PID $PY_PID $NEXT_PID
