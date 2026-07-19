#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// When GitHub Actions billing is down, hosted checks never start and would
// deadlock every merge. The flag file lets the orchestrator skip the hosted
// check requirement; local verify + auto-revert in the merge bot still gate.
export const CI_OUTAGE_FLAG = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "reports", "orchestrator", "CI_OUTAGE",
);

export const REQUIRED_CHECKS = [
  "verify",
  "schema-drift",
  "report-validation",
  "protected-data-boundary",
];

export function requiredChecksFor(pr) {
  const required = [...REQUIRED_CHECKS];
  if ((pr.changedFiles ?? []).some((file) => /^(packages\/(core|eval)\/src)\//.test(file))) {
    required.push("quality-gates");
  }
  return required;
}

function labelNames(pr) {
  return new Set((pr.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  ));
}

function latestChecks(checks, headSha) {
  const latest = new Map();
  for (const check of checks ?? []) {
    if (check.head_sha !== headSha) continue;
    const previous = latest.get(check.name);
    if (!previous || Number(check.id ?? 0) > Number(previous.id ?? 0)) {
      latest.set(check.name, check);
    }
  }
  return latest;
}

function bodyIncludes(body, headSha, verdict) {
  const normalized = String(body ?? "").replaceAll("*", "").toUpperCase();
  return normalized.includes(headSha.toUpperCase()) && normalized.includes(verdict);
}

export function evaluateMergePolicy({ pr, comments = [], reviews = [], checks = [], skipRequiredChecks = false }) {
  const reasons = [];
  const headSha = pr.head?.sha ?? pr.headSha;
  const labels = labelNames(pr);
  const reviewBodies = [
    ...comments.map((comment) => comment.body),
    ...reviews.map((review) => review.body),
  ];

  if (!headSha) reasons.push("pull request head SHA is missing");
  if (pr.base?.ref !== "main" && pr.baseRef !== "main") {
    reasons.push("pull request does not target main");
  }
  if (pr.draft === true || pr.isDraft === true) reasons.push("pull request is draft");
  if (pr.mergeable !== true) reasons.push("pull request is not currently mergeable");

  for (const blocker of ["needs-work", "needs-rebase", "maintainer-blocked"]) {
    if (labels.has(blocker)) reasons.push(`blocking label present: ${blocker}`);
  }

  const hasCurrentNeedsWork = headSha && reviewBodies.some((body) =>
    bodyIncludes(body, headSha, "NEEDS_WORK") || bodyIncludes(body, headSha, "NEEDS WORK")
  );
  if (hasCurrentNeedsWork) reasons.push("current head has unresolved NEEDS_WORK feedback");

  const hasReadyReview = headSha && reviewBodies.some((body) => {
    const normalized = String(body ?? "").replaceAll("*", "");
    return normalized.includes(`REVIEW ${headSha}:`) && normalized.includes("READY_FOR_MERGE");
  });
  const hasOrchestratorApproval = headSha && reviewBodies.some((body) => {
    const normalized = String(body ?? "").replaceAll("*", "");
    const marker = `ORCHESTRATOR APPROVAL ${headSha}:`;
    const markerIndex = normalized.indexOf(marker);
    return markerIndex >= 0 && normalized.slice(markerIndex + marker.length).trim().length > 0;
  });

  if (labels.has("orchestrator-approved")) {
    if (!hasOrchestratorApproval) {
      reasons.push("orchestrator-approved label lacks a reason bound to the current head");
    }
  } else if (labels.has("ready-for-merge")) {
    if (!hasReadyReview) reasons.push("ready label lacks a READY_FOR_MERGE review for the current head");
  } else {
    reasons.push("no merge approval label is present");
  }

  const requiredChecks = skipRequiredChecks ? [] : requiredChecksFor(pr);
  const byName = latestChecks(checks, headSha);
  for (const name of requiredChecks) {
    const check = byName.get(name);
    if (!check) {
      reasons.push(`required check missing on current head: ${name}`);
      continue;
    }
    if (check.status !== "completed" || check.conclusion !== "success") {
      reasons.push(`required check is not successful: ${name} (${check.status}/${check.conclusion})`);
      continue;
    }
    if (check.app?.slug !== "github-actions") {
      reasons.push(`required check has unexpected producer: ${name}`);
    }
    if (!Number.isInteger(check.stepCount) || check.stepCount < 1) {
      reasons.push(`required check recorded no workflow steps: ${name}`);
    }
  }

  return { allowed: reasons.length === 0, headSha, requiredChecks, reasons };
}

function ghJson(args) {
  const output = execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("usage: pi-merge-policy.mjs --repo owner/repo --pr number");
    parsed[key.slice(2)] = value;
  }
  if (!parsed.repo || !parsed.pr) throw new Error("usage: pi-merge-policy.mjs --repo owner/repo --pr number");
  return parsed;
}

function jobId(detailsUrl) {
  return String(detailsUrl ?? "").match(/\/job\/(\d+)(?:$|[/?#])/)?.[1];
}

function ghPages(endpoint, selectItems = (page) => page) {
  const items = [];
  for (let pageNumber = 1; ; pageNumber += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const page = ghJson(["api", `${endpoint}${separator}per_page=100&page=${pageNumber}`]);
    const selected = selectItems(page) ?? [];
    items.push(...selected);
    if (selected.length < 100) return items;
  }
}

export function evaluateGitHubPullRequest(repo, prNumber) {
  const pr = ghJson(["api", `repos/${repo}/pulls/${prNumber}`]);
  const comments = ghPages(`repos/${repo}/issues/${prNumber}/comments`);
  const reviews = ghPages(`repos/${repo}/pulls/${prNumber}/reviews`);
  pr.changedFiles = ghPages(`repos/${repo}/pulls/${prNumber}/files`).map((file) => file.filename);
  const checks = ghPages(
    `repos/${repo}/commits/${pr.head.sha}/check-runs`,
    (page) => page.check_runs,
  );

  const latest = latestChecks(checks, pr.head.sha);
  for (const name of requiredChecksFor(pr)) {
    const check = latest.get(name);
    const id = jobId(check?.details_url);
    if (!check || !id) continue;
    try {
      const job = ghJson(["api", `repos/${repo}/actions/jobs/${id}`]);
      check.stepCount = Array.isArray(job.steps) ? job.steps.length : -1;
    } catch {
      check.stepCount = -1;
    }
  }

  return evaluateMergePolicy({
    pr, comments, reviews, checks,
    skipRequiredChecks: existsSync(CI_OUTAGE_FLAG),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = evaluateGitHubPullRequest(args.repo, args.pr);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.allowed ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ allowed: false, reasons: [`policy evaluation failed: ${error.message}`] })}\n`);
    process.exitCode = 2;
  }
}
