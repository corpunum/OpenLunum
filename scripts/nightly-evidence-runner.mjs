#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseAssignment(content) {
  if (!content || typeof content !== 'string') return null;
  const fields = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }
  return fields;
}

export function validateAssignment(assignmentPath) {
  if (!assignmentPath || !fs.existsSync(assignmentPath)) {
    return { valid: false, reason: 'No explicit worker assignment file found' };
  }

  const content = fs.readFileSync(assignmentPath, 'utf8');
  const parsed = parseAssignment(content);
  if (!parsed) {
    return { valid: false, reason: 'Failed to parse worker assignment' };
  }

  const required = ['assignment_id', 'issue', 'worker', 'branch', 'tier'];
  for (const field of required) {
    if (!parsed[field]) {
      return { valid: false, reason: `Assignment missing required field: ${field}` };
    }
  }

  return { valid: true, assignment: parsed };
}

export function validateManifest(manifestPath, repoRoot = process.cwd()) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { valid: false, reason: `Manifest file not found: ${manifestPath}` };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { valid: false, reason: `Invalid JSON in manifest: ${err.message}` };
  }

  if (!manifest.baselineCommit || typeof manifest.baselineCommit !== 'string') {
    return { valid: false, reason: 'Manifest missing required baselineCommit binding' };
  }

  if (manifest.modelProfile) {
    const profilePath = path.isAbsolute(manifest.modelProfile)
      ? manifest.modelProfile
      : path.join(repoRoot, manifest.modelProfile);

    if (manifest.modelProfile.includes('.example.') || !fs.existsSync(profilePath)) {
      return { valid: false, reason: `Manifest references example or missing modelProfile: ${manifest.modelProfile}` };
    }

    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      if (!profile.model || profile.model === 'replace-with-server-model-id' || profile.model.includes('example')) {
        return { valid: false, reason: `Model profile ${manifest.modelProfile} contains placeholder model ID: ${profile.model}` };
      }
    } catch (err) {
      return { valid: false, reason: `Failed to read model profile ${manifest.modelProfile}: ${err.message}` };
    }
  }

  if (manifest.dataset) {
    const datasetPath = path.isAbsolute(manifest.dataset.path)
      ? manifest.dataset.path
      : path.join(repoRoot, manifest.dataset.path);

    if (!fs.existsSync(datasetPath)) {
      return { valid: false, reason: `Dataset file not found: ${manifest.dataset.path}` };
    }

    if (manifest.dataset.sha256) {
      const fileBuffer = fs.readFileSync(datasetPath);
      const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (actualHash !== manifest.dataset.sha256) {
        return {
          valid: false,
          reason: `Dataset SHA-256 mismatch for ${manifest.dataset.path}: expected ${manifest.dataset.sha256}, got ${actualHash}`,
        };
      }
    }
  }

  return { valid: true, manifest };
}

export function executeNightlyCycle(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const assignmentPath = options.assignmentPath || path.join(repoRoot, 'reports/orchestrator/WORKER_ASSIGNMENT.md');

  const assignmentResult = validateAssignment(assignmentPath);
  if (!assignmentResult.valid) {
    return {
      status: 'IDLE',
      reason: assignmentResult.reason,
      modelCalls: 0,
      githubWrites: 0,
      repoMutations: 0,
      executedManifests: [],
    };
  }

  const experimentsDir = options.experimentsDir || path.join(repoRoot, 'experiments');
  if (!fs.existsSync(experimentsDir)) {
    return {
      status: 'IDLE',
      reason: 'No experiments directory found',
      modelCalls: 0,
      githubWrites: 0,
      repoMutations: 0,
      executedManifests: [],
    };
  }

  const manifestFiles = fs.readdirSync(experimentsDir)
    .map((dir) => path.join(experimentsDir, dir, 'experiment.json'))
    .filter((f) => fs.existsSync(f));

  const validManifests = [];
  const rejectedManifests = [];

  for (const manifestFile of manifestFiles) {
    const validation = validateManifest(manifestFile, repoRoot);
    if (validation.valid) {
      validManifests.push({ file: manifestFile, manifest: validation.manifest });
    } else {
      rejectedManifests.push({ file: manifestFile, reason: validation.reason });
    }
  }

  return {
    status: validManifests.length > 0 ? 'ASSIGNED_RUN' : 'NO_VALID_MANIFESTS',
    assignment: assignmentResult.assignment,
    modelCalls: 0,
    githubWrites: 0,
    repoMutations: 0,
    validManifests,
    rejectedManifests,
  };
}

if (process.argv[1] && process.argv[1].endsWith('nightly-evidence-runner.mjs')) {
  const result = executeNightlyCycle();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'IDLE') {
    process.exit(0);
  }
}
