#!/bin/sh
# Boots Ollama, makes sure the model exists, then hands over to the app.
# `exec` at the end replaces this shell so node becomes PID 1 and receives
# SIGTERM directly — without it, a redeploy would leave node orphaned and hang
# until the platform's kill timeout.
set -e

OLLAMA_URL="http://127.0.0.1:11434"
MODEL="${MODEL:-gemma3:4b}"

echo "[entrypoint] starting ollama (models dir: ${OLLAMA_MODELS:-/root/.ollama})"
ollama serve &
OLLAMA_PID=$!

echo "[entrypoint] waiting for ollama to accept requests"
up=0
until curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; do
  up=$((up + 1))
  if [ "$up" -ge 60 ]; then
    echo "[entrypoint] ollama did not come up within 60s" >&2
    kill "$OLLAMA_PID" 2>/dev/null || true
    exit 1
  fi
  # If the server died, waiting is pointless.
  kill -0 "$OLLAMA_PID" 2>/dev/null || { echo "[entrypoint] ollama exited early" >&2; exit 1; }
  sleep 1
done

# First boot on a fresh volume downloads ~3 GB; later boots report
# "up to date" and return in well under a second. Pulling here rather than at
# build time keeps the image small and lets the model live on a mounted volume.
echo "[entrypoint] ensuring model: $MODEL"
if ! ollama pull "$MODEL"; then
  echo "[entrypoint] could not pull $MODEL — the app will fall back to any model already present" >&2
fi

echo "[entrypoint] starting app on port ${PORT:-8080}"
exec node server/index.js
