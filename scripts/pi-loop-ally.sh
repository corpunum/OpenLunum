#!/usr/bin/env bash
set -uo pipefail
# Singleton guard: flock held for process lifetime; second instances exit
exec 9>"/tmp/openlunum-$(basename "$0").lock"
if ! flock -n 9; then
  echo "another $(basename "$0") instance holds the lock — exiting" >&2
  exit 0
fi
# NOTE: no `set -e` — the loop must survive verify failures and non-zero exits

# Pi worker loop targeting the ROG Ally (rog-llama provider, port 18084 via
# the existing openlunum-rog-tunnel.service SSH tunnel), not this rig's router.
# Thin variant of pi-loop.sh: same protocol, different provider/model/worktree.
#
# 2026-07-20: Ally RAM is critically tight (19/22GB used, ~288MB free at last
# check). PI_MODEL defaults to Qwen3.5-4B-MTP-Q4_K_M because it is ALREADY
# LOADED on the Ally's router — do not point this at an unloaded model (e.g.
# the 9B coder) without first confirming free RAM on the Ally directly; an
# on-demand load there can OOM the device.
#
# Usage: ./scripts/pi-loop-ally.sh [worktree-path]

WORKDIR="${1:-/home/corpunum/openlunum-workers/worker-ally}"
LOGDIR="$WORKDIR/reports/pi-loop-ally"
STUCK_FILE="$LOGDIR/STUCK"
STATUS_LOG="$LOGDIR/loop-status.log"
CLAIMS_FILE="$LOGDIR/claims.txt"
MAX_CONSECUTIVE_FAILURES=3
COOLDOWN_SECONDS=30
PI_TIMEOUT_SECONDS=1800  # 30 min max per Pi run
PI_PROVIDER="${PI_PROVIDER:-rog-llama}"
PI_MODEL="${PI_MODEL:-Qwen3.5-4B-MTP-Q4_K_M}"

REPO=/home/corpunum/OpenLunum
TASK_PROMPT_FILE="$REPO/scripts/pi-task-prompt.md"

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

on_exit() {
  if [[ "$clean_exit" != "1" && ! -f "$STUCK_FILE" ]]; then
    write_stuck "${logfile:-none}" "loop script exited abnormally (trap EXIT)"
  fi
}
trap on_exit EXIT

clean_stale_dist() {
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
  local remote_branches branch ahead
  remote_branches=$(git ls-remote --heads origin 'refs/heads/agent/*' 2>/dev/null \
    | awk '{sub("refs/heads/", "", $2); print $2}')
  {
    echo "TASKS ALREADY CLAIMED — active agent branches only (do NOT duplicate these topics; pick a DIFFERENT unchecked item):"
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
  local branch ahead pr_count
  for branch in $(git -C "$WORKDIR" for-each-ref --sort=-committerdate refs/heads/agent/ --format='%(refname:short)' --count=5 2>/dev/null); do
    case "$branch" in agent/eval/*) continue ;; esac
    ahead=$(git -C "$WORKDIR" rev-list --count "origin/main..$branch" 2>/dev/null || echo 0)
    [[ "$ahead" -gt 0 ]] || continue
    git -C "$WORKDIR" diff --quiet "origin/main...$branch" -- || continue
    pr_count=$(gh pr list --repo corpunum/OpenLunum --head "$branch" --state open --json number --jq 'length' 2>/dev/null || echo error)
    if [[ "$pr_count" == "0" ]]; then
      git -C "$WORKDIR" push -u origin "$branch" 2>/dev/null || true
      if gh pr create --repo corpunum/OpenLunum --draft --head "$branch" \
          --title "agent(ally): $(git -C "$WORKDIR" log -1 --format=%s "$branch")" \
          --body "Auto-opened by pi-loop-ally for branch \`$branch\` ($ahead commits ahead of main). Small-model lane (ROG Ally, ${PI_MODEL}) — expect lighter-weight changes than the rig workers." 2>/dev/null; then
        log "auto-PR opened for $branch ($ahead commits)"
      fi
    fi
  done
}

if [[ -f "$STUCK_FILE" ]]; then
  log "Clearing stale STUCK flag from previous run"
  rm -f "$STUCK_FILE"
fi

log "Pi ally-loop starting in $WORKDIR (provider: $PI_PROVIDER, model: $PI_MODEL)"

while true; do
  # Thermal gating is rig-only (separate physical machine, no Ally telemetry
  # available today — see header note). Only honor a manual/global PAUSED.
  if [[ -f "$REPO/reports/orchestrator/PAUSED" ]]; then
    log "paused — waiting"
    sleep 60
    continue
  fi

  timestamp=$(date +%Y%m%dT%H%M%S)
  logfile="$LOGDIR/loop-$timestamp.log"

  log "Starting Pi run → $logfile"

  cd "$WORKDIR"
  git fetch origin main 2>>"$logfile" || true
  git checkout main 2>>"$logfile" || true
  git reset --hard origin/main 2>>"$logfile" || true

  clean_stale_dist
  pnpm build >>"$logfile" 2>&1 || true

  generate_claims

  session_id="openlunum-campaign-ally-$(date +%Y%m%d%H)"
  timeout "$PI_TIMEOUT_SECONDS" pi --print \
    --provider "$PI_PROVIDER" \
    --model "$PI_MODEL" \
    --thinking high \
    --session-id "$session_id" \
    --append-system-prompt "@$REPO/AGENTS.md" \
    --append-system-prompt "@$TASK_PROMPT_FILE" \
    --append-system-prompt "@$CLAIMS_FILE" \
    "Continue OpenLunum work. You are in $WORKDIR on the ROG Ally lane — a small-model, lightweight-task worker (not the primary rig worker). Prefer small, well-scoped changes you can verify confidently at this model size. Follow the task prompt instructions exactly. Do not work on tasks listed in the claims file." \
    2>&1 | tee "$logfile"
  pi_exit=${PIPESTATUS[0]}
  if [[ $pi_exit -eq 124 ]]; then
    log "Pi run TIMED OUT after ${PI_TIMEOUT_SECONDS}s — killing and continuing"
  fi

  cd "$WORKDIR"

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

  auto_open_prs

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
      clean_exit=1
      exit 1
    fi
  fi

  log "Cooling down ${COOLDOWN_SECONDS}s before next run"
  sleep "$COOLDOWN_SECONDS"
done
