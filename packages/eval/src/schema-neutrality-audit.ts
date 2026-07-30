import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findWorkspaceRoot, writeJson } from './io.js';

import {
  SEM_SCHEMA,
  SEM_SCHEMA_02,
  RECORD_SCHEMA,
  RECORD_SCHEMA_02,
  FP_VERSION,
  FP_VERSION_02,
  DEFAULT_RENDERER,
  WORLD_MARKERS,
  ROLE_ORDER,
  FROZEN_SCHEMAS,
} from '@corpunum/lunum';

export const AUDIT_VERSION = '0.1.0' as const;

export interface NeutralityFinding {
  id: string;
  category:
    | 'type-definitions'
    | 'constants'
    | 'function-signatures'
    | 'type-fields'
    | 'eligibility'
    | 'renderer-profile-schema';
  target: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface SchemaNeutralityAuditResult {
  schema: 'openlunum-neutrality-audit/0.1';
  version: typeof AUDIT_VERSION;
  findings: NeutralityFinding[];
  verdict: 'pass' | 'fail';
  sha: string;
}

export interface AuditOptions {
  coreDir?: string;
  outputPath?: string;
  saveResult?: boolean;
}

const PRODUCT_SPECIFIC_TERMS = [
  'slack',
  'jira',
  'salesforce',
  'hubspot',
  'zendesk',
  'notion',
  'trello',
  'linear',
  'shopify',
  'stripe',
  'figma',
  'chatgpt',
  'copilot',
  'bard',
  'bing',
  'alexa',
  'siri',
  'cortana',
];

/**
  * Programmatically evaluates the OpenLunum release candidate for schema neutrality
  * and product independence.
  */
export async function auditSchemaNeutrality(
  options: AuditOptions = {}
): Promise<SchemaNeutralityAuditResult> {
  const workspaceRoot = await findWorkspaceRoot();
  const coreDir = options.coreDir || path.join(workspaceRoot, 'packages/core/src');
  const outputPath =
    options.outputPath ||
    path.join(workspaceRoot, 'eval-results/neutrality/schema-neutrality-audit.json');
  const saveResult = options.saveResult ?? true;

  const findings: NeutralityFinding[] = [];

  // 1. Programmatically inspect packages/core/src/types.ts for product-specific strings
  try {
    const typesContent = await readFile(path.join(coreDir, 'types.ts'), 'utf8');
    const leakedTerms: string[] = [];

    // Extract core schema interfaces (LunumSem, LunumClause, LunumTerm, ExtendedLunumClause, LunumRecord, etc.)
    for (const term of PRODUCT_SPECIFIC_TERMS) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(typesContent)) {
        leakedTerms.push(term);
      }
    }

    const passed = leakedTerms.length === 0;
    findings.push({
      id: 'type-definitions-neutrality',
      category: 'type-definitions',
      target: 'packages/core/src/types.ts',
      passed,
      message: passed
        ? 'No product-specific strings found in core schema type definitions (LunumSem, LunumClause, LunumTerm).'
        : `Product-specific terms leaked into type definitions: ${leakedTerms.join(', ')}`,
      details: { leakedTerms },
    });
  } catch (err) {
    findings.push({
      id: 'type-definitions-neutrality',
      category: 'type-definitions',
      target: 'packages/core/src/types.ts',
      passed: false,
      message: `Failed to read types.ts: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 2. Programmatically inspect constants in packages/core/src/constants.ts
  try {
    const constantsContent = await readFile(path.join(coreDir, 'constants.ts'), 'utf8');
    const constantNames = [
      'SEM_SCHEMA',
      'SEM_SCHEMA_02',
      'RECORD_SCHEMA',
      'RECORD_SCHEMA_02',
      'FP_VERSION',
      'FP_VERSION_02',
      'DEFAULT_RENDERER',
      'WORLD_MARKERS',
      'ROLE_ORDER',
      'FROZEN_SCHEMAS',
    ];

    const missingConstants: string[] = [];
    const invalidNaming: string[] = [];

    for (const cName of constantNames) {
      if (!constantsContent.includes(cName)) {
        missingConstants.push(cName);
      }
      if (!/^[A-Z0-9_]+$/.test(cName)) {
        invalidNaming.push(cName);
      }
    }

    // Inspect values of exported constants for product terms
    const exportedConstantValues = [
      SEM_SCHEMA,
      SEM_SCHEMA_02,
      RECORD_SCHEMA,
      RECORD_SCHEMA_02,
      FP_VERSION,
      FP_VERSION_02,
      DEFAULT_RENDERER,
      ...Object.keys(WORLD_MARKERS),
      ...Object.values(WORLD_MARKERS),
      ...ROLE_ORDER,
      ...Array.from(FROZEN_SCHEMAS),
    ];

    const leakedInValues: string[] = [];
    for (const val of exportedConstantValues) {
      const valStr = String(val).toLowerCase();
      for (const term of PRODUCT_SPECIFIC_TERMS) {
        if (valStr.includes(term)) {
          leakedInValues.push(`${val} contains ${term}`);
        }
      }
    }

    const passed =
      missingConstants.length === 0 &&
      invalidNaming.length === 0 &&
      leakedInValues.length === 0;

    findings.push({
      id: 'schema-constants-naming',
      category: 'constants',
      target: 'packages/core/src/constants.ts',
      passed,
      message: passed
        ? 'Schema constants follow generic naming patterns and contain generic schema values.'
        : `Schema constants audit failed. Missing: [${missingConstants.join(', ')}], Invalid naming: [${invalidNaming.join(', ')}], Leaks: [${leakedInValues.join(', ')}]`,
      details: { missingConstants, invalidNaming, leakedInValues },
    });
  } catch (err) {
    findings.push({
      id: 'schema-constants-naming',
      category: 'constants',
      target: 'packages/core/src/constants.ts',
      passed: false,
      message: `Failed to verify constants: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 3. Programmatically inspect exported function signatures across packages/core/src/
  try {
    const indexContent = await readFile(path.join(coreDir, 'index.ts'), 'utf8');
    const policyContent = await readFile(path.join(coreDir, 'policy.ts'), 'utf8');
    const policyClassifierContent = await readFile(
      path.join(coreDir, 'policy-classifier.ts'),
      'utf8'
    );
    const rendererProfilesContent = await readFile(
      path.join(coreDir, 'model-renderer-profiles.ts'),
      'utf8'
    );

    const combinedCode =
      indexContent +
      '\n' +
      policyContent +
      '\n' +
      policyClassifierContent +
      '\n' +
      rendererProfilesContent;

    // Check exported function signatures for product concepts
    const leakedInSignatures: string[] = [];
    const exportedFnRegex = /export\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;

    let match: RegExpExecArray | null;
    while ((match = exportedFnRegex.exec(combinedCode)) !== null) {
      const fnName = match[1];
      const fnParams = match[2];
      const sig = `${fnName}(${fnParams})`;

      for (const term of PRODUCT_SPECIFIC_TERMS) {
        if (new RegExp(`\\b${term}\\b`, 'i').test(sig)) {
          leakedInSignatures.push(sig);
        }
      }
    }

    const passed = leakedInSignatures.length === 0;
    findings.push({
      id: 'exported-function-signatures-neutrality',
      category: 'function-signatures',
      target: 'packages/core/src/index.ts',
      passed,
      message: passed
        ? 'Exported function signatures do not reference product-specific concepts.'
        : `Product concepts found in function signatures: ${leakedInSignatures.join(', ')}`,
      details: { leakedInSignatures },
    });
  } catch (err) {
    findings.push({
      id: 'exported-function-signatures-neutrality',
      category: 'function-signatures',
      target: 'packages/core/src/index.ts',
      passed: false,
      message: `Failed to check function signatures: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 4. Programmatically inspect type fields for generic semantic names
  try {
    const typesContent = await readFile(path.join(coreDir, 'types.ts'), 'utf8');

    // Expected generic fields in core types
    const expectedGenericFields = [
      'schema',
      'world',
      'kind',
      'clauses',
      'references',
      'provenance',
      'annotations',
      'predicate',
      'roles',
      'negated',
      'modality',
      'time',
      'conditions',
      'consequences',
      'eligible',
      'category',
      'risk',
      'confidence',
      'reasons',
    ];

    const missingGenericFields: string[] = [];
    for (const field of expectedGenericFields) {
      if (!typesContent.includes(`${field}:`) && !typesContent.includes(`${field}?:`)) {
        missingGenericFields.push(field);
      }
    }

    const nonGenericFieldLeaks: string[] = [];
    for (const term of PRODUCT_SPECIFIC_TERMS) {
      // Look for properties like slackId, jiraKey, etc.
      const propertyRegex = new RegExp(`\\b[a-zA-Z]*${term}[a-zA-Z]*\\s*\\?:?`, 'i');
      if (propertyRegex.test(typesContent)) {
        nonGenericFieldLeaks.push(term);
      }
    }

    const passed = missingGenericFields.length === 0 && nonGenericFieldLeaks.length === 0;
    findings.push({
      id: 'type-fields-semantic-names',
      category: 'type-fields',
      target: 'packages/core/src/types.ts (LunumSem, LunumClause, LunumTerm)',
      passed,
      message: passed
        ? 'Type fields use generic semantic names rather than product-specific ones.'
        : `Type field neutrality check failed. Missing generic fields: [${missingGenericFields.join(', ')}], Product field leaks: [${nonGenericFieldLeaks.join(', ')}]`,
      details: { missingGenericFields, nonGenericFieldLeaks },
    });
  } catch (err) {
    findings.push({
      id: 'type-fields-semantic-names',
      category: 'type-fields',
      target: 'packages/core/src/types.ts',
      passed: false,
      message: `Failed to check type fields: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 5. Check eligibility/classification logic for structural decisions
  try {
    const policyContent = await readFile(path.join(coreDir, 'policy.ts'), 'utf8');
    const policyClassifierContent = await readFile(
      path.join(coreDir, 'policy-classifier.ts'),
      'utf8'
    );

    const combinedPolicy = policyContent + '\n' + policyClassifierContent;

    const structuralChecks = [
      'confidence',
      'risk',
      'category',
      'semantic',
      'ELIGIBLE_CATEGORIES',
    ];

    const missingStructuralChecks: string[] = [];
    for (const item of structuralChecks) {
      if (!combinedPolicy.includes(item)) {
        missingStructuralChecks.push(item);
      }
    }

    const hardcodedProductRules: string[] = [];
    for (const term of PRODUCT_SPECIFIC_TERMS) {
      if (new RegExp(`if\\s*\\(.*${term}.*\\)`, 'i').test(combinedPolicy)) {
        hardcodedProductRules.push(term);
      }
    }

    const passed =
      missingStructuralChecks.length === 0 && hardcodedProductRules.length === 0;

    findings.push({
      id: 'eligibility-logic-structural',
      category: 'eligibility',
      target: 'packages/core/src/policy.ts & policy-classifier.ts',
      passed,
      message: passed
        ? 'Eligibility decisions are based on structural properties (category, risk, confidence, semantics) rather than product-specific rules.'
        : `Eligibility logic check failed. Missing structural criteria: [${missingStructuralChecks.join(', ')}], Product-specific rules: [${hardcodedProductRules.join(', ')}]`,
      details: { missingStructuralChecks, hardcodedProductRules },
    });
  } catch (err) {
    findings.push({
      id: 'eligibility-logic-structural',
      category: 'eligibility',
      target: 'packages/core/src/policy.ts',
      passed: false,
      message: `Failed to check eligibility logic: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 6. Check renderer profile schema for generic structure
  try {
    const rendererProfilesContent = await readFile(
      path.join(coreDir, 'model-renderer-profiles.ts'),
      'utf8'
    );

    const requiredGenericSchemaFields = [
      'family',
      'displayName',
      'identity',
      'acceptedProfiles',
      'defaultProfile',
      'tokenizer',
    ];

    const missingProfileSchemaFields: string[] = [];
    for (const field of requiredGenericSchemaFields) {
      if (!rendererProfilesContent.includes(`${field}:`)) {
        missingProfileSchemaFields.push(field);
      }
    }

    const passed = missingProfileSchemaFields.length === 0;
    findings.push({
      id: 'renderer-profile-schema-generic',
      category: 'renderer-profile-schema',
      target: 'packages/core/src/model-renderer-profiles.ts',
      passed,
      message: passed
        ? 'Renderer profile schema (AcceptedRendererProfile) is generic and model-agnostic.'
        : `Renderer profile schema check failed. Missing generic fields: [${missingProfileSchemaFields.join(', ')}]`,
      details: { missingProfileSchemaFields },
    });
  } catch (err) {
    findings.push({
      id: 'renderer-profile-schema-generic',
      category: 'renderer-profile-schema',
      target: 'packages/core/src/model-renderer-profiles.ts',
      passed: false,
      message: `Failed to check renderer profile schema: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const verdict: 'pass' | 'fail' = findings.every((f) => f.passed) ? 'pass' : 'fail';

  const reportWithoutSha = {
    schema: 'openlunum-neutrality-audit/0.1' as const,
    version: AUDIT_VERSION,
    findings,
    verdict,
  };

  const sha = createHash('sha256')
    .update(JSON.stringify(reportWithoutSha), 'utf8')
    .digest('hex');

  const result: SchemaNeutralityAuditResult = {
    ...reportWithoutSha,
    sha,
  };

  if (saveResult) {
    await writeJson(outputPath, result);
  }

  return result;
}
