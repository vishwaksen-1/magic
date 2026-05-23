#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"
RUN_DIR="$ROOT_DIR/var/run"
LOG_DIR="$ROOT_DIR/var/log"
URL_FILE="$RUN_DIR/public_url.txt"
SERVER_PID_FILE="$RUN_DIR/server.pid"
TUNNEL_PID_FILE="$RUN_DIR/tunnel.pid"
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"

mkdir -p "$RUN_DIR" "$LOG_DIR" "$ROOT_DIR/var/shares"

stop_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        if ! kill -0 "$pid" 2>/dev/null; then
          break
        fi
        sleep 0.2
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

stop_pid_file "$TUNNEL_PID_FILE"
stop_pid_file "$SERVER_PID_FILE"
rm -f "$URL_FILE"

if curl -fsS "http://$HOST:$PORT/" >/dev/null 2>&1; then
  echo "Port $PORT is already serving an app at http://$HOST:$PORT/."
  echo "Stop the existing process first, or run with another port:"
  echo "  PORT=8001 ./deploy.sh"
  exit 1
fi

if [[ ! -x "$ROOT_DIR/.venv/bin/uvicorn" ]]; then
  echo "Missing .venv/bin/uvicorn. Run:"
  echo "  .venv/bin/pip install fastapi uvicorn httpx pillow python-multipart"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Missing npx. Install Node/npm to use localtunnel."
  exit 1
fi

setsid "$ROOT_DIR/.venv/bin/uvicorn" server:app --host "$HOST" --port "$PORT" >"$SERVER_LOG" 2>&1 < /dev/null &
echo "$!" > "$SERVER_PID_FILE"
server_pid="$(cat "$SERVER_PID_FILE")"

for _ in {1..40}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "Server exited before it became reachable. Log:"
    tail -80 "$SERVER_LOG" || true
    exit 1
  fi
  if curl -fsS "http://$HOST:$PORT/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "http://$HOST:$PORT/" >/dev/null 2>&1; then
  echo "Server failed to start. Log:"
  tail -80 "$SERVER_LOG" || true
  exit 1
fi

setsid npx --yes localtunnel --port "$PORT" >"$TUNNEL_LOG" 2>&1 < /dev/null &
echo "$!" > "$TUNNEL_PID_FILE"
tunnel_pid="$(cat "$TUNNEL_PID_FILE")"

public_url=""
for _ in {1..80}; do
  if ! kill -0 "$tunnel_pid" 2>/dev/null; then
    echo "Tunnel exited before it produced a URL. Log:"
    tail -80 "$TUNNEL_LOG" || true
    exit 1
  fi
  public_url="$(sed -nE 's/^your url is: (https:\/\/[^[:space:]]+).*/\1/p' "$TUNNEL_LOG" 2>/dev/null | tail -1)"
  if [[ -n "$public_url" ]]; then
    break
  fi
  sleep 0.25
done

if [[ -z "$public_url" ]]; then
  echo "Tunnel failed to start. Log:"
  tail -80 "$TUNNEL_LOG" || true
  exit 1
fi

printf '%s\n' "$public_url" > "$URL_FILE"

echo "Magic Lab deployed:"
echo "$public_url"
echo
echo "Server log: $SERVER_LOG"
echo "Tunnel log: $TUNNEL_LOG"
echo "Undeploy with: ./undeploy.sh"
