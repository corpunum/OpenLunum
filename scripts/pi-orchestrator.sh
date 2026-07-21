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

log() { echo "[$(date -Iseconds)] $*" | tee -a "$ORCH_LOG"; }
notify() { DISPLAY=:0 notify-send "OpenLunum orchestrator" "$1" 2>/dev/null || true; }

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

# ---- 2. Health & Tunnel Check --------------------------------------------
# Note (Issues #276, #275, #271): Persistent model and merge loops are retired.
# Orchestrator monitors health-safe infrastructure and tunnels only.

tunnel_active=$(systemctl --user is-active openlunum-rog-tunnel 2>/dev/null || echo "inactive")
if [[ "$tunnel_active" != "active" ]]; then
  log "TUNNEL: inactive (openlunum-rog-tunnel)"
else
  log "TUNNEL: active"
fi

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
        log "AUTO-FIX: verify still fails after pull — escalating"
        echo "orchestrator-autofix-failed $(date -Iseconds)" > "$NEEDS_CLOUD"
        notify "STUCK auto-fix failed — needs cloud orchestrator"
      fi
    else
      log "AUTO-FIX: pull failed (dirty state?) — escalating"
      echo "orchestrator-pull-failed $(date -Iseconds)" > "$NEEDS_CLOUD"
      notify "STUCK auto-fix failed — git pull rejected"
    fi
  else
    log "STUCK present but not three-strike — leaving for watchdog"
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
