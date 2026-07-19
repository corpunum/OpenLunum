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
MERGE_POLICY="${MERGE_POLICY:-$REPO/scripts/pi-merge-policy.mjs}"

# Hard-protected: always require Claude maintainer (CI, agent infra, protected data)
HARD_PROTECTED_RE='^(datasets/protected/(?!README\.md)|\.github/|scripts/(pi-|nightly))'
# Soft-protected: auto-merge if reviewer gave LGTM-protected in a comment
SOFT_PROTECTED_RE='^(packages/core/src/(canonicalize|fingerprint|derive|compare|types|types-schema)|schemas/|registry/)'

mkdir -p "$LOGDIR"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$STATUS_LOG"; }

timeout 60 gh label create claude-review --repo corpunum/OpenLunum --color b60205 --description "Protected paths — Claude maintainer review required" 2>/dev/null || true
timeout 60 gh label create needs-rebase --repo corpunum/OpenLunum --color fbca04 --description "Conflicts with main — rebase needed" 2>/dev/null || true
timeout 60 gh label create maintainer-blocked --repo corpunum/OpenLunum --color b60205 --description "Current-head maintainer findings block automation" 2>/dev/null || true
timeout 60 gh label create merge-policy-blocked --repo corpunum/OpenLunum --color d93f0b --description "Fail-closed merge policy is not satisfied" 2>/dev/null || true

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
  # Pick up PRs with ready-for-merge OR orchestrator-approved labels
  prs=$(timeout 60 gh pr list --repo corpunum/OpenLunum --state open --label ready-for-merge \
        --json number --jq '.[].number' 2>/dev/null)
  approved_prs=$(timeout 60 gh pr list --repo corpunum/OpenLunum --state open --label orchestrator-approved \
        --json number --jq '.[].number' 2>/dev/null)

  all_prs=$(echo "$prs $approved_prs" | tr ' ' '\n' | sort -un | tr '\n' ' ')
  for pr in $all_prs; do
    head_sha=$(timeout 30 gh pr view "$pr" --repo corpunum/OpenLunum --json headRefOid --jq .headRefOid 2>/dev/null)
    [[ -n "$head_sha" ]] || { log "PR #$pr → policy blocked (head SHA unavailable)"; continue; }
    files=$(timeout 60 gh pr diff "$pr" --repo corpunum/OpenLunum --name-only 2>/dev/null)
    [[ -n "$files" ]] || continue

    # Check if this PR was already approved by an orchestrator
    pr_labels=$(timeout 30 gh pr view "$pr" --repo corpunum/OpenLunum --json labels --jq '[.labels[].name] | join(",")' 2>/dev/null || echo "")
    is_orchestrator_approved=false
    [[ "$pr_labels" == *"orchestrator-approved"* ]] && is_orchestrator_approved=true

    # Hard-protected: escalate UNLESS orchestrator already approved
    if echo "$files" | grep -qP "$HARD_PROTECTED_RE"; then
      if ! $is_orchestrator_approved; then
        timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=claude-review" >/dev/null 2>&1 || true
        timeout 60 gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/ready-for-merge" >/dev/null 2>&1 || true
        timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
          --body "Auto-merge declined: this PR touches hard-protected paths (CI, agent infra, or protected data). Queued for orchestrator review. Add \`orchestrator-approved\` label to unblock." >/dev/null 2>&1 || true
        log "PR #$pr → claude-review (hard-protected)"
        continue
      fi
      log "PR #$pr hard-protected but orchestrator-approved — proceeding"
    fi

    # Soft-protected: auto-merge if reviewer gave LGTM-protected
    if echo "$files" | grep -qP "$SOFT_PROTECTED_RE"; then
      has_override=$(timeout 60 gh pr view "$pr" --repo corpunum/OpenLunum --json comments \
        --jq "[.comments[].body | select(contains(\"$head_sha\") and contains(\"LGTM-protected\"))] | length" 2>/dev/null)
      if [[ "${has_override:-0}" -lt 1 ]]; then
        timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=claude-review" >/dev/null 2>&1 || true
        timeout 60 gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/ready-for-merge" >/dev/null 2>&1 || true
        timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
          --body "Auto-merge paused: soft-protected paths. Reviewer: comment \`LGTM-protected\` to override." >/dev/null 2>&1 || true
        log "PR #$pr → claude-review (soft-protected, awaiting override)"
        continue
      fi
      log "PR #$pr soft-protected with reviewer override — proceeding"
    fi

    # Fail closed before merge. Drafts, blockers, stale/missing reviews, and
    # missing/pending/failed/no-step checks on the exact head all stop here.
    policy_output=$(timeout 120 node "$MERGE_POLICY" --repo corpunum/OpenLunum --pr "$pr" 2>&1)
    policy_exit=$?
    if [[ $policy_exit -ne 0 ]]; then
      reason=$(echo "$policy_output" | jq -r '.reasons | join("; ")' 2>/dev/null || echo "policy evaluator error")
      timeout 30 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=merge-policy-blocked" >/dev/null 2>&1 || true
      log "PR #$pr → policy blocked ($reason)"
      continue
    fi
    timeout 30 gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/merge-policy-blocked" >/dev/null 2>&1 || true

    # Bind the merge to the head that passed policy to close the TOCTOU gap.
    if ! timeout 120 gh pr merge "$pr" --repo corpunum/OpenLunum --merge --match-head-commit "$head_sha" >/dev/null 2>&1; then
      timeout 60 gh api -X POST "repos/corpunum/OpenLunum/issues/$pr/labels" -f "labels[]=needs-rebase" >/dev/null 2>&1 || true
      timeout 60 gh api -X DELETE "repos/corpunum/OpenLunum/issues/$pr/labels/ready-for-merge" >/dev/null 2>&1 || true
      timeout 60 gh pr comment "$pr" --repo corpunum/OpenLunum \
        --body "Auto-merge failed (likely conflicts). Rebase onto main and push; the reviewer will re-review." >/dev/null 2>&1 || true
      log "PR #$pr → needs-rebase (merge failed)"
      continue
    fi

    if verify_main; then
      log "PR #$pr MERGED, main green"
      # Auto-close issues referenced in PR title (e.g. "Issue #11" or "#11")
      pr_title=$(timeout 30 gh pr view "$pr" --repo corpunum/OpenLunum --json title --jq .title 2>/dev/null)
      for issue_num in $(echo "$pr_title" | grep -oP '#\K\d+'); do
        issue_state=$(timeout 30 gh issue view "$issue_num" --repo corpunum/OpenLunum --json state --jq .state 2>/dev/null)
        if [[ "$issue_state" == "OPEN" ]]; then
          timeout 30 gh issue close "$issue_num" --repo corpunum/OpenLunum \
            --comment "Closed mechanically: PR #$pr merged and main is green." >/dev/null 2>&1 || true
          log "Issue #$issue_num closed (referenced in PR #$pr)"
        fi
      done
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
