#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/var/run"
SERVER_PID_FILE="$RUN_DIR/server.pid"
TUNNEL_PID_FILE="$RUN_DIR/tunnel.pid"
URL_FILE="$RUN_DIR/public_url.txt"

stop_pid_file() {
  local label="$1"
  local pid_file="$2"
  if [[ ! -f "$pid_file" ]]; then
    echo "$label: not running"
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$label: stale pid file removed"
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
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
    echo "$label: stopped pid $pid"
  else
    echo "$label: pid $pid was not running"
  fi

  rm -f "$pid_file"
}

stop_pid_file "localtunnel" "$TUNNEL_PID_FILE"
stop_pid_file "uvicorn" "$SERVER_PID_FILE"
rm -f "$URL_FILE"

echo "Magic Lab undeployed."
