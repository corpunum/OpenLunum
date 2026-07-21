#!/usr/bin/env bash
set -euo pipefail
# OpenLunum Docs Worker (retired persistent loop).
# Governed by Issue #275: persistent model loops are retired.
# All worker execution follows the issue-driven one-shot contract in scripts/pi-dispatch-once.sh.

WORKDIR="${1:-/home/corpunum/openlunum-workers/docs}"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$WORKDIR/reports/orchestrator/WORKER_ASSIGNMENT.md}"

if [[ ! -f "$ASSIGNMENT_FILE" ]]; then
  echo "IDLE: no explicit worker assignment"
  exit 0
fi

exec "$(dirname "$0")/pi-dispatch-once.sh" "$WORKDIR"
