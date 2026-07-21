import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve("scripts/pi-dispatch-once.sh");

async function withTempRepo(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "openlunum-dispatch-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function dispatch(workdir) {
  return spawnSync("bash", [script, workdir], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      OPENLUNUM_ASSIGNMENT_FILE: path.join(
        workdir,
        "reports/orchestrator/WORKER_ASSIGNMENT.md",
      ),
    },
  });
}

test("exits idle without invoking git or a model when no assignment exists", async () => {
  await withTempRepo(async (workdir) => {
    const result = dispatch(workdir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /IDLE: no explicit worker assignment/);
  });
});

test("fails closed when required assignment metadata is incomplete", async () => {
  await withTempRepo(async (workdir) => {
    const assignmentDir = path.join(workdir, "reports/orchestrator");
    await mkdir(assignmentDir, { recursive: true });
    await writeFile(
      path.join(assignmentDir, "WORKER_ASSIGNMENT.md"),
      [
        "assignment_id: incomplete",
        "issue: 253",
        "worker: qwen-eval",
        "tier: 3",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = dispatch(workdir);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /assignment is missing/);
  });
});

test("rejects a branch whose issue or worker segment does not match", async () => {
  await withTempRepo(async (workdir) => {
    const assignmentDir = path.join(workdir, "reports/orchestrator");
    await mkdir(assignmentDir, { recursive: true });
    await writeFile(
      path.join(assignmentDir, "WORKER_ASSIGNMENT.md"),
      [
        "assignment_id: mismatch",
        "issue: 253",
        "worker: qwen-eval",
        "branch: work/qwen-core/999-wrong-task",
        "tier: 3",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = dispatch(workdir);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /branch must match/);
  });
});

test("pi-loop-ally.sh exits idle when no assignment exists", async () => {
  await withTempRepo(async (workdir) => {
    const allyScript = path.resolve("scripts/pi-loop-ally.sh");
    const result = spawnSync("bash", [allyScript, workdir], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENLUNUM_ASSIGNMENT_FILE: path.join(
          workdir,
          "reports/orchestrator/WORKER_ASSIGNMENT.md",
        ),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /IDLE: no explicit worker assignment/);
  });
});

test("pi-docs-loop.sh exits idle when no assignment exists", async () => {
  await withTempRepo(async (workdir) => {
    const docsScript = path.resolve("scripts/pi-docs-loop.sh");
    const result = spawnSync("bash", [docsScript, workdir], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENLUNUM_ASSIGNMENT_FILE: path.join(
          workdir,
          "reports/orchestrator/WORKER_ASSIGNMENT.md",
        ),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /IDLE: no explicit worker assignment/);
  });
});

test("pi-loop.sh exits idle when no assignment exists", async () => {
  await withTempRepo(async (workdir) => {
    const loopScript = path.resolve("scripts/pi-loop.sh");
    const result = spawnSync("bash", [loopScript, workdir], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENLUNUM_ASSIGNMENT_FILE: path.join(
          workdir,
          "reports/orchestrator/WORKER_ASSIGNMENT.md",
        ),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /IDLE: no explicit worker assignment/);
  });
});
