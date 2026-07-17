#!/usr/bin/env bash
set -uo pipefail
# OpenLunum Pi loop watchdog — runs every 5 min via systemd user timer.
# Handles the mechanical babysitting so the Claude watcher can run rarely.
#
#   loop dead, no STUCK            → restart (rate-limited)
#   STUCK from abnormal exit trap  → clear + restart (rate-limited)
#   STUCK from 3-strike failures   → leave for Claude, notify once
#   too many restarts in an hour   → stop restarting, notify once

REPO=/home/corpunum/OpenLunum
LOGDIR="$REPO/reports/pi-loop"
STUCK="$LOGDIR/STUCK"
WLOG="$LOGDIR/watchdog.log"
RESTART_LOG="$LOGDIR/watchdog-restarts.log"
ESCALATION_FLAG="$LOGDIR/ESCALATED"
MAX_RESTARTS_PER_HOUR=4
PI_MODEL="${PI_MODEL:-openai/qwen3.6-35b-a3b}"

log() { echo "[$(date -Iseconds)] $*" >> "$WLOG"; }

notify() {
  DISPLAY=:0 notify-send "OpenLunum watchdog" "$1" 2>/dev/null || true
  log "NOTIFY: $1"
}

recent_restarts() {
  local cutoff
  cutoff=$(date -d '1 hour ago' +%s)
  [[ -f "$RESTART_LOG" ]] || { echo 0; return; }
  awk -v c="$cutoff" '$1 >= c' "$RESTART_LOG" | wc -l
}

restart_loop() {
  if (( $(recent_restarts) >= MAX_RESTARTS_PER_HOUR )); then
    if [[ ! -f "$ESCALATION_FLAG" ]]; then
      echo "restart-rate-limit $(date -Iseconds)" > "$ESCALATION_FLAG"
      notify "Restart rate limit hit ($MAX_RESTARTS_PER_HOUR/h) — leaving for Claude"
    fi
    return 1
  fi
  date +%s >> "$RESTART_LOG"
  rm -f "$STUCK"
  PI_MODEL="$PI_MODEL" nohup bash "$REPO/scripts/pi-loop.sh" "$REPO" > "$LOGDIR/nohup.log" 2>&1 &
  log "restarted pi-loop (pid $!)"
  rm -f "$ESCALATION_FLAG"
}

alive() { pgrep -f 'pi-loop\.sh' >/dev/null 2>&1; }

# Nightly window (or manual maintenance) pause: do nothing while PAUSED exists
if [[ -f "$LOGDIR/PAUSED" ]]; then
  exit 0
fi

if [[ -f "$STUCK" ]]; then
  if grep -q 'exited abnormally' "$STUCK" 2>/dev/null; then
    log "STUCK from abnormal exit — auto-restarting"
    restart_loop
  else
    # 3-strike failure: needs real diagnosis
    if [[ ! -f "$ESCALATION_FLAG" ]]; then
      echo "three-strike $(date -Iseconds)" > "$ESCALATION_FLAG"
      notify "Pi loop STUCK on repeated verify failures — Claude needed"
    fi
  fi
elif ! alive; then
  log "loop dead without STUCK — auto-restarting"
  restart_loop
fi
