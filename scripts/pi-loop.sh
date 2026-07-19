#!/usr/bin/env bash
set -uo pipefail
# Singleton guard: flock held for process lifetime; second instances exit
exec 9>"/tmp/openlunum-$(basename "$0").lock"
if ! flock -n 9; then
  echo "another $(basename "$0") instance holds the lock — exiting" >&2
  exit 0
fi
# NOTE: no `set -e` — the loop must survive verify failures and non-zero exits

# Pi autonomous campaign loop for OpenLunum
# Usage: ./scripts/pi-loop.sh [worktree-path]
#
# Runs Pi in non-interactive mode with the campaign prompt. After each run:
#   1. verifies Pi's branch (quality signal)
#   2. auto-opens a draft PR for any agent branch that lacks one
#   3. resets to main and verifies main (infrastructure signal)
# Writes a STUCK flag after MAX_CONSECUTIVE_FAILURES or on abnormal exit.
# A watcher daemon (Claude scheduled routine) monitors the STUCK flag.

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
LOGDIR="$WORKDIR/reports/pi-loop"
STUCK_FILE="$LOGDIR/STUCK"
STATUS_LOG="$LOGDIR/loop-status.log"
CLAIMS_FILE="$LOGDIR/claims.txt"
MAX_CONSECUTIVE_FAILURES=3
COOLDOWN_SECONDS=30
PI_TIMEOUT_SECONDS=1800  # 30 min max per Pi run
PI_MODEL="${PI_MODEL:-openai/qwen3-coder-30b-a3b}"

TASK_PROMPT_FILE="$WORKDIR/scripts/pi-task-prompt.md"

mkdir -p "$LOGDIR"

failure_count=0
clean_exit=0

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

# Trap: any exit that is not marked clean writes a STUCK file so the
# watcher catches loop-script crashes, not just 3-strike failures.
on_exit() {
  if [[ "$clean_exit" != "1" && ! -f "$STUCK_FILE" ]]; then
    write_stuck "${logfile:-none}" "loop script exited abnormally (trap EXIT)"
  fi
}
trap on_exit EXIT

clean_stale_dist() {
  # Remove compiled files that lack source counterparts
  local pkg f base dir src
  for pkg in packages/core packages/eval packages/cli packages/adapter-openunum; do
    if [[ -d "$WORKDIR/$pkg/dist" ]]; then
      for f in "$WORKDIR/$pkg"/dist/test/*.test.js "$WORKDIR/$pkg"/dist/src/*.js; do
        [[ -f "$f" ]] || continue
        base=$(basename "$f" .js)
        dir=$(basename "$(dirname "$f")")
        src="$WORKDIR/$pkg/$dir/${base}.ts"
        if [[ ! -f "$src" ]]; then
          rm -f "${f%.js}".*
        fi
      done
    fi
  done
}

generate_claims() {
  # A branch is a claim only while it has an open PR, or while it is a
  # local, unpublished branch ahead of main. Historical remote branches are
  # retained after merge and must not permanently block their queue topics.
  local remote_branches branch ahead
  # Fetch the remote branch names once. Doing an ls-remote per historical
  # branch delays every worker run and leaves the model with an empty claim set.
  remote_branches=$(git ls-remote --heads origin 'refs/heads/agent/*' 2>/dev/null \
    | awk '{sub("refs/heads/", "", $2); print $2}')
  {
    echo "TASKS ALREADY CLAIMED — active agent branches only (do NOT duplicate these topics; pick a DIFFERENT unchecked item from WORK_QUEUE.md):"
    timeout 60 gh pr list --repo corpunum/OpenLunum --state open --json headRefName --jq \
      '.[] | select(.headRefName | startswith("agent/")) | "- \(.headRefName)"' 2>/dev/null || true
    while read -r branch; do
      [[ -n "$branch" ]] || continue
      ahead=$(git -C "$WORKDIR" rev-list --count "origin/main..$branch" 2>/dev/null || echo 0)
      [[ "$ahead" -gt 0 ]] || continue
      if ! grep -Fqx "$branch" <<< "$remote_branches"; then
        echo "- $branch"
      fi
    done < <(git -C "$WORKDIR" branch --list 'agent/*' --format='%(refname:short)' 2>/dev/null)
  } | sort -u > "$CLAIMS_FILE"
}

auto_open_prs() {
  # For any local agent branch ahead of main with no open PR: push + draft PR
  local branch ahead pr_count
  for branch in $(git -C "$WORKDIR" for-each-ref --sort=-committerdate refs/heads/agent/ --format='%(refname:short)' --count=5 2>/dev/null); do
    case "$branch" in agent/eval/*) continue ;; esac  # eval sandbox branches are never real work
    ahead=$(git -C "$WORKDIR" rev-list --count "origin/main..$branch" 2>/dev/null || echo 0)
    [[ "$ahead" -gt 0 ]] || continue
    # A stale branch can be ahead by commit ancestry while its file tree is
    # identical to main. It is not work and must not create a duplicate PR.
    git -C "$WORKDIR" diff --quiet "origin/main...$branch" -- || continue
    pr_count=$(gh pr list --repo corpunum/OpenLunum --head "$branch" --state open --json number --jq 'length' 2>/dev/null || echo error)
    if [[ "$pr_count" == "0" ]]; then
      git -C "$WORKDIR" push -u origin "$branch" 2>/dev/null || true
      if gh pr create --repo corpunum/OpenLunum --draft --head "$branch" \
          --title "agent: $(git -C "$WORKDIR" log -1 --format=%s "$branch")" \
          --body "Auto-opened by pi-loop for branch \`$branch\` ($ahead commits ahead of main). Verify status: see loop log." 2>/dev/null; then
        log "auto-PR opened for $branch ($ahead commits)"
      fi
    fi
  done
}

# Clean any stale STUCK flag on startup
if [[ -f "$STUCK_FILE" ]]; then
  log "Clearing stale STUCK flag from previous run"
  rm -f "$STUCK_FILE"
fi

log "Pi loop starting in $WORKDIR (model: $PI_MODEL)"

while true; do
  timestamp=$(date +%Y%m%dT%H%M%S)
  logfile="$LOGDIR/loop-$timestamp.log"

  log "Starting Pi run → $logfile"

  # Reset to main before each run to avoid stale branch state
  cd "$WORKDIR"
  git fetch origin main 2>>"$logfile" || true
  git checkout main 2>>"$logfile" || true
  git reset --hard origin/main 2>>"$logfile" || true

  clean_stale_dist
  pnpm build >>"$logfile" 2>&1 || true

  generate_claims

  # Run Pi with the campaign prompt, non-interactive (with timeout).
  # Daily session id gives Pi within-day memory of what it already did.
  session_id="openlunum-campaign-$(date +%Y%m%d%H)"
  timeout "$PI_TIMEOUT_SECONDS" pi --print \
    --provider local-llama \
    --model "$PI_MODEL" \
    --thinking high \
    --session-id "$session_id" \
    --append-system-prompt "@$WORKDIR/AGENTS.md" \
    --append-system-prompt "@$WORKDIR/WORK_QUEUE.md" \
    --append-system-prompt "@$TASK_PROMPT_FILE" \
    --append-system-prompt "@$CLAIMS_FILE" \
    "Continue the OpenLunum campaign. You are in $WORKDIR. Follow the task prompt instructions exactly. Do not work on tasks listed in the claims file." \
    2>&1 | tee "$logfile"
  pi_exit=${PIPESTATUS[0]}
  if [[ $pi_exit -eq 124 ]]; then
    log "Pi run TIMED OUT after ${PI_TIMEOUT_SECONDS}s — killing and continuing"
  fi

  cd "$WORKDIR"

  # --- Branch verify: quality signal on Pi's actual work ---
  pi_branch=$(git branch --show-current 2>/dev/null || echo main)
  branch_verify="skipped"
  if [[ "$pi_branch" == agent/* ]]; then
    clean_stale_dist
    if pnpm verify >>"$logfile" 2>&1; then
      branch_verify="pass"
    else
      branch_verify="fail"
    fi
    log "branch-verify: $branch_verify $pi_branch"
  fi

  # Auto-open draft PRs for agent branches without one
  auto_open_prs

  # --- Main verify: infrastructure signal ---
  git checkout main 2>/dev/null || true
  git reset --hard origin/main 2>/dev/null || true
  clean_stale_dist

  verify_output=$(pnpm verify 2>&1) || true
  if echo "$verify_output" | grep -qE 'ELIFECYCLE|ERR_PNPM|Failed'; then
    verify_exit=1
  else
    verify_exit=0
  fi
  echo "$verify_output" >> "$logfile"

  if [[ $verify_exit -eq 0 && "$branch_verify" != "fail" ]]; then
    failure_count=0
    log "Loop succeeded — main verify passed, branch-verify=$branch_verify (pi exit: $pi_exit)"
  else
    failure_count=$((failure_count + 1))
    last_error=$(echo "$verify_output" | grep -E '(FAIL|Error|error|fail)' | tail -5)
    log "Loop FAILED (main-verify: $verify_exit, branch-verify: $branch_verify, count: $failure_count/$MAX_CONSECUTIVE_FAILURES, pi exit: $pi_exit)"

    if (( failure_count >= MAX_CONSECUTIVE_FAILURES )); then
      log "STOPPED after $MAX_CONSECUTIVE_FAILURES consecutive failures"
      write_stuck "$logfile" "$last_error"
      clean_exit=1  # STUCK already written; don't double-write in trap
      exit 1
    fi
  fi

  log "Cooling down ${COOLDOWN_SECONDS}s before next run"
  sleep "$COOLDOWN_SECONDS"
done
