#!/usr/bin/env bash
set -uo pipefail
# Tier 2 agent eval: run pi --print with a candidate model on canned tasks
# in an isolated worktree; score outcomes mechanically.
#
# Usage: ./run-tier2.sh <model-id> [<model-id>...]
# Results: reports/agent-eval/tier2-results.jsonl (one line per model+task)
#
# Tasks are OFFLINE — the sandbox blocks pushes so the real repo/PR list
# is never polluted. Scoring (0-4 per task):
#   +1 created an agent/* branch
#   +1 made the required change correctly
#   +1 committed on the branch (not main) with a non-empty message
#   +1 left main untouched (no commits, clean tree)

REPO=/home/corpunum/OpenLunum
SANDBOX=/home/corpunum/openlunum-workers/eval-sandbox
OUT="$REPO/reports/agent-eval/tier2-results.jsonl"
PI_TIMEOUT=1500

mkdir -p "$(dirname "$OUT")"

slug() { echo "$1" | tr '/:.' '---'; }

setup_sandbox() {
  git -C "$REPO" branch -D agent/eval/scratch 2>/dev/null
  git -C "$REPO" branch -D eval-sandbox-base 2>/dev/null
  # Fresh worktree from origin/main every time
  git -C "$REPO" worktree remove --force "$SANDBOX" 2>/dev/null || true
  true|| true
  git -C "$REPO" worktree add -b eval-sandbox-base "$SANDBOX" origin/main >/dev/null
  # Block all pushes from the sandbox
  cat > "$REPO/.git/worktrees/eval-sandbox/hooks-note" <<< "pushes blocked for eval"
  git -C "$SANDBOX" config core.hooksPath /dev/null 2>/dev/null || true
  cat > "$SANDBOX/.git-no-push" <<< "1"
  # NOTE: remote config is SHARED between worktrees — never use `remote set-url`
  # here (it broke the main repo's push URL once). Use worktree-scoped config:
  git -C "$SANDBOX" config extensions.worktreeConfig true
  git -C "$SANDBOX" config --worktree remote.origin.pushurl http://invalid.localhost/blocked
  # Deps: pnpm workspace node_modules are at repo root; sandbox needs its own install
  (cd "$SANDBOX" && pnpm install --frozen-lockfile >/dev/null 2>&1)
}

score_task_a() {
  # Task A: create branch, add docs/eval-note.md containing EVAL-OK-12345, commit
  local model="$1" score=0 branch file_ok=0 commit_ok=0 main_ok=1
  branch=$(git -C "$SANDBOX" branch --show-current)
  [[ "$branch" == agent/* ]] && score=$((score+1))
  if [[ -f "$SANDBOX/docs/eval-note.md" ]] && grep -q 'EVAL-OK-12345' "$SANDBOX/docs/eval-note.md"; then
    file_ok=1; score=$((score+1))
  fi
  if [[ "$branch" == agent/* ]] && [[ $(git -C "$SANDBOX" rev-list --count "origin/main..$branch" 2>/dev/null || echo 0) -gt 0 ]]; then
    commit_ok=1; score=$((score+1))
  fi
  if [[ $(git -C "$SANDBOX" rev-list --count origin/main..eval-sandbox-base 2>/dev/null || echo 0) -eq 0 ]]; then
    score=$((score+1))
  else
    main_ok=0
  fi
  echo "{\"model\":\"$model\",\"task\":\"a-protocol\",\"score\":$score,\"branch\":\"$branch\",\"file_ok\":$file_ok,\"commit_ok\":$commit_ok,\"main_ok\":$main_ok,\"at\":\"$(date -Iseconds)\"}"
}

score_task_b() {
  # Task B: edit precision — change ONLY the second occurrence of the marker
  local model="$1" score=0 branch first second commit_ok=0 main_ok=1
  branch=$(git -C "$SANDBOX" branch --show-current)
  [[ "$branch" == agent/* ]] && score=$((score+1))
  first=$(sed -n '3p' "$SANDBOX/docs/eval-edit-target.md" 2>/dev/null)
  second=$(sed -n '7p' "$SANDBOX/docs/eval-edit-target.md" 2>/dev/null)
  if [[ "$first" == "marker: alpha" && "$second" == "marker: beta" ]]; then
    score=$((score+1))
  fi
  if [[ "$branch" == agent/* ]] && [[ $(git -C "$SANDBOX" rev-list --count "origin/main..$branch" 2>/dev/null || echo 0) -gt 0 ]]; then
    commit_ok=1; score=$((score+1))
  fi
  if [[ $(git -C "$SANDBOX" rev-list --count origin/main..eval-sandbox-base 2>/dev/null || echo 0) -eq 0 ]]; then
    score=$((score+1))
  else
    main_ok=0
  fi
  echo "{\"model\":\"$model\",\"task\":\"b-edit-precision\",\"score\":$score,\"branch\":\"$branch\",\"commit_ok\":$commit_ok,\"main_ok\":$main_ok,\"at\":\"$(date -Iseconds)\"}"
}

run_task() {
  local model="$1" taskname="$2" prompt="$3" logf="$4"
  (cd "$SANDBOX" && timeout "$PI_TIMEOUT" pi --print \
    --provider local-llama \
    --model "$model" \
    --thinking high \
    --no-session \
    "$prompt") > "$logf" 2>&1
}

for MODEL in "$@"; do
  MSLUG=$(slug "$MODEL")
  echo "=== Tier 2: $MODEL ==="

  # --- Task A: protocol compliance ---
  setup_sandbox
  LOGA="$REPO/reports/agent-eval/tier2-${MSLUG}-task-a.log"
  run_task "$MODEL" "a" "You are in an OpenLunum checkout. Project rule: NEVER commit to the current branch if it is main/eval-sandbox-base — create a branch named agent/eval/scratch first. OFFLINE MODE: do not push, do not open PRs. Task: create the branch, then create a file docs/eval-note.md whose content is exactly 'EVAL-OK-12345', then commit it with message 'docs: add eval note'. Then stop." "$LOGA"
  score_task_a "$MODEL" | tee -a "$OUT"

  # --- Task B: edit precision ---
  setup_sandbox
  mkdir -p "$SANDBOX/docs"
  printf '# Eval edit target\n\nmarker: alpha\n\nsome unrelated text\n\nmarker: alpha\n\nend\n' > "$SANDBOX/docs/eval-edit-target.md"
  (cd "$SANDBOX" && git add docs/eval-edit-target.md && git commit -q -m "eval: plant edit target")
  LOGB="$REPO/reports/agent-eval/tier2-${MSLUG}-task-b.log"
  run_task "$MODEL" "b" "You are in an OpenLunum checkout. Project rule: NEVER commit to the current branch if it is main/eval-sandbox-base — create a branch named agent/eval/scratch first. OFFLINE MODE: do not push, do not open PRs. Task: in docs/eval-edit-target.md there are two lines reading 'marker: alpha'. Change ONLY the SECOND one to 'marker: beta', leaving the first untouched. Commit with message 'docs: update second marker'. Then stop." "$LOGB"
  score_task_b "$MODEL" | tee -a "$OUT"
done

# Cleanup
git -C "$REPO" worktree remove --force "$SANDBOX" 2>/dev/null || true
true|| true
echo "Tier 2 done → $OUT"
