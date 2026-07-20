#!/usr/bin/env bash
set -uo pipefail
# OpenLunum watchdog — runs every 5 min via systemd user timer.
# Thermal monitoring + orchestrator flag management only.
# Worker dispatch is now one-shot via pi-dispatch-once.sh — no loop restarts.

REPO=/home/corpunum/OpenLunum
LOGDIR="$REPO/reports/pi-loop"
ORCHDIR="$REPO/reports/orchestrator"
WLOG="$LOGDIR/watchdog.log"
TEMP_LOG="$LOGDIR/temps.csv"

log() { echo "[$(date -Iseconds)] $*" >> "$WLOG"; }

notify() {
  DISPLAY=:0 notify-send "OpenLunum watchdog" "$1" 2>/dev/null || true
  log "NOTIFY: $1"
}

# ---- Thermal management -----------------------------------------------
HALT_TEMP="${HALT_TEMP:-85}"
RESUME_TEMP="${RESUME_TEMP:-75}"
THERMAL_FLAG="$ORCHDIR/THERMAL_HALT"

read_temps() {
  local cpu=0 gpu=0 h
  for h in /sys/class/hwmon/hwmon*; do
    case "$(cat "$h/name" 2>/dev/null)" in
      zenpower|k10temp)
        [[ -f "$h/temp2_input" ]] && cpu=$(( $(cat "$h/temp2_input") / 1000 )) ;;
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

halt_workers() {
  echo "thermal-halt $(date -Iseconds) ${MAX_T}C" > "$THERMAL_FLAG"
  touch "$ORCHDIR/PAUSED"
  pkill -f 'pi-dispatch-once' 2>/dev/null || true
  pkill -f 'pi-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-review-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-docs-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-merge-loop\.sh' 2>/dev/null || true
  sleep 3
  pkill -f 'pi.*--print' 2>/dev/null || true
  notify "THERMAL HALT at ${MAX_T}C — workers killed, paused until <= ${RESUME_TEMP}C"
}

if [[ -f "$THERMAL_FLAG" ]]; then
  if (( MAX_T <= RESUME_TEMP )); then
    rm -f "$THERMAL_FLAG" "$ORCHDIR/PAUSED"
    notify "Cooled to ${MAX_T}C — thermal halt cleared (dispatch available)"
    log "thermal resume at ${MAX_T}C"
  fi
  exit 0
fi

if (( MAX_T >= HALT_TEMP )); then
  sleep 10
  read -r CPU_T2 GPU_T2 <<< "$(read_temps)"
  M2=$(( CPU_T2 > GPU_T2 ? CPU_T2 : GPU_T2 ))
  if (( M2 >= HALT_TEMP )); then
    log "thermal halt: ${MAX_T}C then ${M2}C (>= ${HALT_TEMP}C)"
    halt_workers
    exit 0
  fi
fi

# Orchestrator pause: do nothing while PAUSED exists
if [[ -f "$ORCHDIR/PAUSED" ]] || [[ -f "$LOGDIR/PAUSED" ]]; then
  exit 0
fi

log "watchdog ok: cpu=${CPU_T}C gpu=${GPU_T}C"
