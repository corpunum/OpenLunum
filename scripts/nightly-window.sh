#!/usr/bin/env bash
set -uo pipefail
# OpenLunum nightly maintenance window (~03:00, systemd timer).
#
#   1. Pause worker/reviewer/docs loops (PAUSED flag stops the watchdog too)
#   2. Adversarial tester pass: TESTER_MODEL red-teams recently merged work,
#      files findings as GitHub issues labeled 'adversarial-finding'
#   3. Evidence pass: run experiment manifests through the eval CLI,
#      commit reports to an agent/evidence/ branch + draft PR
#   4. Resume all loops
#
# Config: TESTER_MODEL (default qwen3.5-122b), WINDOW_BUDGET_SECONDS (default 3h)

REPO=/home/corpunum/OpenLunum
WT=/home/corpunum/openlunum-workers/nightly
LOGDIR="$REPO/reports/nightly"
LOOPDIR="$REPO/reports/pi-loop"
TESTER_MODEL="${TESTER_MODEL:-openai/qwen3.5-122b-a10b}"
WINDOW_BUDGET_SECONDS="${WINDOW_BUDGET_SECONDS:-10800}"
PI_TIMEOUT=2400
WORKER_MODEL="openai/qwen3.6-35b-a3b"
REVIEWER_MODEL="openai/superqwen-agentworld-35b-a3b"

mkdir -p "$LOGDIR"
stamp=$(date +%Y%m%d)
log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOGDIR/nightly-$stamp.log"; }
deadline=$(( $(date +%s) + WINDOW_BUDGET_SECONDS ))
time_left() { echo $(( deadline - $(date +%s) )); }

resume() {
  log "resuming loops"
  rm -f "$LOOPDIR/PAUSED"
  PI_MODEL="$WORKER_MODEL" nohup bash "$REPO/scripts/pi-loop.sh" "$REPO" > "$LOOPDIR/nohup.log" 2>&1 &
  REVIEW_MODEL="$REVIEWER_MODEL" nohup bash "$REPO/scripts/pi-review-loop.sh" > "$REPO/reports/pi-review/nohup.log" 2>&1 &
  DOCS_MODEL="$WORKER_MODEL" nohup bash "$REPO/scripts/pi-docs-loop.sh" > "$REPO/reports/pi-docs/nohup.log" 2>&1 &
  log "nightly window done"
}
trap resume EXIT

# ---- 1. Pause ----
log "nightly window starting (tester: $TESTER_MODEL, budget: ${WINDOW_BUDGET_SECONDS}s)"
touch "$LOOPDIR/PAUSED"
pkill -f 'pi-loop\.sh' 2>/dev/null || true
pkill -f 'pi-review-loop\.sh' 2>/dev/null || true
pkill -f 'pi-docs-loop\.sh' 2>/dev/null || true
sleep 5
pkill -f 'pi --print' 2>/dev/null || true
rm -f "$LOOPDIR/STUCK"   # trap-written STUCK from the kills above is expected
sleep 5

# Unload day models so the tester has room
for m in "$WORKER_MODEL" "$REVIEWER_MODEL"; do
  curl -s -X POST http://localhost:8080/models/unload -H 'Content-Type: application/json' \
    -d "{\"model\":\"$m\"}" >/dev/null 2>&1 || true
done

# ---- 2. Adversarial tester pass ----
[[ -d "$WT" ]] || git -C "$REPO" worktree add --detach "$WT" origin/main >/dev/null 2>&1
git -C "$WT" checkout -- . >/dev/null 2>&1; git -C "$WT" clean -fd >/dev/null 2>&1
git -C "$WT" fetch origin main >/dev/null 2>&1
git -C "$WT" checkout --detach origin/main >/dev/null 2>&1
(cd "$WT" && pnpm install --no-frozen-lockfile >/dev/null 2>&1)

gh label create adversarial-finding --repo corpunum/OpenLunum --color 5319e7 \
  --description "Found by the nightly adversarial tester" 2>/dev/null || true

recent=$(git -C "$WT" log --oneline -15 origin/main | head -15)
# Targets: implementation files changed since the LAST nightly pass (stamp),
# falling back to the last 40 commits on the first run.
TESTED_STAMP="$LOGDIR/last-tested-sha"
since=$(cat "$TESTED_STAMP" 2>/dev/null || echo "HEAD~40")
targets=$(git -C "$WT" diff --name-only "$since...HEAD" 2>/dev/null | grep -E '^packages/.*\.ts$' | grep -v test | head -12)

if [[ $(time_left) -gt 600 && -n "$targets" ]]; then
  log "tester pass: targets = $(echo "$targets" | tr '\n' ' ')"
  # Warm the tester model first — cold 122B loads take ~10 min and pi's
  # request timeout gives up silently (empty tester log on 2026-07-18)
  log "warming $TESTER_MODEL"
  curl -s --max-time 1200 http://localhost:8080/v1/chat/completions -H 'Content-Type: application/json' \
    -d "{\"model\":\"$TESTER_MODEL\",\"max_tokens\":5,\"messages\":[{\"role\":\"user\",\"content\":\"OK\"}]}" >/dev/null 2>&1
  log "warm-up done"
  (cd "$WT" && timeout "$PI_TIMEOUT" pi --print --no-session \
    --provider local-llama --model "$TESTER_MODEL" --thinking high \
    "You are the nightly adversarial tester (red team) for OpenLunum, in $WT on a detached checkout of main. Recent commits:
$recent

Target files (recently merged implementation code):
$targets

Campaign red-team focus: nested/double negation, conditions and exceptions, entity/reference confusion, quantities/units/time, modality/uncertainty, fingerprint collisions and false equivalence, unsafe compaction, protected-literal loss.

For EACH target file that contains semantic logic:
1. Read it and its tests.
2. Construct 2-3 concrete adversarial inputs that could break it (real code-level analysis, not speculation).
3. Where possible, WRITE a small reproduction script under /tmp and RUN it with node against the built dist/ to confirm the failure. Run 'pnpm build' first.
4. For each CONFIRMED failure: file an issue with: gh issue create --repo corpunum/OpenLunum --label adversarial-finding --title 'adversarial: <short>' --body '<file, input, expected vs actual, reproduction>'
5. Do NOT file speculative issues — only confirmed or highly concrete cases. Do NOT modify any repo files.
Summarize findings at the end." \
    2>&1 | tee "$LOGDIR/tester-$stamp.log") || true
  log "tester pass done ($(gh issue list --repo corpunum/OpenLunum --label adversarial-finding --state open --json number --jq 'length' 2>/dev/null || echo '?') open findings)"
  git -C "$WT" rev-parse HEAD > "$TESTED_STAMP"
else
  log "skipping tester pass (no targets or budget low)"
fi

# Unload tester before evidence pass
curl -s -X POST http://localhost:8080/models/unload -H 'Content-Type: application/json' \
  -d "{\"model\":\"$TESTER_MODEL\"}" >/dev/null 2>&1 || true

# ---- 3. Evidence pass ----
if [[ $(time_left) -gt 600 ]]; then
  log "evidence pass starting"
  git -C "$WT" checkout -B "agent/evidence/nightly-$stamp" >/dev/null 2>&1
  (cd "$WT" && pnpm build >/dev/null 2>&1)
  ran=0
  for manifest in "$WT"/experiments/*/experiment.json; do
    [[ -f "$manifest" ]] || continue
    [[ $(time_left) -lt 300 ]] && { log "budget out — stopping evidence runs"; break; }
    name=$(basename "$(dirname "$manifest")")
    if (cd "$WT" && timeout 600 node packages/eval/dist/src/cli.js run --manifest "$manifest" \
        > "$LOGDIR/evidence-$name-$stamp.log" 2>&1); then
      log "evidence: $name OK"
      ran=$((ran+1))
    else
      log "evidence: $name failed/unsupported (see log)"
    fi
  done
  if [[ $ran -gt 0 ]] && ! git -C "$WT" diff --quiet 2>/dev/null || [[ -n $(git -C "$WT" status --porcelain 2>/dev/null) ]]; then
    (cd "$WT" && git add reports/ 2>/dev/null && \
     git commit -q -m "evidence: nightly experiment runs $stamp ($ran manifests)" 2>/dev/null && \
     git push -u origin "agent/evidence/nightly-$stamp" >/dev/null 2>&1 && \
     gh pr create --draft --title "evidence: nightly runs $stamp" \
       --body "Automated nightly evidence pass: $ran experiment manifests executed. See reports/." >/dev/null 2>&1) || true
    log "evidence PR opened ($ran runs)"
  else
    log "evidence pass: nothing to commit"
  fi
fi

# resume happens in the EXIT trap
