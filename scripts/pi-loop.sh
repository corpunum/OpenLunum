#!/usr/bin/env bash
set -euo pipefail

# Pi autonomous campaign loop for OpenLunum
# Usage: ./scripts/pi-loop.sh [worktree-path]
#
# Runs Pi in non-interactive mode with the campaign prompt, checks pnpm verify
# after each run, and writes a STUCK flag after MAX_CONSECUTIVE_FAILURES.
# A watcher daemon (Claude scheduled routine) monitors the STUCK flag.

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
LOGDIR="$WORKDIR/reports/pi-loop"
STUCK_FILE="$LOGDIR/STUCK"
STATUS_LOG="$LOGDIR/loop-status.log"
MAX_CONSECUTIVE_FAILURES=3
COOLDOWN_SECONDS=30

TASK_PROMPT_FILE="$WORKDIR/scripts/pi-task-prompt.md"

mkdir -p "$LOGDIR"

failure_count=0

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$STATUS_LOG"
}

write_stuck() {
  local last_log="$1"
  local last_error="$2"
  cat > "$STUCK_FILE" <<STUCK_EOF
timestamp: $(date -Iseconds)
branch: $(git -C "$WORKDIR" branch --show-current 2>/dev/null || echo unknown)
last_log: $last_log
failure_count: $failure_count
last_error: |
$last_error
STUCK_EOF
  log "STUCK flag written to $STUCK_FILE"
}

# Clean any stale STUCK flag on startup
if [[ -f "$STUCK_FILE" ]]; then
  log "Clearing stale STUCK flag from previous run"
  rm -f "$STUCK_FILE"
fi

log "Pi loop starting in $WORKDIR"

while true; do
  timestamp=$(date +%Y%m%dT%H%M%S)
  logfile="$LOGDIR/loop-$timestamp.log"

  log "Starting Pi run → $logfile"

  # Reset to main before each run to avoid stale branch state
  cd "$WORKDIR"
  git fetch origin main 2>>"$logfile" || true
  git checkout main 2>>"$logfile" || true
  git pull --ff-only origin main 2>>"$logfile" || true

  # Clean stale dist/ artifacts from previous branch switches
  find "$WORKDIR/packages" -name dist -type d -exec rm -rf {} + 2>/dev/null || true
  pnpm build >>"$logfile" 2>&1 || true

  # Run Pi with the campaign prompt, non-interactive
  set +e
  if [[ -f "$TASK_PROMPT_FILE" ]]; then
    pi --print \
      --provider local-llama \
      --model openai/qwen3-coder-30b-a3b \
      --thinking high \
      --append-system-prompt "@$WORKDIR/AGENTS.md" \
      --append-system-prompt "@$WORKDIR/WORK_QUEUE.md" \
      --append-system-prompt "@$TASK_PROMPT_FILE" \
      "Continue the OpenLunum campaign. You are in $WORKDIR. Follow the task prompt instructions exactly." \
      2>&1 | tee "$logfile"
  else
    pi --print \
      --provider local-llama \
      --model openai/qwen3-coder-30b-a3b \
      --thinking high \
      --append-system-prompt "@$WORKDIR/AGENTS.md" \
      --append-system-prompt "@$WORKDIR/WORK_QUEUE.md" \
      "Continue the OpenLunum campaign. Run pnpm verify first. Pick the highest-priority unchecked item from WORK_QUEUE.md. Create an agent/qwen/<area>/<name> branch. Follow AGENTS.md protocol exactly. Push your branch and open a draft PR when done. Report status at the end." \
      2>&1 | tee "$logfile"
  fi
  pi_exit=$?
  set -e

  # Verify after each run
  cd "$WORKDIR"
  set +e
  verify_output=$(pnpm verify 2>&1)
  verify_exit=$?
  echo "$verify_output" >> "$logfile"
  set -e

  if [[ $verify_exit -eq 0 ]]; then
    failure_count=0
    log "Loop succeeded — verify passed (pi exit: $pi_exit)"
  else
    ((failure_count++))
    last_error=$(echo "$verify_output" | grep -E '(FAIL|Error|error|fail)' | tail -5)
    log "Loop FAILED (count: $failure_count/$MAX_CONSECUTIVE_FAILURES, pi exit: $pi_exit)"

    if (( failure_count >= MAX_CONSECUTIVE_FAILURES )); then
      log "STOPPED after $MAX_CONSECUTIVE_FAILURES consecutive failures"
      write_stuck "$logfile" "$last_error"
      exit 1
    fi
  fi

  log "Cooling down ${COOLDOWN_SECONDS}s before next run"
  sleep "$COOLDOWN_SECONDS"
done
