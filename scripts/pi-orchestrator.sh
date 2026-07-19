#!/usr/bin/env bash
set -uo pipefail
# OpenLunum local orchestrator — replaces Claude's 3h check-ins.
# Runs via systemd user timer every 3 hours.
# Handles: health checks, STUCK auto-fix, stale PR cleanup, temp monitoring.
# Escalates to NEEDS_CLOUD flag only when it can't self-resolve.

REPO=/home/corpunum/OpenLunum
REPORTS="$REPO/reports"
ORCH_LOG="$REPORTS/orchestrator/status.log"
ORCH_DIR="$REPORTS/orchestrator"
LOOP_DIR="$REPORTS/pi-loop"
MERGE_LOG="$REPORTS/pi-merge/merge-status.log"
NEEDS_CLOUD="$ORCH_DIR/NEEDS_CLOUD"
PI_MODEL="${PI_MODEL:-openai/qwen3.6-35b-a3b}"
REVIEW_MODEL="${REVIEW_MODEL:-openai/superqwen-agentworld-35b-a3b}"
LLM_URL="http://localhost:8080/v1/chat/completions"
LLM_TIMEOUT=300

log() { echo "[$(date -Iseconds)] $*" | tee -a "$ORCH_LOG"; }
notify() { DISPLAY=:0 notify-send "OpenLunum orchestrator" "$1" 2>/dev/null || true; }

# Ask local LLM for diagnosis before escalating to cloud.
# Usage: llm_diagnose "context about the problem" "specific question"
# Returns 0 if LLM produced actionable advice, 1 if unavailable/unhelpful.
# Sets LLM_ADVICE variable with the response.
llm_diagnose() {
  local context="$1" question="$2"
  local system_prompt="You are the local orchestrator for OpenLunum, a TypeScript monorepo. The autonomous worker loop builds PRs, a reviewer reviews them, and a merge bot merges approved ones. Your job: diagnose issues and give a concrete bash fix (3 commands max). If you cannot diagnose from the given context, say ESCALATE."
  local payload
  payload=$(python3 -c "
import json, sys
msg = [
  {'role': 'system', 'content': sys.argv[1]},
  {'role': 'user', 'content': sys.argv[2] + '\n\nContext:\n' + sys.argv[3]}
]
print(json.dumps({'model': sys.argv[4], 'messages': msg, 'max_tokens': 4096}))
" "$system_prompt" "$question" "$context" "$PI_MODEL" 2>/dev/null)

  if [[ -z "$payload" ]]; then
    log "LLM-DIAG: failed to build payload"
    LLM_ADVICE=""
    return 1
  fi

  local response
  response=$(curl -s --max-time "$LLM_TIMEOUT" "$LLM_URL" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)

  if [[ -z "$response" ]]; then
    log "LLM-DIAG: no response from LLM (timeout or server down)"
    LLM_ADVICE=""
    return 1
  fi

  LLM_ADVICE=$(echo "$response" | python3 -c "
import json, sys
try:
  r = json.load(sys.stdin)
  print(r['choices'][0]['message'].get('content',''))
except: pass
" 2>/dev/null)

  if [[ -z "$LLM_ADVICE" || "$LLM_ADVICE" == *"ESCALATE"* ]]; then
    log "LLM-DIAG: model says ESCALATE or gave empty response"
    LLM_ADVICE=""
    return 1
  fi

  log "LLM-DIAG: got advice (${#LLM_ADVICE} chars)"
  echo "$LLM_ADVICE" > "$ORCH_DIR/last-llm-advice.txt"
  return 0
}

# Try to execute LLM-suggested bash commands (max 3, safety-filtered).
# Returns 0 if all commands succeeded.
llm_try_fix() {
  local advice="$1"
  local commands
  commands=$(echo "$advice" | grep -oP '(?<=```bash\n)[\s\S]*?(?=\n```)' 2>/dev/null || \
             echo "$advice" | grep -E '^\s*\$?\s*(cd |git |pnpm |find |rm -rf.*/dist|npm )' 2>/dev/null || \
             echo "")

  if [[ -z "$commands" ]]; then
    log "LLM-FIX: no executable commands extracted"
    return 1
  fi

  local blocked=("rm -rf /" "rm -rf ~" "git push origin main" "git push -f" "DROP " "shutdown" "reboot")
  local cmd_count=0
  while IFS= read -r cmd; do
    cmd=$(echo "$cmd" | sed 's/^\s*\$\s*//' | xargs)
    [[ -z "$cmd" || "$cmd" == "#"* ]] && continue

    local is_blocked=false
    for b in "${blocked[@]}"; do
      if [[ "$cmd" == *"$b"* ]]; then
        log "LLM-FIX: BLOCKED dangerous command: $cmd"
        is_blocked=true
        break
      fi
    done
    $is_blocked && continue

    cmd_count=$((cmd_count + 1))
    if (( cmd_count > 3 )); then
      log "LLM-FIX: skipping commands beyond limit of 3"
      break
    fi

    log "LLM-FIX: running: $cmd"
    if eval "$cmd" >> "$ORCH_LOG" 2>&1; then
      log "LLM-FIX: OK"
    else
      log "LLM-FIX: command failed (exit $?)"
      return 1
    fi
  done <<< "$commands"

  if (( cmd_count == 0 )); then
    log "LLM-FIX: no safe commands found"
    return 1
  fi
  return 0
}

# ---- 1. Flag check --------------------------------------------------------
log "=== Orchestrator check-in ==="

flags_ok=true
for f in ESCALATED THERMAL_HALT PAUSED STUCK; do
  if [[ -f "$LOOP_DIR/$f" ]]; then
    log "FLAG: $f = $(head -1 "$LOOP_DIR/$f")"
    flags_ok=false
  fi
done
$flags_ok && log "FLAGS: all clear"

# ---- 2. Loop health -------------------------------------------------------
loops_ok=true
declare -A LOOP_PATTERNS=(
  [worker]='pi-loop\.sh'
  [reviewer]='pi-review-loop\.sh'
  [merge]='pi-merge-loop\.sh'
  [docs]='pi-docs-loop\.sh'
)
for name in worker reviewer merge docs; do
  if ! pgrep -f "${LOOP_PATTERNS[$name]}" >/dev/null 2>&1; then
    log "LOOP DOWN: $name"
    loops_ok=false
  fi
done

# Tunnel check
tunnel_active=$(systemctl --user is-active openlunum-rog-tunnel 2>/dev/null || echo "inactive")
[[ "$tunnel_active" != "active" ]] && log "TUNNEL: inactive" || true

$loops_ok && log "LOOPS: all running"

# ---- 3. Temps --------------------------------------------------------------
if [[ -f "$LOOP_DIR/temps.csv" ]]; then
  last_temp=$(grep -v '>>>' "$LOOP_DIR/temps.csv" | tail -1)
  if [[ -n "$last_temp" ]]; then
    cpu=$(echo "$last_temp" | cut -d, -f2)
    gpu=$(echo "$last_temp" | cut -d, -f3)
    log "TEMPS: CPU=${cpu}C GPU=${gpu}C"
    if (( cpu > 95 || gpu > 95 )); then
      log "TEMP WARNING: high temps detected"
    fi
  fi
fi

# ---- 4. Merge log — check for reverts -------------------------------------
if [[ -f "$MERGE_LOG" ]]; then
  recent_reverts=$(tail -50 "$MERGE_LOG" | grep -c 'auto-reverted\|BROKE main' || true)
  recent_merges=$(tail -50 "$MERGE_LOG" | grep -c 'MERGED' || true)
  log "MERGES: recent=$((recent_merges/2)) reverts=$((recent_reverts/2))"
  if (( recent_reverts > 4 )); then
    log "REVERT ALERT: $recent_reverts reverts in recent history"
    revert_context=$(tail -50 "$MERGE_LOG" | grep -A2 'auto-reverted\|BROKE main' | head -30)
    if llm_diagnose "$revert_context" "There have been $recent_reverts reverts recently. What pattern do you see? Should the worker be paused or is this a systemic issue?"; then
      log "LLM-DIAG: revert analysis: $(echo "$LLM_ADVICE" | head -3)"
    fi
    notify "High revert rate: $recent_reverts"
  fi
fi

# ---- 5. Auto-fix STUCK ----------------------------------------------------
if [[ -f "$LOOP_DIR/STUCK" ]]; then
  stuck_reason=$(cat "$LOOP_DIR/STUCK")

  if echo "$stuck_reason" | grep -q 'failure_count: 3'; then
    log "AUTO-FIX: three-strike STUCK — attempting pull + rebuild"

    cd "$REPO" || exit 1

    # Stash any dirty state
    git checkout -- . 2>/dev/null || true

    # Pull latest main
    if git pull --ff-only origin main 2>/dev/null; then
      log "AUTO-FIX: pulled latest main"

      # Clean and rebuild
      find packages -name dist -type d -exec rm -rf {} + 2>/dev/null
      if pnpm build 2>/dev/null && pnpm verify 2>/dev/null; then
        log "AUTO-FIX: verify passes — clearing STUCK + ESCALATED"
        rm -f "$LOOP_DIR/STUCK" "$LOOP_DIR/ESCALATED"
        notify "Auto-fixed STUCK: pulled latest, verify green"
      else
        log "AUTO-FIX: verify still fails after pull — trying LLM diagnosis"
        verify_err=$(pnpm verify 2>&1 | tail -40)
        if llm_diagnose "$verify_err" "pnpm verify fails after git pull --ff-only. What is the root cause and how to fix it?"; then
          log "LLM-DIAG: attempting LLM-suggested fix"
          if llm_try_fix "$LLM_ADVICE" && pnpm build 2>/dev/null && pnpm verify 2>/dev/null; then
            log "LLM-FIX: verify passes after LLM fix — clearing STUCK"
            rm -f "$LOOP_DIR/STUCK" "$LOOP_DIR/ESCALATED"
            notify "LLM auto-fixed STUCK: $(head -1 "$ORCH_DIR/last-llm-advice.txt")"
          else
            log "LLM-FIX: LLM fix didn't resolve — escalating to cloud"
            echo "orchestrator-autofix-failed+llm $(date -Iseconds)" > "$NEEDS_CLOUD"
            notify "STUCK: bash + LLM both failed — needs cloud"
          fi
        else
          echo "orchestrator-autofix-failed $(date -Iseconds)" > "$NEEDS_CLOUD"
          notify "STUCK auto-fix failed — needs cloud orchestrator"
        fi
      fi
    else
      log "AUTO-FIX: pull failed (dirty state?) — trying LLM diagnosis"
      git_state=$(git status --short 2>&1 | head -20)
      if llm_diagnose "$git_state" "git pull --ff-only origin main failed. Working dir state shown. How to safely resolve and pull?"; then
        if llm_try_fix "$LLM_ADVICE" && git pull --ff-only origin main 2>/dev/null; then
          log "LLM-FIX: pull succeeded after LLM fix — continuing rebuild"
          find packages -name dist -type d -exec rm -rf {} + 2>/dev/null
          if pnpm build 2>/dev/null && pnpm verify 2>/dev/null; then
            log "LLM-FIX: full recovery — clearing STUCK"
            rm -f "$LOOP_DIR/STUCK" "$LOOP_DIR/ESCALATED"
            notify "LLM auto-fixed STUCK: resolved dirty state + rebuilt"
          else
            echo "orchestrator-autofix-failed+llm $(date -Iseconds)" > "$NEEDS_CLOUD"
            notify "STUCK: LLM fixed git but verify still fails — needs cloud"
          fi
        else
          echo "orchestrator-pull-failed+llm $(date -Iseconds)" > "$NEEDS_CLOUD"
          notify "STUCK: LLM couldn't fix git pull — needs cloud"
        fi
      else
        echo "orchestrator-pull-failed $(date -Iseconds)" > "$NEEDS_CLOUD"
        notify "STUCK auto-fix failed — git pull rejected"
      fi
    fi
  else
    log "STUCK present but not three-strike — leaving for watchdog"
  fi
fi

# ---- 5b. LLM-assisted loop diagnosis --------------------------------------
if ! $loops_ok; then
  down_loops=""
  for name in worker reviewer merge; do
    if ! pgrep -f "${LOOP_PATTERNS[$name]}" >/dev/null 2>&1; then
      down_loops="$down_loops $name"
    fi
  done
  if [[ -n "$down_loops" ]]; then
    recent_log=""
    for name in $down_loops; do
      case "$name" in
        worker)  recent_log="$recent_log\n--- worker nohup.log ---\n$(tail -30 "$LOOP_DIR/nohup.log" 2>/dev/null)" ;;
        reviewer) recent_log="$recent_log\n--- reviewer log ---\n$(tail -30 "$REPORTS/pi-review/nohup.log" 2>/dev/null)" ;;
        merge)   recent_log="$recent_log\n--- merge log ---\n$(tail -30 "$MERGE_LOG" 2>/dev/null)" ;;
      esac
    done
    log "LLM-DIAG: diagnosing down loops:$down_loops"
    if llm_diagnose "$(echo -e "$recent_log")" "These loops are DOWN:$down_loops. Based on their recent logs, what caused the crash and should I just restart them or fix something first?"; then
      log "LLM-DIAG: loop advice: $(echo "$LLM_ADVICE" | head -3)"
    fi
  fi
fi

# ---- 6. Stale PR cleanup --------------------------------------------------
# Close PRs that are >100 commits behind main and have no unique file changes
stale_closed=0
if command -v gh &>/dev/null; then
  open_prs=$(gh pr list --repo corpunum/OpenLunum --state open --json number,headRefName --jq '.[].number' 2>/dev/null || true)
  for pr in $open_prs; do
    behind=$(gh pr view "$pr" --repo corpunum/OpenLunum --json commits --jq '.commits | length' 2>/dev/null || echo "0")
    # Check if PR branch is very far behind (proxy: created long ago with no recent activity)
    pr_files=$(gh pr diff "$pr" --repo corpunum/OpenLunum --name-only 2>/dev/null | wc -l)
    pr_files=$((pr_files + 0))
    if (( pr_files == 0 )); then
      log "STALE PR: #$pr has no file diff — flagging for closure"
      # Don't auto-close, just flag — let the cloud orchestrator or user decide
      echo "#$pr no-diff $(date -Iseconds)" >> "$ORCH_DIR/stale-prs.log"
      stale_closed=$((stale_closed + 1))
    fi
  done
  (( stale_closed > 0 )) && log "STALE: flagged $stale_closed PRs with no diff"
fi

# ---- 7. Worker throughput tracking -----------------------------------------
# Count merges in last 3h to track velocity
if [[ -f "$MERGE_LOG" ]]; then
  cutoff=$(date -d '3 hours ago' -Iseconds 2>/dev/null || date -v-3H -Iseconds 2>/dev/null || echo "")
  if [[ -n "$cutoff" ]]; then
    merges_3h=$(awk -v c="$cutoff" '$0 ~ /MERGED/ && $0 > c' "$MERGE_LOG" | wc -l)
    merges_3h=$((merges_3h / 2))  # log has duplicate lines
    log "VELOCITY: $merges_3h merges in last 3h"
    echo "$(date -Iseconds),$merges_3h" >> "$ORCH_DIR/velocity.csv"
  fi
fi

# ---- 8. Summary -----------------------------------------------------------
if [[ -f "$NEEDS_CLOUD" ]]; then
  log "STATUS: NEEDS CLOUD ORCHESTRATOR — $(cat "$NEEDS_CLOUD")"
  notify "OpenLunum needs cloud orchestrator attention"
else
  log "STATUS: nominal"
fi

log "=== Check-in complete ==="
