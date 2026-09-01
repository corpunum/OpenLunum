/**
 * Strict, read-only classification for evaluation evidence bundles.
 *
 * A passing unit test or an internally consistent report is not, by itself,
 * empirical evidence.  In particular, a live-model claim is invalid unless
 * the artefact records the code that ran, the actual model identity, prompt
 * provenance, dataset integrity, and raw responses.
 *
 * This module deliberately does not rewrite historical evidence.  It emits a
 * separate manifest so old reports remain inspectable while callers can keep
 * them out of current empirical claims.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const EVIDENCE_VALIDITY_SCHEMA = 'openlunum-evidence-validity/0.1';
export const PARSE_SYSTEM_PROMPT_FIX_COMMIT = 'd8f89e1333c748564dd6ba122d04798158bbde8f';

export type EvidenceValidity = 'VALID_EMPIRICAL' | 'DETERMINISTIC_ONLY' | 'INVALID_EMPIRICAL';
export type EvidenceIssueCode =
  | 'missing_summary'
  | 'missing_environment'
  | 'missing_raw_outputs'
  | 'empty_raw_output'
  | 'dataset_not_found'
  | 'dataset_hash_mismatch'
  | 'missing_execution_commit'
  | 'unknown_execution_commit'
  | 'missing_prompt_provenance'
  | 'placeholder_model_id'
  | 'missing_runtime_model_id'
  | 'unverified_model_identity'
  | 'reported_baseline_predates_prompt_fix'
  | 'heldout_dataset_is_repo_visible';

export interface EvidenceIssue {
  code: EvidenceIssueCode;
  message: string;
}

export interface EvidenceRunValidity {
  reportDirectory: string;
  manifestPath: string;
  manifestId: string | null;
  task: string | null;
  modelDriven: boolean;
  validity: EvidenceValidity;
  issues: EvidenceIssue[];
  checkedDatasets: Array<{ path: string; declaredSha256: string; actualSha256: string | null; valid: boolean }>;
  rawOutputFiles: string[];
}

export interface EvidenceValidityManifest {
  schema: typeof EVIDENCE_VALIDITY_SCHEMA;
  generatedAt: string;
  repositoryCommit: string | null;
  criteria: {
    liveModelRequires: string[];
    deterministicInterpretation: string;
  };
  globalFindings: EvidenceIssue[];
  totals: Record<EvidenceValidity, number>;
  runs: EvidenceRunValidity[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringAt(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === 'string' && value[key].trim() ? value[key] : null;
}

function sha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function readJson(file: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function walk(root: string, filename: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...await walk(candidate, filename));
    else if (entry.isFile() && entry.name === filename) found.push(candidate);
  }
  return found;
}

function gitCommitExists(repoRoot: string, commit: string): boolean {
  if (!/^[0-9a-f]{7,40}$/u.test(commit)) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isAncestor(repoRoot: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findDeclaredDatasets(value: unknown, results: Array<{ path: string; sha256: string }>): void {
  if (Array.isArray(value)) {
    for (const item of value) findDeclaredDatasets(item, results);
    return;
  }
  if (!isRecord(value)) return;
  const datasetPath = stringAt(value, 'path');
  const datasetSha256 = stringAt(value, 'sha256');
  if (datasetPath && datasetSha256 && /^[a-f0-9]{64}$/u.test(datasetSha256)) {
    results.push({ path: datasetPath, sha256: datasetSha256 });
  }
  for (const child of Object.values(value)) findDeclaredDatasets(child, results);
}

function hasPlaceholderModel(value: unknown): boolean {
  if (typeof value === 'string') return /replace-with|placeholder|your[-_ ]model/u.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholderModel);
  return isRecord(value) && Object.values(value).some(hasPlaceholderModel);
}

function sha256Like(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

async function resultFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // A historical manifest may point at an output directory that was never
    // materialized or has since been pruned. That is invalid evidence, not an
    // evaluator crash.
    return [];
  }
  const direct = entries
    .filter((entry) => entry.isFile() && (entry.name === 'item-results.jsonl' || entry.name === 'items.jsonl' || /^parse-results-[a-z]+\.jsonl$/u.test(entry.name)))
    .map((entry) => path.join(directory, entry.name));
  const rawDirectory = path.join(directory, 'raw');
  try {
    const rawItems = await stat(path.join(rawDirectory, 'items.jsonl'));
    if (rawItems.isFile()) direct.push(path.join(rawDirectory, 'items.jsonl'));
  } catch {
    // Not every runner uses a nested raw/ directory.
  }
  return direct;
}

async function rawOutputComplete(files: string[]): Promise<boolean> {
  let sawModelResult = false;
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/u).filter((line) => line.trim());
    for (const line of lines) {
      try {
        const item: unknown = JSON.parse(line);
        if (!isRecord(item)) continue;
        const status = stringAt(item, 'status');
        if (status === 'error' || status === 'aborted') continue;
        sawModelResult = true;
        if (!stringAt(item, 'rawOutput')) return false;
      } catch {
        return false;
      }
    }
  }
  return sawModelResult;
}

function runtimeModelId(environment: JsonRecord | null, manifest: JsonRecord): string | null {
  const profile = environment?.modelProfile;
  if (isRecord(profile)) return stringAt(profile, 'model');
  // intendedModelId is a planning assertion, not runtime attestation.  It is
  // purposely not accepted as a runtime identity.
  return null;
}

function hasVerifiedModelIdentity(environment: JsonRecord | null, actualModelId: string | null): boolean {
  const identity = environment?.modelIdentity;
  if (!isRecord(identity) || identity.verified !== true) return false;
  return stringAt(identity, 'reportedModelId') === actualModelId
    && stringAt(identity, 'endpoint') !== null
    && sha256Like(identity.weightsSha256);
}

function hasPromptProvenance(summary: JsonRecord | null, environment: JsonRecord | null): boolean {
  const prompt = environment?.prompt;
  if (isRecord(prompt) && typeof prompt.version === 'string' && sha256Like(prompt.systemSha256)) return true;
  return sha256Like(summary?.systemPromptSha256) && typeof summary?.promptVersion === 'string';
}

function executionCommit(environment: JsonRecord | null): string | null {
  return stringAt(environment, 'codeCommit');
}

export async function auditEvidenceRun(repoRoot: string, manifestPath: string): Promise<EvidenceRunValidity> {
  const reportDirectory = path.dirname(manifestPath);
  const manifest = await readJson(manifestPath);
  const environment = await readJson(path.join(reportDirectory, 'environment.json'));
  const summary = await readJson(path.join(reportDirectory, 'summary.json'))
    ?? await readJson(path.join(reportDirectory, 'parse-summary.json'));
  const issues: EvidenceIssue[] = [];
  const declaredDatasets: Array<{ path: string; sha256: string }> = [];
  if (manifest) findDeclaredDatasets(manifest, declaredDatasets);
  const checkedDatasets: EvidenceRunValidity['checkedDatasets'] = [];

  for (const dataset of declaredDatasets) {
    const datasetPath = path.resolve(repoRoot, dataset.path);
    try {
      const actualSha256 = sha256(await readFile(datasetPath));
      const valid = actualSha256 === dataset.sha256;
      checkedDatasets.push({ path: dataset.path, declaredSha256: dataset.sha256, actualSha256, valid });
      if (!valid) issues.push({ code: 'dataset_hash_mismatch', message: `${dataset.path} hash does not match its manifest.` });
    } catch {
      checkedDatasets.push({ path: dataset.path, declaredSha256: dataset.sha256, actualSha256: null, valid: false });
      issues.push({ code: 'dataset_not_found', message: `${dataset.path} is not available for hash verification.` });
    }
  }

  const rawOutputFiles = await resultFiles(reportDirectory);
  if (!summary) issues.push({ code: 'missing_summary', message: 'No summary.json or parse-summary.json is present.' });
  if (!environment) issues.push({ code: 'missing_environment', message: 'No environment.json is present.' });
  if (rawOutputFiles.length === 0) issues.push({ code: 'missing_raw_outputs', message: 'No per-item raw-output JSONL is present.' });
  else if (!await rawOutputComplete(rawOutputFiles)) issues.push({ code: 'empty_raw_output', message: 'Raw per-item output is absent, empty, or malformed.' });

  const modelDriven = manifest?.deterministic !== true;
  if (modelDriven) {
    if (hasPlaceholderModel(environment) || hasPlaceholderModel(manifest)) {
      issues.push({ code: 'placeholder_model_id', message: 'The run names a placeholder rather than a real model ID.' });
    }
    const actualModelId = runtimeModelId(environment, manifest ?? {});
    if (!actualModelId) issues.push({ code: 'missing_runtime_model_id', message: 'environment.json does not attest the runtime model ID.' });
    if (!hasVerifiedModelIdentity(environment, actualModelId)) {
      issues.push({ code: 'unverified_model_identity', message: 'No verified endpoint-reported model identity and weights hash are recorded.' });
    }
    if (!hasPromptProvenance(summary, environment)) {
      issues.push({ code: 'missing_prompt_provenance', message: 'Prompt version and system-prompt SHA-256 are not both recorded.' });
    }
    const commit = executionCommit(environment);
    if (!commit) issues.push({ code: 'missing_execution_commit', message: 'baselineCommit is not execution provenance; environment.json lacks codeCommit.' });
    else if (!gitCommitExists(repoRoot, commit)) issues.push({ code: 'unknown_execution_commit', message: `Recorded execution commit ${commit} is not present in this repository.` });

    const baseline = stringAt(manifest, 'baselineCommit');
    if (manifest?.task === 'parse' && baseline && gitCommitExists(repoRoot, baseline)
      && !isAncestor(repoRoot, PARSE_SYSTEM_PROMPT_FIX_COMMIT, baseline)) {
      issues.push({ code: 'reported_baseline_predates_prompt_fix', message: 'The reported baseline predates the parse system-prompt runner fix; it cannot establish which system prompt actually ran.' });
    }
  }

  const validity: EvidenceValidity = modelDriven
    ? (issues.length === 0 ? 'VALID_EMPIRICAL' : 'INVALID_EMPIRICAL')
    : 'DETERMINISTIC_ONLY';
  return {
    reportDirectory: path.relative(repoRoot, reportDirectory),
    manifestPath: path.relative(repoRoot, manifestPath),
    manifestId: stringAt(manifest, 'id'),
    task: stringAt(manifest, 'task'),
    modelDriven,
    validity,
    issues,
    checkedDatasets,
    rawOutputFiles: rawOutputFiles.map((file) => path.relative(repoRoot, file))
  };
}

async function findVisibleHeldoutDatasets(repoRoot: string): Promise<EvidenceIssue[]> {
  const devDir = path.join(repoRoot, 'datasets', 'dev');
  try {
    const entries = await readdir(devDir);
    return entries.filter((entry) => /heldout|holdout|protected/u.test(entry)).map((entry) => ({
      code: 'heldout_dataset_is_repo_visible',
      message: `datasets/dev/${entry} is plaintext and visible to development agents; it cannot support a protected-set generalization claim.`
    }));
  } catch {
    return [];
  }
}

function repositoryCommit(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export async function buildEvidenceValidityManifest(repoRoot: string, reportsDirectory = path.join(repoRoot, 'reports')): Promise<EvidenceValidityManifest> {
  const manifests = await walk(reportsDirectory, 'manifest.snapshot.json');
  const runs = await Promise.all(manifests.sort().map((manifestPath) => auditEvidenceRun(repoRoot, manifestPath)));
  const totals: Record<EvidenceValidity, number> = {
    VALID_EMPIRICAL: 0,
    DETERMINISTIC_ONLY: 0,
    INVALID_EMPIRICAL: 0
  };
  for (const run of runs) totals[run.validity] += 1;
  return {
    schema: EVIDENCE_VALIDITY_SCHEMA,
    generatedAt: new Date().toISOString(),
    repositoryCommit: repositoryCommit(repoRoot),
    criteria: {
      liveModelRequires: [
        'hash-verified dataset(s)',
        'execution code commit present in repository',
        'prompt version and system-prompt SHA-256',
        'runtime-attested model ID',
        'verified endpoint model identity with weights SHA-256',
        'non-empty per-item raw outputs'
      ],
      deterministicInterpretation: 'Useful for regression only; not evidence of model-mediated or end-to-end behavior.'
    },
    globalFindings: await findVisibleHeldoutDatasets(repoRoot),
    totals,
    runs
  };
}

export async function writeEvidenceValidityManifest(outputFile: string, manifest: EvidenceValidityManifest): Promise<void> {
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
