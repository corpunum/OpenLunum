#!/usr/bin/env node
/**
 * schema-to-ts.js — Generate TypeScript types from JSON Schema definitions.
 *
 * Usage:
 *   node scripts/schema-to-ts.js [--dry-run]
 *
 * Reads schemas/*.json, generates packages/core/src/types-schema.ts,
 * and exits with non-zero status on drift.
 */

const fs = require('fs');
const path = require('path');

const SCHEMAS_DIR = path.resolve(__dirname, '..', 'schemas');
const OUTPUT_FILE = path.resolve(__dirname, '..', 'packages', 'core', 'src', 'types-schema.ts');
const HEADER = `// Auto-generated from schemas/*.json — do not edit manually.
// Regenerate with: node scripts/schema-to-ts.js

`;

// Load all schemas for cross-reference resolution
const allSchemas = {};
for (const file of fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json')).sort()) {
  const content = fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf-8');
  const schema = JSON.parse(content);
  allSchemas[file] = schema;
  // Index by $id if present
  if (schema.$id) {
    allSchemas[schema.$id] = schema;
  }
}

function resolveRef(ref) {
  // Handle file-based refs like 'lunum-sem.schema.json'
  if (ref.endsWith('.schema.json')) {
    return allSchemas[ref] || null;
  }
  // Handle $id-based refs
  if (allSchemas[ref]) {
    return allSchemas[ref];
  }
  return null;
}

function tsType(prop, depth = 0, parentDefs = null) {
  if (depth > 10) return 'unknown';
  if (prop.const !== undefined) {
    return JSON.stringify(prop.const);
  }
  if (prop.enum) {
    return prop.enum.map(v => JSON.stringify(v)).join(' | ');
  }
  if (prop.$ref) {
    const ref = prop.$ref;
    // Handle local defs like '#/$defs/clause'
    if (ref.startsWith('#/')) {
      const key = ref.split('/').pop();
      if (parentDefs && parentDefs[key]) {
        return tsType(parentDefs[key], depth + 1, parentDefs);
      }
      return capitalize(key);
    }
    // Inline the referenced schema
    const refSchema = resolveRef(ref);
    if (refSchema) {
      const defs = refSchema.$defs || null;
      return tsType({type: 'object', ...refSchema}, depth + 1, defs);
    }
    return capitalize(ref.split('/').pop().replace(/\.schema\.json$/, ''));
  }
  if (prop.anyOf) {
    return prop.anyOf.map(p => tsType(p, depth + 1, parentDefs)).join(' | ');
  }
  if (prop.allOf) {
    return prop.allOf.map(p => tsType(p, depth + 1, parentDefs)).join(' & ');
  }
  if (prop.type) {
    if (Array.isArray(prop.type)) {
      return prop.type.map(t => tsPrimitive(t)).join(' | ');
    }
    const t = prop.type;
    if (t === 'array') {
      if (prop.items) {
        const defs = (parentDefs && parentDefs.items) ? (parentDefs.items.$defs || null) : null;
        const itemT = tsType(prop.items, depth + 1, defs);
        return `${itemT}[]`;
      }
      return 'unknown[]';
    }
    if (t === 'object') {
      return tsObject(prop, prop.$defs || parentDefs);
    }
    return tsPrimitive(t);
  }
  return 'unknown';
}

function tsObject(schema, parentDefs = null) {
  if (schema.properties) {
    const required = new Set(schema.required || []);
    const props = [];
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      const type = tsType(propDef, 0, parentDefs);
      const optional = required.has(propName) ? '' : '?';
      props.push(`    ${propName}${optional}: ${type}`);
    }
    return `{ ${props.join(', ')} }`;
  }
  return 'Record<string, unknown>';
}

function tsPrimitive(type) {
  switch (type) {
    case 'string': return 'string';
    case 'number': case 'integer': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    default: return 'unknown';
  }
}

function capitalize(s) {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function schemaToName(schemaId) {
  if (schemaId) {
    const match = schemaId.match(/schemas\/([a-z0-9-]+)\/(\d+\.\d+)/);
    if (match) {
      return capitalize(match[1]) + 'Schema';
    }
  }
  return 'UnknownSchema';
}

function generateDefs(defs) {
  if (!defs) return '';
  const parts = [];
  const usedTypes = new Set();
  
  for (const [defName, defSchema] of Object.entries(defs)) {
    const tsName = capitalize(defName);
    
    // Generate the type definition
    let typeStr = tsType({type: 'object', ...defSchema}, 0, defs);
    parts.push(`export type ${tsName} = ${typeStr};`);
    usedTypes.add(tsName);
  }
  
  return parts.join('\n');
}

function generateInterface(name, schema) {
  const props = [];
  const required = new Set(schema.required || []);
  const defs = schema.$defs || null;
  const usedTypes = new Set();

  if (schema.properties) {
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      const type = tsType(propDef, 0, defs);
      // Track types used
      type.match(/\b[A-Z][a-zA-Z]+\b/g)?.forEach(t => usedTypes.add(t));
      const optional = required.has(propName) ? '' : '?';
      props.push(`  ${propName}${optional}: ${type};`);
    }
  }

  const body = `export interface ${name} {\n${props.join('\n')}\n}`;
  const defsCode = defs ? '\n\n' + generateDefs(defs) : '';
  
  return body + defsCode;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const schemaFiles = fs.readdirSync(SCHEMAS_DIR)
    .filter(f => f.endsWith('.schema.json'))
    .sort();

  const interfaces = [];

  for (const file of schemaFiles) {
    const schema = allSchemas[file];
    const name = schemaToName(schema.$id || file);
    interfaces.push(generateInterface(name, schema));
  }

  const generated = HEADER + interfaces.join('\n\n') + '\n';

  if (dryRun) {
    if (fs.existsSync(OUTPUT_FILE)) {
      const existing = fs.readFileSync(OUTPUT_FILE, 'utf-8');
      if (existing !== generated) {
        console.error('DRIFT DETECTED: generated types differ from types-schema.ts');
        console.error('Run without --dry-run to regenerate.');
        process.exit(1);
      } else {
        console.log('OK: No drift detected.');
      }
    } else {
      console.log('DRIFT DETECTED: types-schema.ts does not exist');
      console.log(generated);
      process.exit(1);
    }
  } else {
    fs.writeFileSync(OUTPUT_FILE, generated);
    console.log(`Generated ${OUTPUT_FILE} from ${schemaFiles.length} schemas.`);
  }
}

main();
