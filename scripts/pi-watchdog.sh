#!/usr/bin/env bash
set -uo pipefail
# OpenLunum watchdog — runs every 5 min via systemd user timer.
# Thermal monitoring + orchestrator flag management only.
# Worker dispatch is now one-shot via pi-dispatch-once.sh — no loop restarts.
#
# Two-tier thermal policy (2026-07-20, new rig fan installed):
#   HALT_TEMP (90C)     — soft pause: touch PAUSED, no pkill. Loops check PAUSED
#                          themselves and stop dispatching new work; in-flight
#                          calls finish naturally (bounded by their own PI_TIMEOUT).
#   CRITICAL_TEMP (95C) — hard kill: only if temps keep climbing even with a
#                          soft pause already active. Matches the TEMP WARNING
#                          line pi-orchestrator.sh already uses for consistency.
#   RESUME_TEMP (78C)   — clears both flags once cooled, ~12C buffer under
#                          HALT_TEMP so it doesn't flap at the edge.

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
HALT_TEMP="${HALT_TEMP:-90}"
CRITICAL_TEMP="${CRITICAL_TEMP:-95}"
RESUME_TEMP="${RESUME_TEMP:-78}"
THERMAL_FLAG="$ORCHDIR/THERMAL_HALT"
PAUSED_FLAG="$ORCHDIR/PAUSED"

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

soft_pause() {
  echo "thermal-soft-pause $(date -Iseconds) ${MAX_T}C" > "$THERMAL_FLAG"
  touch "$PAUSED_FLAG"
  notify "Soft pause at ${MAX_T}C — no new dispatch, cooling to <= ${RESUME_TEMP}C. In-flight work finishes normally."
}

hard_halt() {
  echo "thermal-hard-halt $(date -Iseconds) ${MAX_T}C" > "$THERMAL_FLAG"
  touch "$PAUSED_FLAG"
  pkill -f 'pi-dispatch-once' 2>/dev/null || true
  pkill -f 'pi-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-loop-ally\.sh' 2>/dev/null || true
  pkill -f 'pi-review-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-docs-loop\.sh' 2>/dev/null || true
  pkill -f 'pi-merge-loop\.sh' 2>/dev/null || true
  sleep 3
  pkill -f 'pi.*--print' 2>/dev/null || true
  notify "CRITICAL HALT at ${MAX_T}C — workers killed, paused until <= ${RESUME_TEMP}C"
}

# ---- Resume path: clears whichever tier is active once cooled -------------
if [[ -f "$THERMAL_FLAG" ]]; then
  if (( MAX_T <= RESUME_TEMP )); then
    rm -f "$THERMAL_FLAG" "$PAUSED_FLAG"
    notify "Cooled to ${MAX_T}C — thermal halt cleared (dispatch available)"
    log "thermal resume at ${MAX_T}C"
  else
    log "thermal flag held: ${MAX_T}C (resume at <= ${RESUME_TEMP}C)"
  fi
  exit 0
fi

# ---- Critical tier: hard kill, checked first so it always wins ------------
if (( MAX_T >= CRITICAL_TEMP )); then
  sleep 10
  read -r CPU_T2 GPU_T2 <<< "$(read_temps)"
  M2=$(( CPU_T2 > GPU_T2 ? CPU_T2 : GPU_T2 ))
  if (( M2 >= CRITICAL_TEMP )); then
    MAX_T=$M2
    log "critical halt: ${CPU_T}/${GPU_T}C then ${M2}C (>= ${CRITICAL_TEMP}C)"
    hard_halt
    exit 0
  fi
fi

# ---- Soft tier: pause dispatch, let loops finish in-flight work -----------
# 2026-07-20 incident: the confirm-read below used to only be compared
# against HALT_TEMP, so a reading that climbed from below CRITICAL_TEMP on
# the first read to AT/ABOVE it on the confirm-read (e.g. 92C -> 95C) fired
# soft_pause() instead of hard_halt() — the critical tier never re-checked
# after this block already claimed the temperature. Rig hit 96.9C with
# in-flight generation still running before this was caught manually. Now
# the confirm-read is checked against BOTH thresholds so escalation can't
# be skipped this way.
if (( MAX_T >= HALT_TEMP )); then
  sleep 10
  read -r CPU_T2 GPU_T2 <<< "$(read_temps)"
  M2=$(( CPU_T2 > GPU_T2 ? CPU_T2 : GPU_T2 ))
  if (( M2 >= CRITICAL_TEMP )); then
    MAX_T=$M2
    log "critical halt (escalated from soft-tier check): ${CPU_T}/${GPU_T}C then ${M2}C (>= ${CRITICAL_TEMP}C)"
    hard_halt
    exit 0
  elif (( M2 >= HALT_TEMP )); then
    MAX_T=$M2
    log "soft pause: ${CPU_T}/${GPU_T}C then ${M2}C (>= ${HALT_TEMP}C)"
    soft_pause
    exit 0
  fi
fi

# Orchestrator pause: do nothing while PAUSED exists (may be set manually too)
if [[ -f "$PAUSED_FLAG" ]] || [[ -f "$LOGDIR/PAUSED" ]]; then
  exit 0
fi

log "watchdog ok: cpu=${CPU_T}C gpu=${GPU_T}C"
