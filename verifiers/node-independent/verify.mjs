import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const SEM_SCHEMA = 'lunum-sem/0.1-draft';
const FP_VERSION = '0.1';

function normalizeIdentifier(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, '_').toLocaleLowerCase('und');
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalUnknown(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(canonicalUnknown);
  if (!isObject(value)) return String(value);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) continue;
    if (key === 'id' || key === 'type' || key === 'ref' || key === 'language') {
      out[key] = normalizeIdentifier(item);
    } else if (key === 'value' && typeof item === 'string') {
      out[key] = normalizeText(item);
    } else {
      out[key] = canonicalUnknown(item);
    }
  }
  return out;
}

function canonicalTerm(term) {
  return canonicalUnknown(term);
}

function canonicalClause(clause) {
  const roles = {};
  const rawRoles = clause.roles ?? {};
  for (const key of Object.keys(rawRoles).sort()) {
    const item = rawRoles[key];
    if (item === undefined) continue;
    roles[normalizeIdentifier(key)] = canonicalTerm(item);
  }
  const out = {
    predicate: normalizeIdentifier(clause.predicate),
    roles,
    negated: clause.negated === true
  };
  if (clause.modality != null) out.modality = normalizeIdentifier(clause.modality);
  if (clause.time != null) out.time = canonicalTerm(clause.time);
  if (clause.conditions?.length) out.conditions = clause.conditions.map(canonicalClause);
  if (clause.consequences?.length) out.consequences = clause.consequences.map(canonicalClause);
  if (clause.annotations && Object.keys(clause.annotations).length) {
    out.annotations = canonicalUnknown(clause.annotations);
  }
  return out;
}

function validateSem(value) {
  const errors = [];
  if (!isObject(value)) return { ok: false, errors: ['sem must be an object'] };
  if (value.schema !== SEM_SCHEMA) errors.push(`schema must equal ${SEM_SCHEMA}`);
  if (!String(value.world ?? '').trim()) errors.push('world is required');
  if (!String(value.kind ?? '').trim()) errors.push('kind is required');
  if (!Array.isArray(value.clauses) || value.clauses.length === 0) errors.push('clauses must be a non-empty array');
  for (const [index, rawClause] of (Array.isArray(value.clauses) ? value.clauses : []).entries()) {
    if (!isObject(rawClause)) { errors.push(`clauses[${index}] must be an object`); continue; }
    if (!String(rawClause.predicate ?? '').trim()) errors.push(`clauses[${index}].predicate is required`);
    if (!isObject(rawClause.roles)) errors.push(`clauses[${index}].roles must be an object`);
  }
  return { ok: errors.length === 0, errors };
}

function canonicalizeSem(value) {
  const validation = validateSem(value);
  if (!validation.ok) throw new TypeError(`Invalid Lunum-Sem: ${validation.errors.join('; ')}`);
  const sem = value;
  const out = {
    schema: SEM_SCHEMA,
    world: normalizeIdentifier(sem.world),
    kind: normalizeIdentifier(sem.kind),
    clauses: sem.clauses.map(canonicalClause)
  };
  if (sem.references?.length) out.references = sem.references.map(canonicalTerm);
  if (sem.provenance && Object.keys(sem.provenance).length) out.provenance = canonicalUnknown(sem.provenance);
  if (sem.annotations && Object.keys(sem.annotations).length) out.annotations = canonicalUnknown(sem.annotations);
  return out;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value;
  const entries = Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${entries.join(',')}}`;
}

function boundedLength(length) {
  return Math.max(16, Math.min(64, Math.trunc(length)));
}

function fingerprintSem(sem, options = {}) {
  const canonical = canonicalizeSem(sem);
  const digest = crypto.createHash('sha256').update(stableStringify(canonical)).digest('hex');
  return `lfp:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 32))}`;
}

function surfaceFingerprint(text, options = {}) {
  const normalized = String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return `lsf:${FP_VERSION}:sha256:${digest.slice(0, boundedLength(options.length ?? 24))}`;
}

function verifyGoldenVectors(bundlePath) {
  const rawData = fs.readFileSync(bundlePath, 'utf-8');
  const bundle = JSON.parse(rawData);

  const vectors = bundle.vectors ?? [];
  const discrepancies = [];
  const failIds = new Set();

  for (const v of vectors) {
    const vecId = v.id;
    const inp = v.input;
    const expectedBytes = v.canonicalBytes;
    const expectedSha = v.canonicalSha256;
    const expectedFp = v.fingerprint;

    try {
      const canonical = canonicalizeSem(inp);
      const actualBytes = stableStringify(canonical);
      const actualSha = crypto.createHash('sha256').update(actualBytes).digest('hex');
      const actualFp = fingerprintSem(inp);

      if (actualBytes !== expectedBytes) {
        discrepancies.push({
          vectorId: vecId,
          field: 'canonicalBytes',
          expected: expectedBytes,
          actual: actualBytes,
        });
        failIds.add(vecId);
      }

      if (actualSha !== expectedSha) {
        discrepancies.push({
          vectorId: vecId,
          field: 'canonicalSha256',
          expected: expectedSha,
          actual: actualSha,
        });
        failIds.add(vecId);
      }

      if (actualFp !== expectedFp) {
        discrepancies.push({
          vectorId: vecId,
          field: 'fingerprint',
          expected: expectedFp,
          actual: actualFp,
        });
        failIds.add(vecId);
      }

      if ('surfaceText' in v && 'surfaceFingerprint' in v) {
        const actualSfp = surfaceFingerprint(v.surfaceText);
        if (actualSfp !== v.surfaceFingerprint) {
          discrepancies.push({
            vectorId: vecId,
            field: 'surfaceFingerprint',
            expected: v.surfaceFingerprint,
            actual: actualSfp,
          });
          failIds.add(vecId);
        }
      }
    } catch (e) {
      discrepancies.push({
        vectorId: vecId,
        field: 'canonicalBytes',
        expected: expectedBytes,
        actual: `ERROR: ${e.message}`,
      });
      failIds.add(vecId);
    }
  }

  const passCount = vectors.length - failIds.size;

  return {
    schema: 'openlunum-verifier-result/0.1',
    version: '0.1.0',
    verifiedAt: new Date().toISOString(),
    totalVectors: vectors.length,
    passCount,
    failCount: failIds.size,
    discrepancies,
  };
}

function main() {
  const argPath = process.argv[2];
  const bundlePath = argPath
    ? path.resolve(process.cwd(), argPath)
    : path.resolve(projectRoot, 'eval-results/golden-vectors/golden-vectors.json');

  console.log(`Verifying golden vectors from: ${bundlePath}`);
  const result = verifyGoldenVectors(bundlePath);

  console.log(`Total vectors: ${result.totalVectors}`);
  console.log(`Pass: ${result.passCount}`);
  console.log(`Fail: ${result.failCount}`);

  if (result.discrepancies.length > 0) {
    console.log('\nDiscrepancies found:');
    for (const d of result.discrepancies) {
      console.log(`  [${d.vectorId}] ${d.field}:`);
      console.log(`    expected: ${d.expected.slice(0, 100)}`);
      console.log(`    actual:   ${d.actual.slice(0, 100)}`);
    }
  }

  const outPath = path.resolve(__dirname, 'replication-result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`Results written to ${outPath}`);

  if (result.failCount > 0) {
    process.exit(1);
  }
}

main();
