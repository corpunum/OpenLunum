# Merge Policy — Fail-Closed Exact-Head

**Status:** Reference implementation  
**Source:** `scripts/pi-merge-policy.mjs`  
**Tests:** `scripts/pi-merge-policy.test.mjs` (109 lines)  
**PR:** #190 (commit 88017f8, repair of incident #188)

## Overview

Fail-closed exact-head merge policy prevents the merge bot from merging PRs whose checks do not correspond to the exact commit being merged. Addresses [incident #188](https://github.com/corpunum/OpenLunum/issues/188) where the old merge bot ignored GitHub checks and blockers, unconditionally converted drafts to ready, and merged PRs #185, #186, #187, and #190 after failed or no-step Actions jobs.

## Required Checks

The policy enforces the following required checks on every PR targeting `main`:

| Check | Always required | Conditionally required |
|-------|:---------------:|----------------------:|
| `verify` | ✓ | |
| `schema-drift` | ✓ | |
| `report-validation` | ✓ | |
| `protected-data-boundary` | ✓ | |
| `quality-gates` | | ✓ when PR touches `packages/core/src/` or `packages/eval/src/` |

## Blocking Labels

The following labels cause immediate rejection:

- `needs-work` — unresolved review feedback
- `needs-rebase` — branch is behind target
- `maintainer-blocked` — maintainer hold

## Approval Mechanisms

The policy recognizes two approval mechanisms, both bound to the current head SHA:

1. **`ready-for-merge`** label: requires a review body containing `REVIEW <headSha>: READY_FOR_MERGE` for the exact current head.
2. **`orchestrator-approved`** label: requires a review body containing `ORCHESTRATOR APPROVAL <headSha>: <reason>` for the exact current head.

Unbound approvals (label present but no matching review body) are rejected.

## Stale Approval Detection

Approvals are validated against the exact head SHA. If a PR is rebased or updated after approval, the approval is stale unless the review body explicitly references the new head.

## Step Count Verification

Every required check must report at least one recorded workflow step. Checks with `stepCount < 1` are rejected, preventing merges when Actions jobs fail before recording any steps (as occurred during GitHub Actions billing outage).

## Draft and Mergeability Checks

- Draft PRs are not merged.
- PRs not mergeable (conflicts) are not merged.
- PRs not targeting `main` are not merged.

## Head SHA Matching

All review bodies, labels, and checks are validated against the exact `head.sha` of the PR. A check that passed on an older head does not satisfy the current head's requirement.

## CI_OUTAGE Flag

When GitHub Actions billing is down, hosted checks never start and would deadlock every merge. The `CI_OUTAGE` flag file lets the orchestrator skip the hosted check requirement while local `verify` and auto-revert in the merge bot still gate.

**Flag path:** `reports/orchestrator/CI_OUTAGE`

When the flag file exists, `evaluateMergePolicy()` receives `skipRequiredChecks: true` and the required checks list becomes empty. The merge bot still verifies:
- Draft status
- Branch target
- Blocking labels
- Approval mechanism validity

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | PR passes all policy checks |
| `1` | PR fails policy checks (reasons listed) |
| `2` | Policy evaluation itself failed (e.g., network error) |

## API

```typescript
export const CI_OUTAGE_FLAG: string;

export const REQUIRED_CHECKS: string[];

export function requiredChecksFor(pr: PullRequest): string[];

export function evaluateMergePolicy(opts: MergePolicyOpts): MergeResult;

export function evaluateGitHubPullRequest(repo: string, prNumber: number): MergeResult;
```

### Types

```typescript
interface PullRequest {
  head?: { sha: string };
  headSha?: string;
  base?: { ref: string };
  baseRef?: string;
  draft?: boolean;
  isDraft?: boolean;
  mergeable?: boolean;
  labels?: Array<string | { name: string }>;
  changedFiles?: string[];
}

interface CheckRun {
  name: string;
  head_sha: string;
  status: string;
  conclusion: string;
  app?: { slug: string };
  stepCount?: number;
}

interface MergePolicyOpts {
  pr: PullRequest;
  comments?: Array<{ body: string }>;
  reviews?: Array<{ body: string }>;
  checks?: CheckRun[];
  skipRequiredChecks?: boolean;
}

interface MergeResult {
  allowed: boolean;
  headSha?: string;
  requiredChecks?: string[];
  reasons: string[];
}
```

## Usage

### Programmatic

```javascript
import { evaluateMergePolicy } from "./pi-merge-policy.mjs";

const result = evaluateMergePolicy({
  pr,
  comments: [...],
  reviews: [...],
  checks: [...],
  skipRequiredChecks: false,
});

if (!result.allowed) {
  console.error("Merge blocked:", result.reasons);
  process.exitCode = 1;
}
```

### CLI

```bash
node scripts/pi-merge-policy.mjs --repo corpunum/OpenLunum --pr 190
```

Outputs JSON:
```json
{ "allowed": true, "headSha": "88017f8...", "requiredChecks": [...], "reasons": [] }
```

## Test Coverage

`scripts/pi-merge-policy.test.mjs` (109 lines) covers:
- Required checks enforcement
- Blocking label rejection
- Stale approval detection via head SHA
- Step count verification (zero steps = fail)
- Draft/mergeable/branch checks
- `orchestrator-approved` binding
- `CI_OUTAGE` flag behavior (skipRequiredChecks)
- CLI JSON output and exit codes
