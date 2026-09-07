import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = path.resolve('scripts/research/grounding-ladder-audit.mjs');
const side = (providerCandidates, agentCandidates, agentSelected, protocolControlAccepted = true) => ({ providerCandidates, agentCandidates, agentSelected, protocolControlAccepted });

test('grounding ladder separates coverage, proposal recall, control and safety', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openlunum-grounding-ladder-'));
  const input = path.join(directory, 'input.json');
  const output = path.join(directory, 'output.json');
  await writeFile(input, JSON.stringify({ cases: [
    { id: 'same-1', relation: 'same', goldExternalId: 'ili:a', source: side(['ili:a'], ['ili:a'], 'ili:a'), target: side(['ili:a', 'ili:b'], ['ili:b'], 'ili:b') },
    { id: 'different-1', relation: 'different', goldExternalId: 'ili:c', source: side(['ili:c'], ['ili:c'], 'ili:c'), target: side(['ili:d'], [], null) },
    { id: 'different-unsafe', relation: 'different', goldExternalId: 'ili:e', source: side(['ili:e'], ['ili:e'], 'ili:e'), target: side(['ili:e'], ['ili:e'], 'ili:e') },
  ] }));
  const result = await run(process.execPath, [script], { env: { ...process.env, GROUNDING_LADDER_INPUT: input, GROUNDING_LADDER_OUTPUT: output } });
  const report = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(report.summary.totalCases, 3);
  assert.equal(report.summary.bothProviderCovered, 2);
  assert.equal(report.summary.bothAgentProposed, 1);
  assert.equal(report.summary.protocolControlAcceptanceRate, 1);
  assert.equal(report.summary.comparableAgentPairs, 2);
  assert.equal(report.summary.falseEquivalences, 1);
  assert.match(result.stdout, /openlunum-grounding-ladder-audit/);
});

test('grounding ladder rejects malformed evaluator-private input', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openlunum-grounding-ladder-invalid-'));
  const input = path.join(directory, 'input.json');
  await writeFile(input, JSON.stringify({ cases: [{ id: 'bad', relation: 'same', goldExternalId: 'ili:a', source: {}, target: {} }] }));
  await assert.rejects(run(process.execPath, [script], { env: { ...process.env, GROUNDING_LADDER_INPUT: input } }), /each side needs providerCandidates/u);
});
