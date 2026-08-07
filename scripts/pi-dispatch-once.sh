#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ASSIGNMENT_FILE="${OPENLUNUM_ASSIGNMENT_FILE:-$WORKDIR/reports/orchestrator/WORKER_ASSIGNMENT.md}"
PI_TIMEOUT_SECONDS="${PI_TIMEOUT_SECONDS:-14400}"

exec 9>"/tmp/openlunum-pi-dispatch-once.lock"
if ! flock -n 9; then
  echo "BLOCKED: another worker dispatch is active" >&2
  exit 2
fi

PAUSED_FLAG="$WORKDIR/reports/orchestrator/PAUSED"
if [[ -f "$PAUSED_FLAG" ]]; then
  echo "PAUSED: thermal or manual pause active — skipping dispatch" >&2
  exit 0
fi

if [[ ! -f "$ASSIGNMENT_FILE" ]]; then
  echo "IDLE: no explicit worker assignment"
  exit 0
fi

RUNTIME_DIR="$WORKDIR/reports/orchestrator"
ARCHIVE_DIR="$RUNTIME_DIR/assignments"
LOG_DIR="$RUNTIME_DIR/worker-runs"

read_field() {
  local key="$1"
  awk -F': *' -v key="$key" '$1 == key { sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' "$ASSIGNMENT_FILE"
}

fail_blocked() {
  echo "BLOCKED: $1" >&2
  exit 2
}

local_branch_snapshot() {
  local branch="$1"
  git for-each-ref refs/heads --format='%(refname:short) %(objectname)' \
    | awk -v branch="$branch" '$1 != branch' \
    | sort
}

remote_branch_snapshot() {
  git ls-remote --heads origin | sort
}

remote_branch_snapshot_without_assigned() {
  local branch="$1"
  git ls-remote --heads origin \
    | awk -v branch="refs/heads/$branch" '$2 != branch' \
    | sort
}

remote_branch_oid() {
  local branch="$1"
  git ls-remote --heads origin "$branch" | awk '{ print $1; exit }'
}

assignment_id="$(read_field assignment_id)"
issue="$(read_field issue)"
worker="$(read_field worker)"
branch="$(read_field branch)"
tier="$(read_field tier)"
pi_model="$(read_field pi_model)"

if [[ -z "$assignment_id" || -z "$issue" || -z "$worker" || -z "$branch" || -z "$tier" || -z "$pi_model" ]]; then
  echo "BLOCKED: assignment is missing assignment_id, issue, worker, branch, tier, or pi_model" >&2
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

if [[ "$pi_model" =~ [[:space:][:cntrl:]] ]]; then
  fail_blocked "assignment pi_model must not contain whitespace or control characters"
fi

if [[ ! "$pi_model" =~ ^[A-Za-z0-9._/@:+-]+$ ]]; then
  fail_blocked "assignment pi_model is malformed"
fi

if [[ ! "$branch" =~ ^work/[a-zA-Z0-9._-]+/${issue}-[a-zA-Z0-9._-]+$ ]]; then
  fail_blocked "branch must match work/<worker>/${issue}-<short-name>"
fi

if [[ "$branch" != "work/$worker/"* ]]; then
  fail_blocked "branch worker segment does not match worker field"
fi

cd "$WORKDIR"
if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  fail_blocked "dirty starting worktree"
fi

mkdir -p "$RUNTIME_DIR" "$ARCHIVE_DIR" "$LOG_DIR"

git fetch --prune origin main

if git show-ref --verify --quiet "refs/heads/$branch"; then
  fail_blocked "local branch already exists: $branch"
fi

if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  fail_blocked "remote branch already exists: $branch"
fi

git switch --create "$branch" --track origin/main >/dev/null

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$branch" ]]; then
  fail_blocked "failed to check out assigned branch: expected $branch, found ${current_branch:-detached}"
fi

pre_local_refs="$(mktemp "$RUNTIME_DIR/.pi-dispatch-local-XXXXXX")"
pre_remote_refs="$(mktemp "$RUNTIME_DIR/.pi-dispatch-remote-XXXXXX")"
pre_remote_refs_without_assigned="$(mktemp "$RUNTIME_DIR/.pi-dispatch-remote-XXXXXX")"
post_local_refs="$(mktemp "$RUNTIME_DIR/.pi-dispatch-local-XXXXXX")"
post_remote_refs="$(mktemp "$RUNTIME_DIR/.pi-dispatch-remote-XXXXXX")"
post_remote_refs_without_assigned="$(mktemp "$RUNTIME_DIR/.pi-dispatch-remote-XXXXXX")"
trap 'rm -f "$pre_local_refs" "$pre_remote_refs" "$pre_remote_refs_without_assigned" "$post_local_refs" "$post_remote_refs" "$post_remote_refs_without_assigned"' EXIT

local_branch_snapshot "$branch" >"$pre_local_refs"
remote_branch_snapshot >"$pre_remote_refs"
remote_branch_snapshot_without_assigned "$branch" >"$pre_remote_refs_without_assigned"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_file="$LOG_DIR/${assignment_id}-${timestamp}.log"
archive_file="$ARCHIVE_DIR/${assignment_id}-${timestamp}.md"
pi_provider="local-llama"
pi_thinking="high"
pi_session_id="openlunum-${assignment_id}"
pi_model_argument="$pi_model"

cp "$ASSIGNMENT_FILE" "$archive_file"
rm -f "$ASSIGNMENT_FILE"

set +e
timeout "$PI_TIMEOUT_SECONDS" pi --print \
  --provider "$pi_provider" \
  --model "$pi_model_argument" \
  --thinking "$pi_thinking" \
  --session-id "$pi_session_id" \
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
  echo "dispatch_pi_model_declared: $pi_model"
  echo "dispatch_pi_model_argument: $pi_model_argument"
  echo "dispatch_pi_provider: $pi_provider"
  echo "dispatch_pi_thinking: $pi_thinking"
  echo "dispatch_pi_session_id: $pi_session_id"
  echo "dispatch_pi_timeout_seconds: $PI_TIMEOUT_SECONDS"
} >> "$archive_file"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$branch" ]]; then
  fail_blocked "branch switched during worker dispatch: expected $branch, found ${current_branch:-detached}"
fi

local_branch_snapshot "$branch" >"$post_local_refs"
remote_branch_snapshot >"$post_remote_refs"
remote_branch_snapshot_without_assigned "$branch" >"$post_remote_refs_without_assigned"
local_branch_head="$(git rev-parse --verify "$branch^{commit}")"
pre_remote_branch_oid="$(awk -v branch="refs/heads/$branch" '$2 == branch { print $1; exit }' "$pre_remote_refs")"
post_remote_branch_oid="$(remote_branch_oid "$branch")"

if ! diff -u "$pre_local_refs" "$post_local_refs" >/dev/null; then
  fail_blocked "unauthorized local branch mutation detected"
fi

if ! diff -u "$pre_remote_refs_without_assigned" "$post_remote_refs_without_assigned" >/dev/null; then
  fail_blocked "unauthorized remote branch mutation detected"
fi

if [[ -z "$post_remote_branch_oid" ]]; then
  if [[ -n "$pre_remote_branch_oid" ]]; then
    fail_blocked "unauthorized remote branch mutation detected"
  fi
elif [[ "$post_remote_branch_oid" != "$local_branch_head" ]]; then
  fail_blocked "unauthorized remote branch mutation detected"
fi

if [[ $pi_exit -eq 124 ]]; then
  echo "BLOCKED: worker dispatch timed out after ${PI_TIMEOUT_SECONDS}s" >&2
  exit 124
fi

if [[ $pi_exit -ne 0 ]]; then
  echo "BLOCKED: worker dispatch exited with code $pi_exit" >&2
  exit "$pi_exit"
fi

echo "DISPATCH COMPLETE: assignment=$assignment_id issue=$issue branch=$branch"
