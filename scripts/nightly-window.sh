#!/usr/bin/env bash
set -euo pipefail
# OpenLunum maintenance window script.
# Governed by Issue #274: autonomous nightly evidence, adversarial issue generation,
# and direct-to-main auto-reverts/loop-restarts are RETIRED.
#
# Idle behavior: With no explicit worker assignment (WORKER_ASSIGNMENT.md),
# this script performs 0 model calls, 0 GitHub writes, and 0 repository mutations.

REPO="${1:-/home/corpunum/OpenLunum}"
LOGDIR="$REPO/reports/nightly"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$REPO/reports/orchestrator/WORKER_ASSIGNMENT.md}"

mkdir -p "$LOGDIR"
stamp=$(date +%Y%m%d)

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOGDIR/nightly-$stamp.log"
}

cleanup() {
  log "nightly window complete (idle / no-write safe exit)"
}
trap cleanup EXIT

log "nightly window starting check"

if [[ ! -f "$ASSIGNMENT_FILE" ]]; then
  log "[IDLE] No explicit worker assignment found at $ASSIGNMENT_FILE."
  log "[IDLE] Performing 0 model calls, 0 GitHub writes, and 0 repository mutations."
  exit 0
fi

# Delegate manifest validation and execution to reviewed runner module
node "$REPO/scripts/nightly-evidence-runner.mjs"
