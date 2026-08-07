#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-/home/corpunum/openlunum-workers/worker-ally}"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$WORKDIR/reports/orchestrator/WORKER_ASSIGNMENT.md}"
PAUSED_FLAG="$WORKDIR/reports/orchestrator/PAUSED"
POLL_INTERVAL="${POLL_INTERVAL:-60}"

while true; do
  if [[ -f "$PAUSED_FLAG" ]]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  if [[ -f "$ASSIGNMENT_FILE" ]]; then
    "$(dirname "$0")/pi-dispatch-once.sh" "$WORKDIR" || true
  fi

  sleep "$POLL_INTERVAL"
done
