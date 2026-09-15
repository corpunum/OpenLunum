#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function jsonFromToolContent(content) {
  const text = Array.isArray(content) ? content.find((part) => part?.type === 'text')?.text : content;
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { return null; }
}

function codexCalls(events) {
  const calls = new Map();
  for (const event of events) {
    const item = event?.item;
    if (item?.type !== 'mcp_tool_call' || !item.id) continue;
    const call = calls.get(item.id) ?? { id: item.id, tool: item.tool, events: [] };
    call.events.push({ type: event.type, status: item.status ?? null });
    if (['completed', 'failed', 'cancelled'].includes(item.status)) {
      if (call.completed && JSON.stringify(call.completed) !== JSON.stringify(item)) call.conflict = true;
      call.completed = item;
    } else if (!call.started) call.started = item;
    calls.set(item.id, call);
  }
  return [...calls.values()];
}

function claudeCalls(events) {
  const calls = new Map();
  for (const event of events) {
    for (const block of event?.message?.content ?? []) {
      if (block?.type === 'tool_use' && block.id) {
        const tool = block.name?.split('__').at(-1) ?? block.name;
        const call = calls.get(block.id) ?? { id: block.id, tool, events: [] };
        call.tool = tool;
        call.use = block;
        call.events.push({ type: 'tool_use' });
        calls.set(block.id, call);
      } else if (block?.type === 'tool_result' && block.tool_use_id) {
        const call = calls.get(block.tool_use_id) ?? { id: block.tool_use_id, events: [] };
        call.result = block;
        call.events.push({ type: 'tool_result', isError: Boolean(block.is_error) });
        calls.set(block.tool_use_id, call);
      }
    }
  }
  return [...calls.values()];
}

export function replaySession(events, request, oldEntry = null) {
  const provider = events.some((event) => event?.item?.type === 'mcp_tool_call') ? 'codex' : 'claude';
  const calls = provider === 'codex' ? codexCalls(events) : claudeCalls(events);
  const relevant = calls.filter((call) => call.tool === 'lunum_build_candidate' || call.tool === 'lunum_submit_candidate');
  const builds = relevant.filter((call) => call.tool === 'lunum_build_candidate');
  const submissions = relevant.filter((call) => call.tool === 'lunum_submit_candidate');
  const submission = submissions.at(-1) ?? null;
  const input = submission?.completed?.arguments ?? submission?.use?.input ?? {};
  const candidate = Object.hasOwn(input, 'candidateSem') ? input.candidateSem : undefined;
  const explicitNull = candidate === null;
  const nonNull = candidate !== null && candidate !== undefined;
  const result = jsonFromToolContent(submission?.completed?.result?.content ?? submission?.result?.content);
  const builderResults = builds.map((call) => jsonFromToolContent(call.completed?.result?.content ?? call.result?.content)).filter(Boolean);
  const returnedSubmission = result?.submission ?? null;
  const actualSource = input.sourceText ?? returnedSubmission?.source?.text ?? null;
  const actualHash = actualSource === null ? null : sha256(actualSource);
  const expectedHash = request?.sourceSha256 ?? null;
  const builderFailure = builds.some((call, index) => call.completed?.status === 'failed' || call.completed?.error || call.result?.is_error || builderResults[index]?.success === false);
  const execution = submissions.length === 0 ? 'missing' : submission?.completed || submission?.result ? 'completed' : 'missing';
  const validation = nonNull
    ? (returnedSubmission?.sem ? 'accepted' : (returnedSubmission ? 'rejected' : 'not-reached'))
    : 'not-reached';
  const action = nonNull ? 'non-null-submission' : explicitNull ? 'explicit-null' : 'no-submission';
  return {
    handle: request?.handle ?? null,
    provider,
    eventIds: calls.map((call) => call.id),
    submissionEventId: submission?.id ?? null,
    builderEventIds: builds.map((call) => call.id),
    duplicateOrConflictingEvents: calls.filter((call) => call.conflict).map((call) => call.id),
    requestedSource: { text: request?.sourceText ?? null, sha256: expectedHash },
    submittedSource: { text: actualSource, sha256: actualHash },
    sourceBinding: { expectedSha256: expectedHash, actualSha256: actualHash, matched: expectedHash !== null && actualHash === expectedHash },
    proposedCandidateSem: nonNull ? candidate : null,
    explicitNullSubmission: explicitNull,
    returnedAcceptedSem: returnedSubmission?.sem ?? null,
    serverResponse: result,
    builderResponses: builderResults,
    agentAction: action,
    execution: builderFailure && explicitNull ? 'completed-after-builder-failure' : execution,
    validation,
    fallback: builderFailure && explicitNull ? 'after-builder-failure' : null,
    diagnostics: [
      ...(submission && !result ? ['submission_result_missing_or_unparseable'] : []),
      ...(expectedHash !== null && actualHash !== null && expectedHash !== actualHash ? ['submitted_source_hash_mismatch'] : []),
      ...(calls.some((call) => call.conflict) ? ['conflicting_duplicate_events'] : [])
    ],
    oldClassification: oldEntry?.status ?? null
  };
}

function readJsonLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`invalid_jsonl:${file}:${index + 1}`); }
  });
}

export function replayV3(rawRoot, evidenceRoot, outputRoot) {
  const requests = readJsonLines(path.join(evidenceRoot, 'source-only-request.jsonl'));
  const requestByHandle = new Map(requests.map((request) => [request.handle, request]));
  const rows = [];
  for (const provider of ['codex', 'claude']) {
    const oldPath = path.join(evidenceRoot, `${provider}-candidate-ledger.jsonl`);
    const old = fs.existsSync(oldPath) ? new Map(readJsonLines(oldPath).map((entry) => [entry.handle, entry])) : new Map();
    for (const file of fs.readdirSync(path.join(rawRoot, provider)).filter((name) => name.endsWith('.jsonl')).sort()) {
      const handle = file.slice(0, -'.jsonl'.length);
      const request = requestByHandle.get(handle);
      if (!request) throw new Error(`unknown_session_handle:${provider}:${handle}`);
      rows.push(replaySession(readJsonLines(path.join(rawRoot, provider, file)), request, old.get(handle)));
    }
  }
  const summary = {
    sessions: rows.length,
    byProvider: Object.fromEntries(['codex', 'claude'].map((provider) => {
      const selected = rows.filter((row) => row.provider === provider);
      return [provider, {
        sessions: selected.length,
        nonNullSubmissions: selected.filter((row) => row.agentAction === 'non-null-submission').length,
        explicitNullSubmissions: selected.filter((row) => row.agentAction === 'explicit-null').length,
        noSubmission: selected.filter((row) => row.agentAction === 'no-submission').length,
        accepted: selected.filter((row) => row.validation === 'accepted').length,
        rejected: selected.filter((row) => row.validation === 'rejected').length,
        sourceMismatches: selected.filter((row) => row.sourceBinding.matched === false).length,
        builderFallbacks: selected.filter((row) => row.fallback).length
      }];
    }))
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'replay-ledger.json'), JSON.stringify({ schema: 'openlunum-client-event-replay/0.1', inputs: { rawRoot, evidenceRoot }, summary, rows }, null, 2) + '\n', { flag: 'wx' });
  return { summary, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rawRoot = process.argv[2] ?? 'reports/diagnostic/2026-09-15/raw-v3';
  const evidenceRoot = process.argv[3] ?? 'reports/diagnostic/2026-09-15/client-run-v3';
  const outputRoot = process.argv[4] ?? 'reports/diagnostic/2026-09-15/replay-v1';
  console.log(JSON.stringify(replayV3(rawRoot, evidenceRoot, outputRoot), null, 2));
}
