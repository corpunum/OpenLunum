import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMergePolicy, REQUIRED_CHECKS } from "./pi-merge-policy.mjs";

const HEAD = "a".repeat(40);

function passingFixture() {
  return {
    pr: {
      draft: false,
      mergeable: true,
      base: { ref: "main" },
      head: { sha: HEAD },
      labels: [{ name: "ready-for-merge" }],
    },
    comments: [{ body: `REVIEW ${HEAD}: READY_FOR_MERGE — exact-head review` }],
    reviews: [],
    checks: REQUIRED_CHECKS.map((name, index) => ({
      id: index + 1,
      name,
      head_sha: HEAD,
      status: "completed",
      conclusion: "success",
      app: { slug: "github-actions" },
      stepCount: 4,
    })),
  };
}

test("allows a merge only with exact-head approval and successful nonempty checks", () => {
  assert.deepEqual(evaluateMergePolicy(passingFixture()).reasons, []);
});

for (const conclusion of ["failure", "cancelled", "skipped", "neutral", null]) {
  test(`blocks a ${conclusion} required check`, () => {
    const fixture = passingFixture();
    fixture.checks[0].conclusion = conclusion;
    assert.equal(evaluateMergePolicy(fixture).allowed, false);
  });
}

test("blocks a successful check that recorded no workflow steps", () => {
  const fixture = passingFixture();
  fixture.checks[0].stepCount = 0;
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /recorded no workflow steps/);
});

test("blocks missing checks and ignores successful checks from a stale SHA", () => {
  const fixture = passingFixture();
  fixture.checks[0].head_sha = "b".repeat(40);
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /required check missing/);
});

test("an outage flag or caller option cannot bypass required checks", () => {
  const fixture = passingFixture();
  fixture.checks = [];
  const result = evaluateMergePolicy({ ...fixture, skipRequiredChecks: true });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.requiredChecks, REQUIRED_CHECKS);
});

test("blocks drafts and merge conflicts", () => {
  const fixture = passingFixture();
  fixture.pr.draft = true;
  fixture.pr.mergeable = false;
  const reasons = evaluateMergePolicy(fixture).reasons.join("\n");
  assert.match(reasons, /draft/);
  assert.match(reasons, /not currently mergeable/);
});

test("current-head NEEDS_WORK overrides a ready review and label", () => {
  const fixture = passingFixture();
  fixture.comments.push({ body: `Maintainer re-review at ${HEAD}: NEEDS_WORK — unsafe` });
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /unresolved NEEDS_WORK/);
});

test("blocking labels fail closed", () => {
  for (const name of ["needs-work", "needs-rebase", "maintainer-blocked"]) {
    const fixture = passingFixture();
    fixture.pr.labels.push({ name });
    assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), new RegExp(name));
  }
});

test("orchestrator approval requires a reason bound to the exact head", () => {
  const fixture = passingFixture();
  fixture.pr.labels = [{ name: "orchestrator-approved" }];
  fixture.comments = [{ body: `ORCHESTRATOR APPROVAL ${HEAD}: protected path reviewed` }];
  assert.equal(evaluateMergePolicy(fixture).allowed, true);

  fixture.comments = [{ body: `ORCHESTRATOR APPROVAL ${"b".repeat(40)}: stale approval` }];
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /lacks a reason bound/);
});

test("latest check result wins for a rerun on the same head", () => {
  const fixture = passingFixture();
  fixture.checks.push({ ...fixture.checks[0], id: 100, conclusion: "failure" });
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /not successful/);
});

test("requires the path-filtered quality gate for core and eval source changes", () => {
  const fixture = passingFixture();
  fixture.pr.changedFiles = ["packages/core/src/index.ts"];
  assert.match(evaluateMergePolicy(fixture).reasons.join("\n"), /quality-gates/);

  fixture.checks.push({
    id: 100,
    name: "quality-gates",
    head_sha: HEAD,
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" },
    stepCount: 3,
  });
  assert.equal(evaluateMergePolicy(fixture).allowed, true);
});
