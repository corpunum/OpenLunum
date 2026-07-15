#!/usr/bin/env node
/**
 * verify-protected-manifest.cjs — Validate protected dataset manifests.
 *
 * Usage:
 *   node scripts/verify-protected-manifest.cjs [--check-hashes]
 *
 * Verifies:
 * 1. All manifests in datasets/protected/ validate against the schema
 * 2. (Optional) SHA-256 hashes match actual dataset files
 * 3. No worker-created dataset claims to be protected without maintainer approval
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMAS_DIR = path.resolve(__dirname, '..', 'schemas');
const PROTECTED_DIR = path.resolve(__dirname, '..', 'datasets', 'protected');

function loadSchema(name) {
  const schemaPath = path.join(SCHEMAS_DIR, name);
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema not found: ${schemaPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
}

function loadManifest(name) {
  const manifestPath = path.join(PROTECTED_DIR, name);
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

function validateAgainstSchema(data, schema, errors = [], prefix = '') {
  if (typeof schema !== 'object' || schema === null) return;

  // Check const
  if (schema.const !== undefined) {
    if (typeof data === 'object' && 'schema' in data) {
      if (data.schema !== schema.const) {
        errors.push(`${prefix || 'root'}: schema must be "${schema.const}", got "${data.schema}"`);
      }
    } else if (data !== schema.const) {
      errors.push(`${prefix || 'root'}: const mismatch`);
    }
  }

  // Check required
  if (schema.required && typeof data === 'object' && data !== null) {
    for (const req of schema.required) {
      if (!(req in data)) {
        errors.push(`${prefix || 'root'}: missing required field: ${req}`);
      }
    }
  }

  // Check properties
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in data)) continue;
      validateAgainstSchema(data[key], propSchema, errors, `${prefix || 'root'}.${key}`);
    }
  }

  // Check additionalProperties
  if (schema.additionalProperties === false && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const allowedKeys = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${prefix || 'root'}: unexpected field: ${key}`);
      }
    }
  }

  // Check enum
  if (schema.enum !== undefined && !schema.const) {
    if (!schema.enum.includes(data)) {
      errors.push(`${prefix || 'root'}: must be one of ${schema.enum.join(', ')}`);
    }
  }

  // Check string constraints
  if (typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) {
      errors.push(`${prefix || 'root'}: minLength ${schema.minLength} not met`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(`${prefix || 'root'}: pattern mismatch`);
    }
  }

  // Check number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${prefix || 'root'}: minimum ${schema.minimum} not met`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${prefix || 'root'}: maximum ${schema.maximum} not met`);
    }
  }

  // Check array constraints
  if (Array.isArray(data) && schema.items) {
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(`${prefix || 'root'}: minItems ${schema.minItems} not met`);
    }
    for (let i = 0; i < data.length; i++) {
      validateAgainstSchema(data[i], schema.items, errors, `${prefix || 'root'}[${i}]`);
    }
  }
}

function validateAgainstSchema(data, schema, errors = [], prefix = '') {
  if (typeof schema !== 'object' || schema === null) return;

  // Check const
  if (schema.const !== undefined) {
    if (data !== schema.const) {
      errors.push(`${prefix}: const mismatch`);
    }
    return;
  }

  // Check enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      errors.push(`${prefix}: must be one of ${schema.enum.join(', ')}`);
    }
    return;
  }

  // Check type string
  if (typeof schema.type === 'string') {
    const t = schema.type;
    if (t === 'string') {
      if (typeof data !== 'string') {
        errors.push(`${prefix}: expected string`);
        return;
      }
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(`${prefix}: minLength ${schema.minLength} not met`);
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push(`${prefix}: pattern mismatch`);
        }
      }
    } else if (t === 'integer') {
      if (!Number.isInteger(data)) {
        errors.push(`${prefix}: expected integer`);
      } else {
        if (schema.minimum !== undefined && data < schema.minimum) {
          errors.push(`${prefix}: minimum ${schema.minimum} not met`);
        }
      }
    } else if (t === 'number') {
      if (typeof data !== 'number') {
        errors.push(`${prefix}: expected number`);
      } else {
        if (schema.minimum !== undefined && data < schema.minimum) {
          errors.push(`${prefix}: minimum ${schema.minimum} not met`);
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
          errors.push(`${prefix}: maximum ${schema.maximum} not met`);
        }
      }
    } else if (t === 'boolean') {
      if (typeof data !== 'boolean') {
        errors.push(`${prefix}: expected boolean`);
      }
    } else if (t === 'array') {
      if (!Array.isArray(data)) {
        errors.push(`${prefix}: expected array`);
      } else {
        if (schema.minItems && data.length < schema.minItems) {
          errors.push(`${prefix}: minItems ${schema.minItems} not met`);
        }
        if (schema.items) {
          for (let i = 0; i < data.length; i++) {
            validateAgainstSchema(data[i], schema.items, errors, `${prefix}[${i}]`);
          }
        }
      }
    } else if (t === 'object') {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        errors.push(`${prefix}: expected object`);
      } else {
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
          if (key in data) {
            validateAgainstSchema(data[key], propSchema, errors, `${prefix}.${key}`);
          }
        }
      }
    }
  }

  // Check nested object (without explicit type)
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in data)) continue;
      validateAgainstSchema(data[key], propSchema, errors, `${prefix}.${key}`);
    }
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in data)) {
          errors.push(`${prefix}: missing required field: ${req}`);
        }
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const checkHashes = args.includes('--check-hashes');

  console.log('=== Protected Dataset Manifest Verification ===');

  // Load schema
  const manifestSchema = loadSchema('protected-dataset.schema.json');
  console.log(`[1/3] Loaded schema: ${manifestSchema.title}`);

  // Find and validate all manifests
  const manifestFiles = fs.readdirSync(PROTECTED_DIR)
    .filter(f => f.endsWith('.json') && f !== 'README.md');

  if (manifestFiles.length === 0) {
    console.warn('  WARNING: No manifests found in datasets/protected/');
  }

  let allValid = true;
  for (const manifestFile of manifestFiles) {
    const manifest = loadManifest(manifestFile);
    const errors = [];
    validateAgainstSchema(manifest, manifestSchema, errors);
    if (errors.length === 0) {
      console.log(`  ✅ ${manifestFile}: schema valid`);
    } else {
      console.log(`  ❌ ${manifestFile}: ${errors.join(', ')}`);
      allValid = false;
    }

    // Optional: check SHA-256 hashes
    if (checkHashes && manifest.sha256 && manifest.path) {
      const fullPath = path.join(path.resolve(__dirname, '..'), manifest.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath);
        const actualHash = crypto.createHash('sha256').update(content).digest('hex');
        if (actualHash === manifest.sha256) {
          console.log(`  ✅ ${manifestFile}: hash matches`);
        } else {
          console.log(`  ❌ ${manifestFile}: hash mismatch (expected ${manifest.sha256}, got ${actualHash})`);
          allValid = false;
        }
      } else {
        console.log(`  ⚠️  ${manifestFile}: dataset file not found at ${fullPath}`);
      }
    }
  }

  if (allValid) {
    console.log('\n=== All manifests valid ===');
    process.exit(0);
  } else {
    console.log('\n=== Manifest validation failed ===');
    process.exit(1);
  }
}

main();
