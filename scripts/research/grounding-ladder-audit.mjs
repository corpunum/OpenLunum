#!/usr/bin/env node
/**
 * Development-only factorial grounding audit.
 *
 * Input is evaluator-private audit data. The extraction agent must never see
 * this file: it contains independently adjudicated external IDs. The utility
 * does not resolve, normalize, or vote on identities; it only separates:
 * provider candidate-set coverage, agent proposal behavior, and protocol
 * control acceptance.
 *
 * Input JSON:
 * { "cases": [{
 *   "id": "...", "relation": "same"|"different",
 *   "goldExternalId": "...",
 *   "source": { "providerCandidates": [], "agentCandidates": [], "agentSelected": null, "protocolControlAccepted": true },
 *   "target": { ... }
 * }] }
 */
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = process.env.GROUNDING_LADDER_INPUT;
const outputPath = process.env.GROUNDING_LADDER_OUTPUT;
if (!inputPath) throw new Error('GROUNDING_LADDER_INPUT is required');

const input = JSON.parse(await readFile(inputPath, 'utf8'));
if (!input || !Array.isArray(input.cases)) throw new TypeError('input.cases must be an array');

function sideMetrics(side, gold) {
  if (!side || typeof side !== 'object' || !Array.isArray(side.providerCandidates) || !Array.isArray(side.agentCandidates)) throw new TypeError('each side needs providerCandidates and agentCandidates arrays');
  const providerCovered = side.providerCandidates.includes(gold);
  const agentProposed = side.agentCandidates.includes(gold);
  const selected = side.agentSelected ?? null;
  return {
    providerCovered,
    agentProposed,
    providerStatus: providerCovered ? (side.providerCandidates.length === 1 ? 'unique' : 'ambiguous') : 'unresolved',
    agentStatus: selected === null ? 'abstain' : selected === gold ? 'correct' : 'wrong',
    agentWrongResolution: selected !== null && selected !== gold,
    protocolControlAccepted: side.protocolControlAccepted === true,
  };
}

const rows = input.cases.map((item, index) => {
  if (!item || typeof item.id !== 'string' || !item.id || (item.relation !== 'same' && item.relation !== 'different') || typeof item.goldExternalId !== 'string' || !item.goldExternalId) throw new TypeError(`invalid case at index ${index}`);
  const source = sideMetrics(item.source, item.goldExternalId);
  const target = sideMetrics(item.target, item.goldExternalId);
  const bothProviderCovered = source.providerCovered && target.providerCovered;
  const bothAgentProposed = source.agentProposed && target.agentProposed;
  const selected = [item.source.agentSelected ?? null, item.target.agentSelected ?? null];
  const comparableAgentPair = selected.every((value) => value !== null);
  const falseEquivalence = item.relation === 'different' && comparableAgentPair && selected[0] === selected[1];
  return { id: item.id, relation: item.relation, source, target, bothProviderCovered, bothAgentProposed, comparableAgentPair, falseEquivalence };
});

function rate(numerator, denominator) { return denominator > 0 ? numerator / denominator : null; }
const summary = {
  totalCases: rows.length,
  sameCases: rows.filter((row) => row.relation === 'same').length,
  differentCases: rows.filter((row) => row.relation === 'different').length,
  sourceProviderCoverage: rows.filter((row) => row.source.providerCovered).length,
  targetProviderCoverage: rows.filter((row) => row.target.providerCovered).length,
  bothProviderCovered: rows.filter((row) => row.bothProviderCovered).length,
  sourceAgentProposalRecall: rows.filter((row) => row.source.agentProposed).length,
  targetAgentProposalRecall: rows.filter((row) => row.target.agentProposed).length,
  bothAgentProposed: rows.filter((row) => row.bothAgentProposed).length,
  protocolControlAcceptedSides: rows.reduce((sum, row) => sum + Number(row.source.protocolControlAccepted) + Number(row.target.protocolControlAccepted), 0),
  protocolControlSides: rows.length * 2,
  agentWrongResolutions: rows.reduce((sum, row) => sum + Number(row.source.agentWrongResolution) + Number(row.target.agentWrongResolution), 0),
  agentAbstentions: rows.reduce((sum, row) => sum + Number(row.source.agentStatus === 'abstain') + Number(row.target.agentStatus === 'abstain'), 0),
  comparableAgentPairs: rows.filter((row) => row.comparableAgentPair).length,
  falseEquivalences: rows.filter((row) => row.falseEquivalence).length,
};
summary.protocolControlAcceptanceRate = rate(summary.protocolControlAcceptedSides, summary.protocolControlSides);
summary.falseEquivalenceRateAmongComparableDifferentPairs = rate(rows.filter((row) => row.relation === 'different' && row.comparableAgentPair && row.falseEquivalence).length, rows.filter((row) => row.relation === 'different' && row.comparableAgentPair).length);
summary.agentProposalRecallConditionalOnProviderCoverage = rate(rows.filter((row) => row.bothProviderCovered && row.bothAgentProposed).length, rows.filter((row) => row.bothProviderCovered).length);

const output = { type: 'openlunum-grounding-ladder-audit', version: 1, status: 'development-diagnostic', inputPath, summary, cases: rows, interpretation: 'This audit separates provider coverage, agent proposal behavior, and protocol control. It does not grant identity, expose gold to an extractor, or replace deterministic OpenLunum validation.' };
if (outputPath) await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
