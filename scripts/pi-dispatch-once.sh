#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$WORKDIR/reports/orchestrator/WORKER_ASSIGNMENT.md}"
RUNTIME_DIR="$WORKDIR/reports/orchestrator"
ARCHIVE_DIR="$RUNTIME_DIR/assignments"
LOG_DIR="$RUNTIME_DIR/worker-runs"
PI_TIMEOUT_SECONDS="${PI_TIMEOUT_SECONDS:-14400}"
PI_MODEL="${PI_MODEL:-openai/qwen3.6-35b-a3b}"

mkdir -p "$RUNTIME_DIR" "$ARCHIVE_DIR" "$LOG_DIR"

exec 9>"/tmp/openlunum-pi-dispatch-once.lock"
if ! flock -n 9; then
  echo "BLOCKED: another worker dispatch is active" >&2
  exit 2
fi

if [[ ! -f "$ASSIGNMENT_FILE" ]]; then
  echo "IDLE: no explicit worker assignment"
  exit 0
fi

read_field() {
  local key="$1"
  awk -F': *' -v key="$key" '$1 == key { sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' "$ASSIGNMENT_FILE"
}

assignment_id="$(read_field assignment_id)"
issue="$(read_field issue)"
worker="$(read_field worker)"
branch="$(read_field branch)"
tier="$(read_field tier)"

if [[ -z "$assignment_id" || -z "$issue" || -z "$worker" || -z "$branch" || -z "$tier" ]]; then
  echo "BLOCKED: assignment is missing assignment_id, issue, worker, branch, or tier" >&2
  exit 2
fi

if [[ ! "$issue" =~ ^[0-9]+$ ]]; then
  echo "BLOCKED: issue must be numeric" >&2
  exit 2
fi

if [[ ! "$tier" =~ ^[123]$ ]]; then
  echo "BLOCKED: tier must be 1, 2, or 3" >&2
  exit 2
fi

if [[ ! "$branch" =~ ^work/[a-zA-Z0-9._-]+/${issue}-[a-zA-Z0-9._-]+$ ]]; then
  echo "BLOCKED: branch must match work/<worker>/${issue}-<short-name>" >&2
  exit 2
fi

if [[ "$branch" != "work/$worker/"* ]]; then
  echo "BLOCKED: branch worker segment does not match worker field" >&2
  exit 2
fi

cd "$WORKDIR"
git fetch --prune origin main
git checkout main
git reset --hard origin/main

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "BLOCKED: local branch already exists: $branch" >&2
  exit 2
fi

if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "BLOCKED: remote branch already exists: $branch" >&2
  exit 2
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_file="$LOG_DIR/${assignment_id}-${timestamp}.log"
archive_file="$ARCHIVE_DIR/${assignment_id}-${timestamp}.md"

cp "$ASSIGNMENT_FILE" "$archive_file"
rm -f "$ASSIGNMENT_FILE"

set +e
timeout "$PI_TIMEOUT_SECONDS" pi --print \
  --provider local-llama \
  --model "$PI_MODEL" \
  --thinking high \
  --session-id "openlunum-${assignment_id}" \
  --append-system-prompt "@$WORKDIR/AGENTS.md" \
  --append-system-prompt "@$WORKDIR/docs/REPOSITORY_OPERATING_MODEL.md" \
  --append-system-prompt "@$WORKDIR/scripts/pi-task-prompt.md" \
  --append-system-prompt "@$archive_file" \
  "Execute the single OpenLunum assignment in the attached assignment file. Do not select another issue." \
  2>&1 | tee "$log_file"
pi_exit=${PIPESTATUS[0]}
set -e

{
  echo
  echo "dispatch_completed_utc: $(date -u -Iseconds)"
  echo "dispatch_exit_code: $pi_exit"
  echo "dispatch_log: $log_file"
} >> "$archive_file"

if [[ $pi_exit -eq 124 ]]; then
  echo "BLOCKED: worker dispatch timed out after ${PI_TIMEOUT_SECONDS}s" >&2
  exit 124
fi

if [[ $pi_exit -ne 0 ]]; then
  echo "BLOCKED: worker dispatch exited with code $pi_exit" >&2
  exit "$pi_exit"
fi

echo "DISPATCH COMPLETE: assignment=$assignment_id issue=$issue branch=$branch"
