#!/usr/bin/env bash
set -uo pipefail
# Singleton guard: flock held for process lifetime; second instances exit
exec 9>"/tmp/openlunum-$(basename "$0").lock"
if ! flock -n 9; then
  echo "another $(basename "$0") instance holds the lock — exiting" >&2
  exit 0
fi
# OpenLunum documentation maintenance loop.
#
# Runs only when main has advanced since the last docs pass (docs follow
# merges, not the clock). Produces docs-only branches through the normal
# worker protocol: branch → finish_work → PR → local reviewer → merge lane.
#
# Usage: DOCS_MODEL=openai/qwen3.6-35b-a3b ./scripts/pi-docs-loop.sh

REPO=/home/corpunum/OpenLunum
WT=/home/corpunum/openlunum-workers/docs
LOGDIR="$REPO/reports/pi-docs"
STATUS_LOG="$LOGDIR/docs-status.log"
STAMP="$LOGDIR/last-docs-sha"
DOCS_MODEL="${DOCS_MODEL:-openai/qwen3.6-35b-a3b}"
CHECK_SECONDS=600
PI_TIMEOUT=1800

mkdir -p "$LOGDIR"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$STATUS_LOG"; }

ensure_worktree() {
  [[ -d "$WT" ]] || git -C "$REPO" worktree add --detach "$WT" origin/main >/dev/null 2>&1
}

log "Docs loop starting (model: $DOCS_MODEL)"
ensure_worktree

while true; do
  git -C "$WT" fetch origin main >/dev/null 2>&1
  head=$(git -C "$WT" rev-parse origin/main)
  last=$(cat "$STAMP" 2>/dev/null || echo none)

  if [[ "$head" == "$last" ]]; then
    sleep "$CHECK_SECONDS"
    continue
  fi

  log "main advanced ($last → ${head:0:8}) — docs pass starting"
  git -C "$WT" checkout -- . >/dev/null 2>&1 || true
  git -C "$WT" clean -fd >/dev/null 2>&1 || true
  git -C "$WT" checkout --detach "$head" >/dev/null 2>&1
  git -C "$WT" checkout -B "agent/docs/sync-${head:0:8}" >/dev/null 2>&1

  # What merged since the last docs pass — the model's working brief
  if [[ "$last" != "none" ]]; then
    changes=$(git -C "$WT" log --oneline "$last..$head" | head -30)
  else
    changes="(first docs pass — audit everything)"
  fi

  (cd "$WT" && timeout "$PI_TIMEOUT" pi --print --no-session \
    --provider local-llama --model "$DOCS_MODEL" --thinking high \
    "You are the documentation maintainer for OpenLunum. You are on branch agent/docs/sync-${head:0:8} in $WT.

Commits merged to main since the last documentation pass:
$changes

Your job — TOUCH ONLY *.md FILES:
1. Read README.md, STATUS.md, CHANGELOG.md, WORK_QUEUE.md and the docs/ directory.
2. Update STATUS.md 'Current capabilities' and maturity table for newly merged components (check packages/ for what exists now, e.g. packages/mcp).
3. Add CHANGELOG.md entries for the merged work, grouped sensibly. Do not invent versions.
4. Fix stale statements in README.md (e.g. repository map missing new packages, capabilities that changed).
5. Create missing docs where a new package/feature has none (e.g. packages/<name>/README.md).
6. Do NOT touch code, schemas, datasets, or workflow files. Do NOT change WORK_QUEUE.md checkboxes (the merge lane owns those). Do NOT overclaim — follow the project's honest-status conventions; support claims need evidence.
7. When done: git add the .md files only, commit 'docs: sync documentation with merged work', push with git push -u origin agent/docs/sync-${head:0:8}, then open a draft PR with gh pr create --draft.
8. If documentation is already accurate, say so and stop without committing." \
    2>&1 | tee "$LOGDIR/docs-run-$(date +%Y%m%dT%H%M%S).log") || true

  # Mechanical enforcement: strip any non-.md staged/committed changes
  cd "$WT"
  non_md=$(git diff origin/main...HEAD --name-only 2>/dev/null | grep -v '\.md$' || true)
  if [[ -n "$non_md" ]]; then
    log "WARNING: docs run touched non-md files, reverting them: $non_md"
    echo "$non_md" | while read -r f; do git checkout origin/main -- "$f" 2>/dev/null || git rm -q -f "$f" 2>/dev/null || true; done
    git commit -q -am "docs: revert non-markdown changes (docs loop guard)" 2>/dev/null || true
    git push -f origin "agent/docs/sync-${head:0:8}" 2>/dev/null || true
  fi

  echo "$head" > "$STAMP"
  log "docs pass done for ${head:0:8}"
  sleep "$CHECK_SECONDS"
done
