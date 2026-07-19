# OpenLunum Orchestrator Handover

This document enables any LLM (Claude, GPT, Gemini, local Qwen) to take over as orchestrator of the OpenLunum autonomous pipeline. Read this before doing anything.

## Architecture: 5-Layer Stack

```
Layer 5: Orchestrator (this role) — strategic decisions, audit responses, prompt updates
Layer 4: Watchdog (systemd timer, every 5min) — restarts dead loops, thermal management
Layer 3: Local Orchestrator (systemd timer, every 3h) — health checks, STUCK auto-fix, stale PR cleanup
Layer 2: Reviewer (AgentWorld-35B) — reviews PRs, posts LGTM or fix requests
Layer 1: Worker (Qwen 35B MTP) — implements queue items, opens draft PRs
Layer 0: Merge Bot (bash) — merges approved PRs, auto-reverts if main breaks
        Docs Loop (Qwen 4B on ROG Ally) — syncs documentation after merges
```

Layers 0-4 are fully automated bash scripts + systemd timers. Layer 5 (you) is needed only for judgment calls.

## Key Paths

| What | Path |
|---|---|
| Repo | `/home/corpunum/OpenLunum` |
| Review worktree | `/home/corpunum/openlunum-workers/review` (safe from worker's `git reset --hard`) |
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
| Orchestrator logs | `reports/orchestrator/status.log` |
| Merge logs | `reports/pi-merge/merge-status.log` |
| Temps | `reports/pi-loop/temps.csv` (ts,cpu,gpu,freq) |
| LLM router | `llama-qwen36.service` (port 8080, llama.cpp native router) |
| Models config | `/home/corpunum/models-preset.ini` |

## Hardware

- **Main rig**: Bosgame BeyondMax, Ryzen AI MAX+ 395, 128GB unified RAM, 2TB NVMe, Ubuntu 24.04
- **ROG Ally**: Docs loop runs here via SSH tunnel (port 18084)
- **GPU**: Radeon 8060S (gfx1151), ROCm via TheRock wheels
- **Thermal**: CPU/GPU typically 85-90°C under load. Watchdog halts at 101°C sustained, resumes at 88°C

## How the Worker Loop Works

1. Worker starts, runs `pnpm verify` on main
2. Reads `WORK_QUEUE.md`, finds first unchecked item not already claimed
3. Creates `agent/qwen/<area>/<name>` branch from main
4. Implements the item, runs verify, pushes branch, opens draft PR
5. Reviewer picks it up, posts review comments or LGTM
6. Merge bot merges LGTM'd PRs, auto-reverts if main breaks
7. If worker hits 3 consecutive verify failures → writes STUCK file → watchdog/orchestrator resolves

## Two-Tier Protected Paths

- **Hard-protected** (CI, agent scripts, protected data): always need `claude-review` label, never auto-merge
- **Soft-protected** (core semantics, schemas, registry): auto-merge if reviewer posts `LGTM-protected`

Configured in `scripts/pi-merge-loop.sh` via `HARD_PROTECTED_RE` and `SOFT_PROTECTED_RE`.

## When You're Needed (Layer 5)

The local orchestrator (`pi-orchestrator.sh`) handles routine work. You're only called when:

1. **`NEEDS_CLOUD` flag exists** at `reports/orchestrator/NEEDS_CLOUD` — local auto-fix failed
2. **External audit** — someone provides a review that needs task prompt updates
3. **Strategic decisions** — CI changes, protection tier updates, model swaps
4. **Queue refills** — writing WORK_QUEUE v5+ when v4 is done
5. **Novel failures** — something the bash scripts can't diagnose

## Common Operations

### Check health (what the local orchestrator does every 3h)
```bash
# Flags
for f in ESCALATED THERMAL_HALT PAUSED STUCK; do
  [ -f "reports/pi-loop/$f" ] && echo "$f: $(cat reports/pi-loop/$f)" || echo "$f: clear"
done
# Loops
for p in 'pi-loop\.sh' 'pi-review-loop\.sh' 'pi-merge-loop\.sh' 'pi-docs-loop\.sh'; do
  pgrep -af "$p" | grep -v pgrep | head -1 || echo "$p: DOWN"
done
# Temps
tail -1 reports/pi-loop/temps.csv
# Merge log
tail -10 reports/pi-merge/merge-status.log
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

### Update worker priorities
Edit `scripts/pi-task-prompt.md` from the review worktree:
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

### Add a work queue batch
Edit `WORK_QUEUE.md` — add a new `# WORK_QUEUE v5` section with `- [ ]` items. Push from review worktree.

### Restart a dead loop
The watchdog does this automatically. Manual:
```bash
PI_MODEL="openai/qwen3.6-35b-a3b" nohup bash scripts/pi-loop.sh /home/corpunum/OpenLunum > reports/pi-loop/nohup.log 2>&1 &
```

## Models

| Model | Role | Size | ID |
|---|---|---|---|
| Qwen 3.6 35B MTP | Worker | 28GB | `openai/qwen3.6-35b-a3b` |
| SuperQwen AgentWorld 35B | Reviewer | 35GB | `openai/superqwen-agentworld-35b-a3b` |
| Qwen 4B | Docs (ROG Ally) | 4GB | via tunnel |
| OpenUnum Brain 1.7B | Chat (co-hosted) | 1.7GB | contract3 lanes |

All served via llama.cpp native router on port 8080. Config: `/home/corpunum/models-preset.ini`. Max 3 models co-loaded (`--models-max 3`). LRU eviction. Never load two 35B+ models simultaneously or ComfyUI OOMs.

## Eval Harness

Results at `reports/agent-eval/tier1-results.json`. Two tiers:
- **Tier 1**: 12 single-turn coding prompts, scored mechanically
- **Tier 2**: 3 full agent runs in isolated worktrees

Run manually: `node scripts/agent-eval/run-eval.mjs`

## Dashboard

Port 3847, systemd service `openlunum-dashboard`. Backend: `server.mjs` (Node.js, no deps). Frontend: pure CSS, no canvas/charts library. Access via Tailscale IP from mobile.

## Critical Rules

1. **Never edit files in `~/OpenLunum` directly** — the worker wipes them with `git reset --hard` every ~30 seconds. Always use the review worktree at `~/openlunum-workers/review`.
2. **Never restart `openunum.service`, `comfyui.service`, or `orpheus-tts.service`** — they share the GPU and auto-recover.
3. **One large model at a time** during evals — two 35B models = OOM.
4. **Port 8080 is shared** — check for in-flight LLM turns before heavy operations.
5. **`ALLOW_MAIN_COMMIT=1` and `ALLOW_MAIN_PUSH=1`** env vars bypass git hooks for infra commits only.

## Escalation Path

```
Bash watchdog (5min) → fixes simple loop deaths
Local orchestrator (3h) → fixes STUCK, flags stale PRs
NEEDS_CLOUD flag → cloud orchestrator (Claude/GPT/Gemini) reviews
User notification → desktop notify-send for critical issues
```

## Current State (2026-07-19)

- **Last cloud check-in**: 2026-07-19T12:02+03:00
- **Health**: all flags clear (including `NEEDS_CLOUD`); worker, reviewer, merge, and docs loops are up. The router and both loaded 35B model servers passed health checks. Latest temperature: CPU 85°C, GPU 83°C, frequency 2142MHz.
- **Verification**: `pnpm verify` and `pnpm agent:status` passed in the review worktree; eval smoke dataset hash: `6a5dfd6eeea0c368218003a12a56221f61ad3119fc22aa431c4fd4cc99826873`.
- **Work queue**: 45 done, 27 todo (v4 in progress); worker remains in rebuild mode.
- **Activity**: a new worker run started at 12:01; reviewer is actively validating PR #150. Docs loop completed its latest pass at 12:00.
- **Open PRs**: draft #147 (quality-gate CI), #127 (rollback process), and #91 (retention regression gate). #91 is stale with no file diff; leave it for the automated rebuild/triage flow unless it persists.
- **Merges**: recent main merges are green; no reverts reported.
- **CI**: still requires follow-up for billing/runner reliability; the local pipeline is nominal.
- **Throughput action**: claim generation now lists only open-PR or unpublished agent branches, so historical merged branches no longer force the worker into rebuild mode. The worker prompt now explicitly rejects loop telemetry and generated artifacts. `pnpm verify` passed after this orchestration change.
- **Protected PRs**: #147 and #150 are conflicted/draft and require a clean scoped rebuild plus maintainer review; protections remain in force. Do not force-merge them. #91 remains stale/no-diff and should be rebuilt or closed after its successor exists.
