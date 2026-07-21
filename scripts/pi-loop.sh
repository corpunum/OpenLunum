#!/usr/bin/env bash
set -euo pipefail
# OpenLunum Primary Worker (retired persistent campaign loop).
# Governed by Issue #271: legacy campaign loop is RETIRED.
# All worker execution is routed through the one-shot assignment dispatcher scripts/pi-dispatch-once.sh.

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$WORKDIR/reports/orchestrator/WORKER_ASSIGNMENT.md}"

if [[ ! -f "$ASSIGNMENT_FILE" ]]; then
  echo "IDLE: no explicit worker assignment"
  exit 0
fi

exec "$(dirname "$0")/pi-dispatch-once.sh" "$WORKDIR"
