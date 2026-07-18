#!/usr/bin/env node
/**
 * Extract failure cases from Pi agent session logs.
 *
 * Parses JSONL session files (~/.pi/agent/sessions/<encoded-cwd>/),
 * finds failed tool calls (isError:true) and model errors (stopReason:"error"),
 * joins each failure to the tool call and assistant context that produced it,
 * categorizes, deduplicates, and writes reports/agent-eval/failure-corpus.json.
 *
 * Usage: node scripts/agent-eval/extract-failures.mjs [--sessions-dir <dir>]
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const argIdx = process.argv.indexOf("--sessions-dir");
const sessionsRoot =
  argIdx > -1 ? process.argv[argIdx + 1] : join(os.homedir(), ".pi", "agent", "sessions");

// Session dirs related to OpenLunum work
const SESSION_DIR_PATTERN = /openlunum|OpenLunum/i;

function categorize(toolName, errorText, command) {
  const t = errorText.toLowerCase();
  const c = (command || "").toLowerCase();
  if (t.includes("already exists") && c.includes("branch")) return "branch-exists";
  if (/error ts\d+|ts\(\d+|type '.*' is not assignable/i.test(errorText)) return "ts-type-error";
  if (t.includes("blocked") || (c.includes("push") && c.includes("main"))) return "protocol-violation";
  if (t.includes("err_pnpm") || t.includes("elifecycle") || t.includes("verify")) return "verify-failure";
  if (t.includes("command not found") || t.includes("no such file") || t.includes("cannot find module"))
    return "hallucinated-api";
  if (t.includes("timed out") || t.includes("timeout")) return "timeout";
  if (t.includes("merge conflict") || t.includes("needs merge")) return "git-conflict";
  return "other";
}

function extractFromFile(path) {
  const failures = [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const entriesById = new Map();
  const entries = [];
  for (const line of lines) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    entries.push(e);
    if (e.id) entriesById.set(e.id, e);
  }

  // Index tool calls by toolCall.id (they live inside assistant messages)
  const toolCallsById = new Map();
  for (const e of entries) {
    if (e.type !== "message" || e.message?.role !== "assistant") continue;
    for (const block of e.message.content ?? []) {
      if (block.type === "toolCall") {
        toolCallsById.set(block.id, { block, assistantEntry: e });
      }
    }
  }

  for (const e of entries) {
    // Failed tool results
    if (e.type === "message" && e.message?.role === "toolResult" && e.message.isError) {
      const tc = toolCallsById.get(e.message.toolCallId);
      const errorText = (e.message.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const command =
        tc?.block?.arguments?.command ??
        JSON.stringify(tc?.block?.arguments ?? {}).slice(0, 500);
      const assistantText = (tc?.assistantEntry?.message?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .slice(0, 1000);
      failures.push({
        kind: "tool-error",
        session: path.split("/").slice(-2).join("/"),
        toolName: e.message.toolName,
        command: String(command).slice(0, 1000),
        errorText: errorText.slice(0, 2000),
        assistantContext: assistantText,
        category: categorize(e.message.toolName, errorText, String(command)),
        timestamp: e.message.timestamp ?? e.timestamp ?? null,
      });
    }
    // Model-level errors
    if (
      e.type === "message" &&
      e.message?.role === "assistant" &&
      (e.message.stopReason === "error" || e.message.errorMessage)
    ) {
      failures.push({
        kind: "model-error",
        session: path.split("/").slice(-2).join("/"),
        toolName: null,
        command: null,
        errorText: String(e.message.errorMessage ?? "stopReason:error").slice(0, 2000),
        assistantContext: "",
        category: "model-error",
        timestamp: e.timestamp ?? null,
      });
    }
  }
  return failures;
}

// Collect session files
const sessionDirs = readdirSync(sessionsRoot).filter((d) => SESSION_DIR_PATTERN.test(d));
let all = [];
for (const dir of sessionDirs) {
  const full = join(sessionsRoot, dir);
  for (const f of readdirSync(full).filter((f) => f.endsWith(".jsonl"))) {
    try {
      all = all.concat(extractFromFile(join(full, f)));
    } catch (err) {
      console.error(`skip ${f}: ${err.message}`);
    }
  }
}

// Deduplicate on (category, first 200 chars of errorText)
const seen = new Set();
const deduped = [];
for (const f of all) {
  const key = `${f.category}|${f.errorText.slice(0, 200)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(f);
}

// Category summary
const byCategory = {};
for (const f of all) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;

const outDir = join(repoRoot, "reports", "agent-eval");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "failure-corpus.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sessionsRoot,
      sessionDirs,
      totals: { raw: all.length, deduped: deduped.length, byCategory },
      failures: deduped,
    },
    null,
    2,
  ),
);

console.log(`raw failures: ${all.length}`);
console.log(`deduped:      ${deduped.length}`);
console.log("by category:", JSON.stringify(byCategory, null, 2));
console.log(`written to:   ${outPath}`);
