#!/usr/bin/env node
/**
 * Tier 1 model eval: single-turn tasks derived from real Pi agent failures.
 *
 * For each candidate model (one at a time, via the llama.cpp router on :8080):
 *   1. Memory-safety gates: MemAvailable headroom, ComfyUI queues empty
 *   2. Warm-up request (triggers router load; waits for model readiness)
 *   3. Run every task at temperature 0, score with mustMatch/mustNotMatch regexes
 *   4. Record pass/fail, latency, response snippet
 *
 * Usage:
 *   node scripts/agent-eval/run-eval.mjs --models "openai/qwen3-coder-30b-a3b,openai/qwen3.6-35b-a3b"
 *   node scripts/agent-eval/run-eval.mjs --models "..." --skip-gates   (for dry runs)
 *
 * Results appended to reports/agent-eval/tier1-results.json (one entry per model run).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const outDir = join(repoRoot, "reports", "agent-eval");
const outPath = join(outDir, "tier1-results.json");

const ROUTER = process.env.EVAL_ROUTER ?? "http://localhost:8080";
const COMFYUI = "http://localhost:18085";

// Rough resident-size estimates (GiB) for the memory gate, weights + KV headroom
const MODEL_SIZE_GIB = {
  "openai/qwen3-coder-30b-a3b": 28,
  "openai/qwen3.6-35b-a3b": 32,
  "openai/superqwen-agentworld-35b-a3b": 39,
  "openai/qwen3.6-40b-code": 44,
  "openai/qwen3.5-122b-a10b": 68,
  "supergemma4-e4b": 18,
};
const HEADROOM_GIB = 10;

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : dflt;
}
const models = argVal("--models", "openai/qwen3-coder-30b-a3b").split(",").map((s) => s.trim());
const skipGates = args.includes("--skip-gates");
const maxTokens = Number(argVal("--max-tokens", "4096"));

const { tasks } = JSON.parse(readFileSync(join(__dirname, "tasks", "tier1-tasks.json"), "utf8"));

function memAvailableGiB() {
  const meminfo = readFileSync("/proc/meminfo", "utf8");
  const kb = Number(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] ?? 0);
  return kb / 1024 / 1024;
}

function gttUsedGiB() {
  try {
    for (const card of readdirSync("/sys/class/drm").filter((c) => /^card\d+$/.test(c))) {
      const p = `/sys/class/drm/${card}/device/mem_info_gtt_used`;
      if (existsSync(p)) return Number(readFileSync(p, "utf8").trim()) / 1024 ** 3;
    }
  } catch {}
  return -1;
}

async function comfyuiBusy() {
  try {
    const r = await fetch(`${COMFYUI}/queue`, { signal: AbortSignal.timeout(5000) });
    const q = await r.json();
    return (q.queue_running?.length ?? 0) > 0 || (q.queue_pending?.length ?? 0) > 0;
  } catch {
    return false; // ComfyUI down/unreachable = not busy
  }
}

async function chat(model, system, prompt, timeoutMs = 300_000) {
  const t0 = Date.now();
  const r = await fetch(`${ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const msg = data.choices?.[0]?.message ?? {};
  // Reasoning models may put everything in reasoning_content and leave content
  // empty (thinking consumed the budget). Fall back so we score their answer.
  const text = (msg.content && msg.content.trim()) ? msg.content : (msg.reasoning_content ?? "");
  return { text, latencyMs: Date.now() - t0, usage: data.usage ?? null };
}

function score(task, responseText) {
  // Strip <think> blocks so we score the final answer, not the reasoning
  const text = responseText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const failures = [];
  for (const p of task.mustMatch ?? []) {
    if (!new RegExp(p, "is").test(text)) failures.push(`mustMatch missed: ${p}`);
  }
  for (const p of task.mustNotMatch ?? []) {
    if (new RegExp(p, "is").test(text)) failures.push(`mustNotMatch hit: ${p}`);
  }
  return { pass: failures.length === 0, failures };
}

async function gate(model) {
  if (skipGates) return;
  const need = (MODEL_SIZE_GIB[model] ?? 40) + HEADROOM_GIB;
  for (let attempt = 0; attempt < 30; attempt++) {
    const avail = memAvailableGiB();
    const busy = await comfyuiBusy();
    if (avail >= need && !busy) return;
    console.error(
      `gate: waiting (MemAvailable=${avail.toFixed(1)}GiB need=${need}GiB, comfyuiBusy=${busy}) attempt ${attempt + 1}/30`,
    );
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`memory/comfyui gate never cleared for ${model}`);
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const allResults = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];

for (const model of models) {
  console.log(`\n=== ${model} ===`);
  await gate(model);
  console.log(`gtt-used before load: ${gttUsedGiB().toFixed(1)} GiB`);

  // Warm-up (router loads the model on first request; allow a long timeout)
  try {
    await chat(model, "Reply with OK.", "Reply with OK.", 900_000);
  } catch (e) {
    console.error(`warm-up FAILED for ${model}: ${e.message} — skipping model`);
    allResults.push({ model, at: new Date().toISOString(), error: `warmup: ${e.message}` });
    continue;
  }
  console.log(`gtt-used after load:  ${gttUsedGiB().toFixed(1)} GiB`);

  const run = { model, at: new Date().toISOString(), gttAfterLoadGiB: gttUsedGiB(), tasks: [] };
  let passCount = 0;
  for (const task of tasks) {
    let result;
    try {
      const { text, latencyMs, usage } = await chat(model, task.system, task.prompt);
      const s = score(task, text);
      if (s.pass) passCount++;
      result = {
        id: task.id,
        category: task.category,
        pass: s.pass,
        failures: s.failures,
        latencyMs,
        usage,
        responseSnippet: text.slice(0, 400),
      };
      console.log(`${s.pass ? "PASS" : "FAIL"}  ${task.id} (${(latencyMs / 1000).toFixed(1)}s)${s.pass ? "" : "  — " + s.failures.join("; ")}`);
    } catch (e) {
      result = { id: task.id, category: task.category, pass: false, failures: [`error: ${e.message}`], latencyMs: -1 };
      console.log(`ERR   ${task.id}: ${e.message}`);
    }
    run.tasks.push(result);
  }
  run.passRate = `${passCount}/${tasks.length}`;
  console.log(`>>> ${model}: ${run.passRate}`);
  allResults.push(run);
  writeFileSync(outPath, JSON.stringify(allResults, null, 2));

  // Explicitly unload the candidate to keep GTT memory safe for the next one
  // (leave the Pi default model alone if it happens to be the candidate)
  if (model !== "openai/qwen3-coder-30b-a3b") {
    try {
      await fetch(`${ROUTER}/models/unload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(30_000),
      });
      console.log(`unloaded ${model}; gtt-used now: ${gttUsedGiB().toFixed(1)} GiB`);
    } catch (e) {
      console.error(`unload failed for ${model}: ${e.message}`);
    }
  }
}

console.log(`\nresults written to ${outPath}`);
