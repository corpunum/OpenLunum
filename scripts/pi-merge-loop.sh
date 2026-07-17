#!/usr/bin/env bash
set -uo pipefail
# Singleton guard: flock held for process lifetime; second instances exit
exec 9>"/tmp/openlunum-$(basename "$0").lock"
if ! flock -n 9; then
  echo "another $(basename "$0") instance holds the lock — exiting" >&2
  exit 0
fi

# OpenLunum auto-merge bot — fully mechanical, no model.
#
# Merges PRs that carry the local reviewer's ready-for-merge label, UNLESS
# they touch protected paths (those get the claude-review label and wait
# for the Claude maintainer). After every merge, verifies main and
# auto-reverts on red.
#
# Escalation labels: claude-review (protected paths), needs-rebase (conflicts).

REPO=/home/corpunum/OpenLunum
WT=/home/corpunum/openlunum-workers/merger
LOGDIR="$REPO/reports/pi-merge"
STATUS_LOG="$LOGDIR/merge-status.log"
INTERVAL=180

# Paths that always require the Claude maintainer
PROTECTED_RE='^(datasets/protected/(?!README\.md)|packages/core/src/(canonicalize|fingerprint|derive|compare|types|types-schema)|schemas/|registry/|\.github/|scripts/(pi-|nightly))'

mkdir -p "$LOGDIR"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$STATUS_LOG"; }

timeout 60 gh label create claude-review --repo corpunum/OpenLunum --color b60205 --description "Protected paths — Claude maintainer review required" 2>/dev/null || true
timeout 60 gh label create needs-rebase --repo corpunum/OpenLunum --color fbca04 --description "Conflicts with main — rebase needed" 2>/dev/null || true

ensure_worktree() {
  [[ -d "$WT" ]] || git -C "$REPO" worktree add --detach "$WT" origin/main >/dev/null 2>&1
}

clean_stale_dist() {
  local pkg f base dir
  for pkg in "$WT"/packages/*/; do
    for f in "$pkg"dist/test/*.test.js "$pkg"dist/src/*.js; do
      [[ -f "$f" ]] || continue
      base=$(basename "$f" .js); dir=$(basename "$(dirname "$f")")
      [[ -f "$pkg$dir/${base}.ts" ]] || rm -f "${f%.js}".*
    done
  done
}

verify_main() {
  git -C "$WT" fetch origin main >/dev/null 2>&1
  git -C "$WT" checkout --detach origin/main >/dev/null 2>&1
  git -C "$WT" checkout -- . >/dev/null 2>&1; git -C "$WT" clean -fdq >/dev/null 2>&1
  clean_stale_dist
  (cd "$WT" && pnpm install --no-frozen-lockfile >/dev/null 2>&1 && pnpm verify >"$LOGDIR/last-verify.log" 2>&1)
}

log "merge bot starting"
ensure_worktree

while true; do
  prs=$(timeout 60 gh pr list --repo corpunum/OpenLunum --state open --label ready-for-merge \
        --json number --jq '.[].number' 2>/dev/null)
  for pr in $prs; do
    files=$(timeout 60 gh pr diff "$pr" --repo corpunum/OpenLunum --name-only 2>/dev/null)
    [[ -n "$files" ]] || continue

    if echo "$files" | grep -qP "$PROTECTED_RE"; then
      timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=claude-review" >/dev/null 2>&1 || true
      timeout 60 gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/ready-for-merge" >/dev/null 2>&1 || true
      timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
        --body "Auto-merge declined: this PR touches protected paths (semantic core, schemas, CI, or agent infra). Queued for the Claude maintainer." >/dev/null 2>&1 || true
      log "PR #$pr → claude-review (protected paths)"
      continue
    fi

    timeout 60 gh pr ready "$pr" --repo corpunum/OpenLunum >/dev/null 2>&1 || true
    if ! timeout 120 gh pr merge "$pr" --repo corpunum/OpenLunum --merge >/dev/null 2>&1; then
      timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=needs-rebase" >/dev/null 2>&1 || true
      timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
        --body "Auto-merge failed (likely conflicts). Rebase onto main and push; the reviewer will re-review." >/dev/null 2>&1 || true
      log "PR #$pr → needs-rebase (merge failed)"
      continue
    fi

    if verify_main; then
      log "PR #$pr MERGED, main green"
    else
      sha=$(git -C "$WT" rev-parse origin/main)
      git -C "$WT" revert -m 1 --no-edit "$sha" >/dev/null 2>&1
      ALLOW_MAIN_PUSH=1 git -C "$WT" push origin HEAD:main >/dev/null 2>&1
      timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=needs-work" >/dev/null 2>&1 || true
      timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
        --body "Merged but main verify went red — merge auto-reverted. The branch passes alone but conflicts semantically with other merged work; rebase and fix." >/dev/null 2>&1 || true
      log "PR #$pr merged but BROKE main — auto-reverted"
    fi
  done
  sleep "$INTERVAL"
done
