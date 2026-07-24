#!/usr/bin/env bash
set -uo pipefail
# OpenLunum watchdog — runs every 5 min via systemd user timer.
# Thermal monitoring + orchestrator flag management only.
# Worker dispatch is now one-shot via pi-dispatch-once.sh — no loop restarts.
#
# Sustained-duration thermal policy (2026-07-24, owner-requested retune):
#   ELEVATED_TEMP (96C) / ELEVATED_DURATION (20 min) — dispatch is allowed to
#     run above 96C. Only if a reading stays continuously above 96C for 20
#     minutes straight (tracked across watchdog runs via a state file, since
#     each run is a fresh process on a 5-minute timer) does the watchdog
#     pause. Any reading back at or below 96C resets the clock — "else let
#     it be": no pause at all below the threshold, no matter how long.
#   CRITICAL_TEMP (100C) — NOT requested by the owner; added as a last-resort
#     hardware-protection net independent of the 20-minute grace period.
#     Fires an immediate hard kill with no grace window. Remove if unwanted.
#   RESUME_TEMP (90C) — clears an active pause once cooled to <= 90C, a 6C
#     buffer under ELEVATED_TEMP so it doesn't flap right at the edge.

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
ELEVATED_TEMP="${ELEVATED_TEMP:-96}"
ELEVATED_DURATION_SECONDS="${ELEVATED_DURATION_SECONDS:-1200}"   # 20 minutes
CRITICAL_TEMP="${CRITICAL_TEMP:-100}"
RESUME_TEMP="${RESUME_TEMP:-90}"
THERMAL_FLAG="$ORCHDIR/THERMAL_HALT"
PAUSED_FLAG="$ORCHDIR/PAUSED"
ELEVATED_SINCE_FILE="$ORCHDIR/.thermal-elevated-since"

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
NOW_EPOCH=$(date +%s)

sustained_pause() {
  local elapsed_min="$1"
  echo "thermal-sustained-pause $(date -Iseconds) ${MAX_T}C (>= ${ELEVATED_TEMP}C for ${elapsed_min}min)" > "$THERMAL_FLAG"
  touch "$PAUSED_FLAG"
  notify "Sustained pause: ${MAX_T}C held above ${ELEVATED_TEMP}C for ${elapsed_min} min — no new dispatch, cooling to <= ${RESUME_TEMP}C. In-flight work finishes normally."
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

# ---- Resume path: clears an active pause once cooled -----------------------
if [[ -f "$THERMAL_FLAG" ]]; then
  if (( MAX_T <= RESUME_TEMP )); then
    rm -f "$THERMAL_FLAG" "$PAUSED_FLAG" "$ELEVATED_SINCE_FILE"
    notify "Cooled to ${MAX_T}C — thermal halt cleared (dispatch available)"
    log "thermal resume at ${MAX_T}C"
  elif (( MAX_T >= CRITICAL_TEMP )); then
    log "critical halt (escalated while flag held): ${MAX_T}C (>= ${CRITICAL_TEMP}C)"
    hard_halt
  else
    log "thermal flag held: ${MAX_T}C (resume at <= ${RESUME_TEMP}C)"
  fi
  exit 0
fi

# ---- Emergency ceiling: immediate hard kill, no grace period ---------------
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

# ---- Sustained-elevated tier: only pause after 20 continuous minutes above
# ELEVATED_TEMP. A reading at or below ELEVATED_TEMP always resets the clock,
# whether or not a clock was running — "else let it be".
if (( MAX_T > ELEVATED_TEMP )); then
  if [[ -f "$ELEVATED_SINCE_FILE" ]]; then
    since_epoch="$(cat "$ELEVATED_SINCE_FILE" 2>/dev/null || echo "$NOW_EPOCH")"
    [[ "$since_epoch" =~ ^[0-9]+$ ]] || since_epoch="$NOW_EPOCH"
  else
    since_epoch="$NOW_EPOCH"
    echo "$since_epoch" > "$ELEVATED_SINCE_FILE"
  fi
  elapsed=$(( NOW_EPOCH - since_epoch ))
  if (( elapsed >= ELEVATED_DURATION_SECONDS )); then
    sustained_pause "$(( elapsed / 60 ))"
    exit 0
  else
    log "elevated (under grace): ${MAX_T}C, ${elapsed}s of ${ELEVATED_DURATION_SECONDS}s above ${ELEVATED_TEMP}C"
  fi
else
  if [[ -f "$ELEVATED_SINCE_FILE" ]]; then
    rm -f "$ELEVATED_SINCE_FILE"
    log "elevated clock reset: ${MAX_T}C (<= ${ELEVATED_TEMP}C)"
  fi
fi

# Orchestrator pause: do nothing while PAUSED exists (may be set manually too)
if [[ -f "$PAUSED_FLAG" ]] || [[ -f "$LOGDIR/PAUSED" ]]; then
  exit 0
fi

log "watchdog ok: cpu=${CPU_T}C gpu=${GPU_T}C"
