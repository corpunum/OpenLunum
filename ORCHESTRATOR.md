# OpenLunum Orchestrator Handover

This document enables any LLM (Claude, GPT, Gemini, local Qwen) to take over as orchestrator of the OpenLunum autonomous pipeline. Read this ENTIRE document before doing anything.

**MANDATORY: Update the "Current State" section at the bottom of this file on EVERY check-in, before you finish.** Push the update from the review worktree. This is how the next orchestrator (or your next session) knows what happened.

## Architecture: 6-Layer Stack

```
Layer 5: Cloud Orchestrator (this role) — strategic decisions, audit responses, prompt updates
Layer 4: Watchdog (systemd timer, every 5min) — restarts dead loops, thermal management
Layer 3: Local Orchestrator (systemd timer, every 3h) — health checks, STUCK auto-fix, LLM diagnosis
Layer 2: Reviewer (AgentWorld-35B) — reviews PRs, posts LGTM or fix requests
Layer 1: Worker (Qwen 35B MTP) — implements queue items, opens draft PRs
Layer 0: Merge Bot (bash) — merges approved PRs, auto-reverts if main breaks
         Docs Loop (Qwen 4B on ROG Ally) — syncs documentation after merges
```

Layers 0-4 are fully automated. Layer 3 includes LLM-assisted diagnosis — it asks Qwen3 35B (with thinking/reasoning) for a fix before escalating to cloud. Layer 5 (you) is needed only when both bash auto-fix AND LLM diagnosis fail.

## Key Paths

| What | Path |
|---|---|
| Repo | `/home/corpunum/OpenLunum` |
| Review worktree | `/home/corpunum/openlunum-workers/review` (safe from worker resets) |
| Worker loop | `scripts/pi-loop.sh` |
| Reviewer loop | `scripts/pi-review-loop.sh` |
| Merge bot | `scripts/pi-merge-loop.sh` |
| Docs loop | `scripts/pi-docs-loop.sh` |
| Watchdog | `scripts/pi-watchdog.sh` (timer: `openlunum-watchdog.timer`) |
| Local orchestrator | `scripts/pi-orchestrator.sh` (timer: `openlunum-orchestrator.timer`) |
| Worker task prompt | `scripts/pi-task-prompt.md` — controls what the worker builds |
| Work queue | `WORK_QUEUE.md` — checklist of items, worker reads this |
| Dashboard | `/home/corpunum/openlunum-dashboard/` (port 3847, systemd service) |
| Flags | `reports/pi-loop/{STUCK,ESCALATED,THERMAL_HALT,PAUSED}` |
| NEEDS_CLOUD flag | `reports/orchestrator/NEEDS_CLOUD` — your trigger |
| Orchestrator logs | `reports/orchestrator/status.log` |
| LLM advice log | `reports/orchestrator/last-llm-advice.txt` |
| Stale PR log | `reports/orchestrator/stale-prs.log` |
| Velocity CSV | `reports/orchestrator/velocity.csv` |
| Merge logs | `reports/pi-merge/merge-status.log` |
| Temps | `reports/pi-loop/temps.csv` (ts,cpu,gpu,freq) |
| LLM router | `llama-qwen36.service` (port 8080, llama.cpp native router) |
| Models config | `/home/corpunum/models-preset.ini` |
| Eval results | `reports/agent-eval/tier1-results.json` |
| This document | `ORCHESTRATOR.md` — YOU MUST UPDATE THIS EVERY CHECK-IN |

## Hardware

- **Main rig**: Bosgame BeyondMax, Ryzen AI MAX+ 395, 128GB unified RAM, 2TB NVMe, Ubuntu 24.04
- **ROG Ally**: Docs loop runs here via SSH tunnel (port 18084)
- **GPU**: Radeon 8060S (gfx1151), ROCm via TheRock wheels
- **Thermal**: CPU/GPU typically 85-92°C under load. Watchdog halts at 101°C sustained, resumes at 88°C

## How the Worker Loop Works

1. Worker starts, runs `pnpm verify` on main
2. Reads `WORK_QUEUE.md`, finds first unchecked `[ ]` item not already claimed
3. Creates `agent/qwen/<area>/<name>` branch from main
4. Implements the item, runs verify, pushes branch, opens draft PR
5. Reviewer picks it up, posts review comments or LGTM
6. Merge bot merges LGTM'd PRs, auto-reverts if main breaks
7. If worker hits 3 consecutive verify failures → writes STUCK file → orchestrator resolves
8. When all queue items are claimed, worker switches to **rebuild mode** (see `scripts/pi-task-prompt.md`)

## Two-Tier Protected Paths

- **Hard-protected** (CI, agent scripts, protected data): merge bot adds `claude-review` label and skips. The reviewer's READY_FOR_MERGE verdict is logged but insufficient for hard-protected merges — a cloud orchestrator must explicitly approve via `gh pr edit --add-label orchestrator-approved`.
- **Soft-protected** (core semantics, schemas, registry): auto-merge if reviewer posts `LGTM-protected`

Configured in `scripts/pi-merge-loop.sh` via `HARD_PROTECTED_RE` and `SOFT_PROTECTED_RE`.

## Escalation Path

```
Bash watchdog (5min) → fixes simple loop deaths (restart processes)
    ↓ if not a simple restart
Local orchestrator (3h) → bash auto-fix (git pull + clean dist + rebuild)
    ↓ if bash fix fails
Local orchestrator → LLM diagnosis (Qwen3 35B with thinking enabled)
    ↓ if LLM says ESCALATE or its fix doesn't work
NEEDS_CLOUD flag → YOU (cloud orchestrator) review + fix
    ↓ if you can't fix
User notification → desktop notify-send for critical issues
```

### LLM Diagnosis Details

The `llm_diagnose` function in `pi-orchestrator.sh`:
- Sends error context + focused question to Qwen3 35B via `localhost:8080/v1/chat/completions`
- Model has thinking/reasoning enabled (uses ~3-6K chars of chain-of-thought before answering)
- System prompt asks for concrete bash fix (3 commands max) or "ESCALATE" if unsure
- `llm_try_fix` extracts commands, filters against blocklist, caps at 3, logs everything
- Advice saved to `reports/orchestrator/last-llm-advice.txt`
- Triggers on: verify failures, git pull failures, loop crashes, high revert rates

## When You're Needed (Layer 5)

1. **`NEEDS_CLOUD` flag exists** — read it, read `status.log` and `last-llm-advice.txt` for context
2. **`claude-review` PRs piling up** — review the diff, approve good ones (see below)
3. **External audit** — someone provides a review that needs task prompt or queue updates
4. **Strategic decisions** — CI changes, protection tier updates, model swaps
5. **Queue refills** — writing WORK_QUEUE v5+ when v4 is done
6. **Novel failures** — something the automated layers can't diagnose

### Approving claude-review PRs

Since all PRs are authored by the repo owner, GitHub blocks self-approval. To unblock:
```bash
# Review the diff, then if it's good:
gh pr edit <N> --repo corpunum/OpenLunum --remove-label "claude-review" --add-label "orchestrator-approved"
# The merge bot will pick it up on next cycle (within 2 minutes)
```

## Common Operations

### Full health check
```bash
cd /home/corpunum/OpenLunum

# Flags
for f in ESCALATED THERMAL_HALT PAUSED STUCK; do
  [ -f "reports/pi-loop/$f" ] && echo "FLAG $f: $(cat reports/pi-loop/$f)" || echo "$f: clear"
done
[ -f "reports/orchestrator/NEEDS_CLOUD" ] && echo "NEEDS_CLOUD: $(cat reports/orchestrator/NEEDS_CLOUD)" || echo "NEEDS_CLOUD: clear"

# Loops
for p in 'pi-loop\.sh' 'pi-review-loop\.sh' 'pi-merge-loop\.sh' 'pi-docs-loop\.sh'; do
  pgrep -af "$p" | grep -v pgrep | head -1 || echo "$p: DOWN"
done

# Temps
tail -1 reports/pi-loop/temps.csv

# Recent merges
tail -10 reports/pi-merge/merge-status.log

# Open PRs
gh pr list --repo corpunum/OpenLunum --state open

# Queue progress
echo "Done: $(grep -c '\[x\]' WORK_QUEUE.md) / Todo: $(grep -c '\[ \]' WORK_QUEUE.md)"
```

### Fix a STUCK worker
```bash
cd /home/corpunum/OpenLunum
git checkout -- .
git pull --ff-only origin main
find packages -name dist -type d -exec rm -rf {} +
pnpm build && pnpm verify
rm -f reports/pi-loop/STUCK reports/pi-loop/ESCALATED
# Watchdog restarts the worker within 5 minutes
```

### Clear NEEDS_CLOUD after resolving
```bash
rm -f reports/orchestrator/NEEDS_CLOUD
```

### Update worker priorities
```bash
cd ~/openlunum-workers/review
git fetch origin main && git reset --hard origin/main
# Edit scripts/pi-task-prompt.md
git add scripts/pi-task-prompt.md
ALLOW_MAIN_COMMIT=1 git commit -m "fix(worker): update priorities"
ALLOW_MAIN_PUSH=1 git push origin HEAD:main
```

### Close stale PRs
```bash
gh pr close <N> --repo corpunum/OpenLunum --comment "Closing: <reason>"
```

### Restart a dead loop
```bash
PI_MODEL="openai/qwen3.6-35b-a3b" nohup bash scripts/pi-loop.sh /home/corpunum/OpenLunum > reports/pi-loop/nohup.log 2>&1 &
```

### Update this document (MANDATORY every check-in)
```bash
cd ~/openlunum-workers/review
git fetch origin main && git reset --hard origin/main
# Edit ORCHESTRATOR.md — update the "Current State" section
git add ORCHESTRATOR.md
ALLOW_MAIN_COMMIT=1 git commit -m "docs: orchestrator check-in $(date +%Y-%m-%d)"
ALLOW_MAIN_PUSH=1 git push origin HEAD:main
```

## Models

| Model | Role | Size | Router ID |
|---|---|---|---|
| Qwen 3.6 35B MTP | Worker + LLM diagnosis | 28GB | `openai/qwen3.6-35b-a3b` |
| SuperQwen AgentWorld 35B | Reviewer | 35GB | `openai/superqwen-agentworld-35b-a3b` |
| Qwen 4B | Docs (ROG Ally) | 4GB | via SSH tunnel |
| OpenUnum Brain 1.7B | Chat (co-hosted) | 1.7GB | contract3 lanes |

All served via llama.cpp native router on port 8080. Config: `/home/corpunum/models-preset.ini`. Max 3 models co-loaded (`--models-max 3`). LRU eviction. **Never load two 35B+ models simultaneously** — ComfyUI shares GPU memory and will OOM.

## Eval Harness

Results at `reports/agent-eval/tier1-results.json`. Two tiers:
- **Tier 1**: 12 single-turn coding prompts, scored mechanically
- **Tier 2**: 3 full agent runs in isolated worktrees

Run manually: `node scripts/agent-eval/run-eval.mjs`

## Dashboard

Port 3847, systemd service `openlunum-dashboard`. Backend: `server.mjs` (Node.js, no deps). Frontend: pure CSS, no canvas/charts library. Shows: loop status, flags, temps, merge history, eval results, hero progress bar, queue breakdown.

## Critical Rules

1. **Never edit files in `~/OpenLunum` directly** — the worker wipes them with `git reset --hard` every cycle. Always use the review worktree at `~/openlunum-workers/review`.
2. **Never restart `openunum.service`, `comfyui.service`, or `orpheus-tts.service`** — they share the GPU and auto-recover.
3. **One large model at a time** during evals — two 35B models = OOM.
4. **Port 8080 is shared** — check for in-flight LLM turns before heavy operations.
5. **`ALLOW_MAIN_COMMIT=1` and `ALLOW_MAIN_PUSH=1`** env vars bypass git hooks for infra commits only.
6. **Update this document** on every check-in — update the Current State section below and push.
7. **Be quota-conscious** — the user pays for cloud LLM usage. Keep responses short when nominal.

## CI Status

GitHub Actions billing was exhausted ~2026-06-13, restored 2026-07-09. CI runs still show failures (runner issues). Pipeline works fully without CI (reviewer + local verify). Quality gate CI workflow now exists (PR #151/152 merged).

---

## Current State (2026-07-19)

**Last updated by**: GPT-5 Codex (cloud orchestrator)
**Timestamp**: 2026-07-19T20:00+03:00

- **Incident #188**: confirmed. With no branch protection, the old merge bot ignored GitHub checks and blockers, unconditionally converted drafts to ready, and merged #185, #186, #187, and #190 after failed/no-step Actions jobs.
- **Merge control repair**: `88017f8` is on `main`. The bot now fails closed on drafts, conflicts, blocking labels, unresolved current-head `NEEDS_WORK`, stale approvals, missing/non-successful exact-head checks, and checks with zero recorded steps. Merges use `--match-head-commit`. Fourteen policy tests and full `pnpm verify` pass.
- **GitHub protection**: `main` now requires exact contexts `verify`, `schema-drift`, `report-validation`, and `protected-data-boundary`, with strict updates, admin enforcement, conversation resolution, and force-push/deletion disabled. There are no bypasses for `orchestrator-approved`; that label only satisfies protected-path review when paired with a reason bound to the current head.
- **Deployment**: the repaired merge bot is live and has mechanically blocked #181 and #184. The temporary `PAUSED` guard was moved to `/tmp/openlunum-PAUSED-issue-188`; worker, reviewer, docs, watchdog, and model services remain active.
- **CI blocker**: Actions jobs currently fail before steps because account payments/spending limits prevent runners from starting. This now blocks every merge as intended. Fix billing/runner availability; do not relax required checks.
- **Open PR audit**: #189, #184, #181, and #178 are `NEEDS_WORK` and must be rebuilt from current `main`; #191 is a new draft migration-CLI candidate requiring independent review. Re-check the live PR list because the worker remains active.
- **Post-merge audit**: keep #187's three reopened gates. Repair #185/#190 claims: renderer conformance is only 7/10, there are no exact committed renderer goldens, tokenizer preservation is tautological, and no named-model retention report was published. Downgrade Reference/established wording until evidence exists.
- **Urgent #186 repair**: report filenames interpolate unsanitized `profile.id` and can escape `outputDir`; all-error models can be reported as “best”; duplicate IDs corrupt aggregation/provenance. Add containment-safe filenames, unique immutable model identity, no-winner/tie handling, exact deterministic tests, and a protocol-compliant experiment before claiming maturity.
- **Handover note**: the quoted audit referenced a canonical `HANDOVER.md`, but no such file exists on current `main`. This `ORCHESTRATOR.md` remains the repository's mandated handover record.
