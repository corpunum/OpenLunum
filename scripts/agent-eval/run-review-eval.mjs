#!/usr/bin/env node
/**
 * Tier 3: reviewer-model benchmark.
 *
 * Feeds each candidate model real PR diffs + verify output from today's
 * merge-lane reviews, where the correct verdict is known. Scores:
 *   +2 correct READY_FOR_MERGE / NEEDS_WORK classification
 *   +1 (NEEDS_WORK cases) reason mentions the actual defect
 *
 * Usage: node run-review-eval.mjs --models "supergemma4-e4b,openai/qwen3.6-40b-code"
 * Output: reports/agent-eval/tier3-review-results.json
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const outDir = join(repoRoot, "reports", "agent-eval");
const outPath = join(outDir, "tier3-review-results.json");
const ROUTER = "http://localhost:8080";

const args = process.argv.slice(2);
const mi = args.indexOf("--models");
const models = (mi > -1 ? args[mi + 1] : "supergemma4-e4b").split(",").map((s) => s.trim());

// Ground truth from the human merge-lane reviews of 2026-07-17
const CASES = [
  { pr: 19, verdict: "NEEDS_WORK", defectRe: /(schema-conformance|missing (module|file)|does not exist|cannot (compile|resolve)|unresolved import)/i,
    verify: "pnpm verify: packages/core build FAILED — error TS2307: Cannot find module './schema-conformance.js'" },
  { pr: 22, verdict: "NEEDS_WORK", defectRe: /(TS\d{4}|type[- ]only import|not assignable|compile|build fail)/i,
    verify: "pnpm verify: packages/core build FAILED — TS1484 'LunumRecord' must be type-only import; TS2345 fixture not assignable to LunumRecord (x2); TS2532 possibly undefined (x2)" },
  { pr: 23, verdict: "READY_FOR_MERGE", defectRe: null,
    verify: "pnpm verify: all green. core 42 pass / 0 fail (15 new policy-classifier tests)" },
  { pr: 24, verdict: "READY_FOR_MERGE", defectRe: null,
    verify: "pnpm verify: all green. mcp package tests 5 pass / 0 fail" },
  { pr: 25, verdict: "READY_FOR_MERGE", defectRe: null,
    verify: "pnpm verify: all green. eval 33 pass / 0 fail (7 new retrieval tests)" },
  { pr: 18, verdict: "READY_FOR_MERGE", defectRe: null,
    verify: "pnpm verify: all green (docs/experiment scaffolding only, no code)" },
  { pr: 33, verdict: "NEEDS_WORK", defectRe: /(no tests|missing tests|without (any )?tests|add (unit|property )?tests|untested)/i,
    verify: "pnpm verify: all green — but the diff adds new semantic-contract type structures (typed-structures.ts, 266 lines) with zero test files" },
];

const SYSTEM = `You are a strict code reviewer for the OpenLunum project. Rules:
- A PR is READY_FOR_MERGE only if verify passes AND the change is sound and complete.
- Semantic-contract changes (packages/core type/schema/canonicalize/fingerprint code) REQUIRE tests. No tests = NEEDS_WORK even when verify passes.
- Broken imports, compile errors, or failing verify = NEEDS_WORK.
- Docs/experiment scaffolding with green verify is mergeable.
Reply in exactly this format:
VERDICT: READY_FOR_MERGE or NEEDS_WORK
REASON: <one sentence naming the decisive issue or confirming soundness>`;

function prDiff(n) {
  try {
    return execFileSync("gh", ["pr", "diff", String(n)], { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 })
      .toString().slice(0, 6000);
  } catch {
    return "(diff unavailable)";
  }
}

async function chat(model, user) {
  const r = await fetch(`${ROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 2048,
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const m = d.choices?.[0]?.message ?? {};
  return (m.content && m.content.trim()) ? m.content : (m.reasoning_content ?? "");
}

const diffs = new Map(CASES.map((c) => [c.pr, prDiff(c.pr)]));
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const all = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];

for (const model of models) {
  console.log(`\n=== ${model} ===`);
  const run = { model, at: new Date().toISOString(), cases: [] };
  let score = 0, max = 0;
  for (const c of CASES) {
    max += c.verdict === "NEEDS_WORK" ? 3 : 2;
    const user = `Review PR #${c.pr}.\n\nVerify result:\n${c.verify}\n\nDiff (truncated):\n${diffs.get(c.pr)}`;
    let text = "";
    try { text = await chat(model, user); } catch (e) { text = `ERROR: ${e.message}`; }
    const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
    const saidReady = /VERDICT:\s*READY_FOR_MERGE/i.test(clean);
    const saidNeeds = /VERDICT:\s*NEEDS_WORK/i.test(clean);
    const verdictOk = (c.verdict === "READY_FOR_MERGE" && saidReady && !saidNeeds) ||
                      (c.verdict === "NEEDS_WORK" && saidNeeds);
    let pts = verdictOk ? 2 : 0;
    let reasonOk = null;
    if (c.verdict === "NEEDS_WORK" && verdictOk && c.defectRe) {
      reasonOk = c.defectRe.test(clean);
      if (reasonOk) pts += 1;
    }
    score += pts;
    run.cases.push({ pr: c.pr, expected: c.verdict, verdictOk, reasonOk, pts,
      snippet: clean.slice(0, 250) });
    console.log(`${verdictOk ? "OK " : "BAD"} #${c.pr} expected=${c.verdict} pts=${pts}${reasonOk === false ? " (reason missed defect)" : ""}`);
  }
  run.score = `${score}/${max}`;
  console.log(`>>> ${model}: ${run.score}`);
  all.push(run);
  writeFileSync(outPath, JSON.stringify(all, null, 2));

  if (model !== "openai/qwen3.6-35b-a3b") {
    try {
      await fetch(`${ROUTER}/models/unload`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
    } catch {}
  }
}
console.log(`\nwritten: ${outPath}`);
