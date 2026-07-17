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

# ---- Thermal management -----------------------------------------------
# Log CPU/GPU temps every run; halt all loops at sustained >= HALT_TEMP,
# auto-resume at <= RESUME_TEMP. Strix Halo steers clocks at ~98C by
# design — the halt targets sustained pinning, giving real cool-downs.
HALT_TEMP="${HALT_TEMP:-99}"
RESUME_TEMP="${RESUME_TEMP:-85}"
THERMAL_FLAG="$LOGDIR/THERMAL_HALT"
TEMP_LOG="$LOGDIR/temps.csv"

read_temps() {
  local cpu=0 gpu=0 h
  for h in /sys/class/hwmon/hwmon*; do
    case "$(cat "$h/name" 2>/dev/null)" in
      zenpower|k10temp)
        [[ -f "$h/temp1_input" ]] && cpu=$(( $(cat "$h/temp1_input") / 1000 )) ;;
      amdgpu)
        [[ -f "$h/temp1_input" ]] && gpu=$(( $(cat "$h/temp1_input") / 1000 )) ;;
    esac
  done
  echo "$cpu $gpu"
}

read -r CPU_T GPU_T <<< "$(read_temps)"
freq=$(awk '/cpu MHz/ {sum+=$4; n++} END {printf "%.0f", sum/n}' /proc/cpuinfo 2>/dev/null || echo 0)
echo "$(date -Iseconds),$CPU_T,$GPU_T,$freq" >> "$TEMP_LOG"
MAX_T=$(( CPU_T > GPU_T ? CPU_T : GPU_T ))

halt_loops() {
  touch "$LOGDIR/PAUSED" "$THERMAL_FLAG"
  pkill -f 'pi-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-review-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-docs-loop\.sh' 2>/dev/null || true
  sleep 3
  pkill -f 'pi --print' 2>/dev/null || true
  rm -f "$STUCK"
  notify "THERMAL HALT at ${MAX_T}C — loops paused until <= ${RESUME_TEMP}C"
}

resume_loops() {
  rm -f "$THERMAL_FLAG" "$LOGDIR/PAUSED" "$STUCK"
  PI_MODEL="$PI_MODEL" nohup bash "$REPO/scripts/pi-loop.sh" "$REPO" > "$LOGDIR/nohup.log" 2>&1 &
  REVIEW_MODEL="${REVIEW_MODEL:-openai/superqwen-agentworld-35b-a3b}" nohup bash "$REPO/scripts/pi-review-loop.sh" > "$REPO/reports/pi-review/nohup.log" 2>&1 &
  DOCS_MODEL="$PI_MODEL" nohup bash "$REPO/scripts/pi-docs-loop.sh" > "$REPO/reports/pi-docs/nohup.log" 2>&1 &
  notify "Cooled to ${MAX_T}C — loops resumed"
  log "thermal resume at ${MAX_T}C"
}

if [[ -f "$THERMAL_FLAG" ]]; then
  # We own the pause: resume only when cooled
  if (( MAX_T <= RESUME_TEMP )); then
    resume_loops
  fi
  exit 0
fi

if (( MAX_T >= HALT_TEMP )) && [[ ! -f "$LOGDIR/PAUSED" ]]; then
  # Confirm it is sustained, not a spike
  sleep 10
  read -r CPU_T2 GPU_T2 <<< "$(read_temps)"
  M2=$(( CPU_T2 > GPU_T2 ? CPU_T2 : GPU_T2 ))
  if (( M2 >= HALT_TEMP )); then
    log "thermal halt: ${MAX_T}C then ${M2}C (>= ${HALT_TEMP}C)"
    halt_loops
    exit 0
  fi
fi
# ---- end thermal management -------------------------------------------

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
