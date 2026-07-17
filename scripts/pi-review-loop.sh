#!/usr/bin/env bash
set -uo pipefail
# Singleton guard: exit if another instance of this loop is already running
if [[ $(pgrep -fc "$(basename "$0")") -gt 1 ]]; then
  echo "another $(basename "$0") instance is running — exiting" >&2
  exit 0
fi
# OpenLunum PR reviewer loop — a local model reviews open agent PRs.
#
# The wrapper does everything mechanical (PR selection, checkout, verify);
# the model only judges the diff. The reviewer NEVER merges — it labels
# PRs ready-for-merge / needs-work and posts a SHA-stamped comment, so
# re-reviews happen only when new commits arrive.
#
# Usage: REVIEW_MODEL=supergemma4-e4b ./scripts/pi-review-loop.sh

REPO=/home/corpunum/OpenLunum
WT=/home/corpunum/openlunum-workers/reviewer
LOGDIR="$REPO/reports/pi-review"
STATUS_LOG="$LOGDIR/review-status.log"
REVIEW_MODEL="${REVIEW_MODEL:-supergemma4-e4b}"
COOLDOWN_SECONDS=120
PI_TIMEOUT=900

mkdir -p "$LOGDIR"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$STATUS_LOG"; }

# Idempotent label setup
gh label create ready-for-merge --repo corpunum/OpenLunum --color 0e8a16 --description "Local reviewer: sound, verify green" 2>/dev/null || true
gh label create needs-work --repo corpunum/OpenLunum --color d93f0b --description "Local reviewer: fixes required" 2>/dev/null || true

ensure_worktree() {
  if [[ ! -d "$WT" ]]; then
    git -C "$REPO" worktree add --detach "$WT" origin/main >/dev/null 2>&1
  fi
}

clean_stale_dist() {
  local pkg f base dir
  for pkg in packages/core packages/eval packages/cli packages/adapter-openunum packages/mcp; do
    for f in "$WT/$pkg"/dist/test/*.test.js "$WT/$pkg"/dist/src/*.js; do
      [[ -f "$f" ]] || continue
      base=$(basename "$f" .js); dir=$(basename "$(dirname "$f")")
      [[ -f "$WT/$pkg/$dir/${base}.ts" ]] || rm -f "${f%.js}".*
    done
  done
}

pick_candidate() {
  # Oldest open PR whose head SHA has no matching "REVIEW <sha>:" comment
  local pr sha reviewed
  while read -r pr sha; do
    [[ -n "$pr" ]] || continue
    reviewed=$(gh pr view "$pr" --repo corpunum/OpenLunum --json comments \
      --jq ".comments[].body" 2>/dev/null | grep -c "REVIEW ${sha}:" || true)
    if [[ "$reviewed" == "0" ]]; then
      echo "$pr $sha"
      return 0
    fi
  done < <(gh pr list --repo corpunum/OpenLunum --state open \
      --json number,headRefOid --jq 'sort_by(.number) | .[] | "\(.number) \(.headRefOid)"' 2>/dev/null)
  return 1
}

log "Reviewer loop starting (model: $REVIEW_MODEL)"
ensure_worktree

while true; do
  if ! sel=$(pick_candidate); then
    log "no unreviewed PRs — sleeping ${COOLDOWN_SECONDS}s"
    sleep "$COOLDOWN_SECONDS"
    continue
  fi
  pr=${sel% *}; sha=${sel#* }
  branch=$(gh pr view "$pr" --repo corpunum/OpenLunum --json headRefName --jq .headRefName)
  log "reviewing PR #$pr ($branch @ ${sha:0:8})"

  # Mechanical part: checkout + verify
  git -C "$WT" fetch origin "$branch" main >/dev/null 2>&1
  git -C "$WT" checkout -- . >/dev/null 2>&1 || true   # discard generated-file noise
  git -C "$WT" clean -fd >/dev/null 2>&1 || true
  git -C "$WT" checkout --detach "$sha" >/dev/null 2>&1 || { log "checkout failed for #$pr"; sleep 60; continue; }
  clean_stale_dist
  (cd "$WT" && pnpm install --no-frozen-lockfile >/dev/null 2>&1)
  if (cd "$WT" && pnpm verify > "$LOGDIR/verify-pr$pr.log" 2>&1); then
    verify_result="verify PASSED (all packages green)"
  else
    verify_result="verify FAILED:
$(grep -E 'error TS|# fail [1-9]|Failed|ERR_' "$LOGDIR/verify-pr$pr.log" | head -8)"
  fi

  diff_excerpt=$(git -C "$WT" diff "origin/main...$sha" | head -c 6000)

  # Judgment part: the model sees diff + verify, replies with a verdict
  review_out=$(timeout "$PI_TIMEOUT" pi --print --no-tools --no-session \
    --provider local-llama --model "$REVIEW_MODEL" \
    --system-prompt "You are a strict code reviewer for OpenLunum. Rules: verify must pass for READY_FOR_MERGE; semantic-contract changes (packages/core types/schemas/canonicalize/fingerprint) REQUIRE tests in the diff — no tests means NEEDS_WORK even if verify passes; broken imports or compile errors mean NEEDS_WORK; docs/experiment scaffolding with green verify is mergeable. Reply in exactly this format:
VERDICT: READY_FOR_MERGE or NEEDS_WORK
REASON: one sentence naming the decisive issue" \
    "Review PR #$pr (branch $branch).

Verify result:
$verify_result

Diff (truncated):
$diff_excerpt" 2>>"$STATUS_LOG")

  verdict=$(echo "$review_out" | grep -oE 'VERDICT:\s*(READY_FOR_MERGE|NEEDS_WORK)' | head -1 | sed 's/VERDICT:\s*//')
  reason=$(echo "$review_out" | grep -E '^REASON:' | head -1 | sed 's/^REASON:\s*//' | head -c 400)
  if [[ -z "$verdict" ]]; then
    log "no parseable verdict for #$pr — skipping this round"
    sleep 60
    continue
  fi

  # Verify result is authoritative: model cannot approve a red build
  if [[ "$verdict" == "READY_FOR_MERGE" && "$verify_result" == verify\ FAILED* ]]; then
    verdict="NEEDS_WORK"
    reason="verify fails on this branch (reviewer verdict overridden mechanically). $reason"
  fi

  # gh pr edit is broken by a projectCards GraphQL deprecation — use REST
  if [[ "$verdict" == "READY_FOR_MERGE" ]]; then
    gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=ready-for-merge" >/dev/null 2>&1 || true
    gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/needs-work" >/dev/null 2>&1 || true
  else
    gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=needs-work" >/dev/null 2>&1 || true
    gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/ready-for-merge" >/dev/null 2>&1 || true
  fi
  gh pr comment "$pr" --repo corpunum/OpenLunum \
    --body "REVIEW ${sha}: ${verdict} — ${reason} _(local reviewer: ${REVIEW_MODEL}; same-machine role-separated review, not fully independent)_" >/dev/null 2>&1 || true

  log "PR #$pr → $verdict"
  sleep 10
done
