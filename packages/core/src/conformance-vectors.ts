/**
 * Canonical conformance vectors for semantic comparison
 * 
 * This module provides canonical vector generation and property-based
 * testing for semantic structures in OpenLunum.
 */

import type { LunumSem, LunumClause, LunumRecord } from './types.js';
import { canonicalize } from './canonicalize.js';

// ── Conformance Vector Type ────────────────────────────────────────

export type VectorDimension = 'schema' | 'world' | 'kind' | 'predicate' | 'role' | 'negation' | 'time' | 'modality';

export interface ConformanceVector {
  /** Vector identifier */
  id: string;
  /** Vector dimensions */
  dimensions: Record<VectorDimension, number>;
  /** Canonical form */
  canonical: string;
  /** Hash of canonical form */
  hash: string;
}

// ── Property Test Definition ───────────────────────────────────────

export interface PropertyTest {
  /** Test name */
  name: string;
  /** Property to test */
  property: string;
  /** Expected value type */
  expectedType: string;
  /** Test result */
  passed: boolean;
  /** Error message if failed */
  error?: string;
}

// ── Conformance Vector Generator ───────────────────────────────────

export class ConformanceVectorGenerator {
  private vectorCount: number;

  constructor() {
    this.vectorCount = 0;
  }

  /**
   * Generate conformance vector for semantic representation
   */
  generateVector(sem: LunumSem): ConformanceVector {
    const canonical = canonicalize(sem);
    const dimensions = this.extractDimensions(sem);
    const hash = this.hashVector(dimensions);
    
    this.vectorCount++;
    
    return {
      id: `cv:${this.vectorCount.toString().padStart(6, '0')}`,
      dimensions,
      canonical,
      hash
    };
  }

  /**
   * Extract dimensions from semantic representation
   */
  private extractDimensions(sem: LunumSem): Record<VectorDimension, number> {
    const dimensions: Record<VectorDimension, number> = {
      schema: this.hashString(sem.schema),
      world: this.hashString(sem.world),
      kind: this.hashString(sem.kind),
      predicate: 0,
      role: 0,
      negation: 0,
      time: 0,
      modality: 0
    };

    // Count predicates
    const predicates = new Set<string>();
    const roles = new Set<string>();
    let negationCount = 0;
    let timeCount = 0;
    let modalityCount = 0;

    for (const clause of sem.clauses) {
      predicates.add(clause.predicate);
      
      for (const role of Object.keys(clause.roles ?? {})) {
        roles.add(role);
      }
      
      if (clause.negated) {
        negationCount++;
      }
      
      if (clause.time) {
        timeCount++;
      }
      
      if (clause.modality) {
        modalityCount++;
      }
    }

    dimensions.predicate = this.hashArray(Array.from(predicates));
    dimensions.role = this.hashArray(Array.from(roles));
    dimensions.negation = negationCount;
    dimensions.time = timeCount;
    dimensions.modality = modalityCount;

    return dimensions;
  }

  /**
   * Hash vector dimensions
   */
  private hashVector(dimensions: Record<VectorDimension, number>): string {
    let hash = 0;
    const keys = Object.keys(dimensions) as VectorDimension[];
    
    for (const key of keys) {
      hash = ((hash << 5) - hash) + dimensions[key];
      hash = hash & hash;
    }
    
    return `cvh:${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  /**
   * Hash a string
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Hash an array of strings
   */
  private hashArray(arr: string[]): number {
    let hash = 0;
    const sorted = [...arr].sort();
    
    for (const str of sorted) {
      hash = ((hash << 5) - hash) + this.hashString(str);
      hash = hash & hash;
    }
    
    return Math.abs(hash);
  }

  /**
   * Get vector count
   */
  getVectorCount(): number {
    return this.vectorCount;
  }

  /**
   * Reset vector count
   */
  reset(): void {
    this.vectorCount = 0;
  }
}

// ── Property Test Runner ───────────────────────────────────────────

export class PropertyTestRunner {
  private tests: PropertyTest[];

  constructor() {
    this.tests = [];
  }

  /**
   * Run property tests on semantic representation
   */
  runTests(sem: LunumSem): PropertyTest[] {
    this.tests = [];
    
    this.testSchemaConsistency(sem);
    this.testWorldConsistency(sem);
    this.testKindConsistency(sem);
    this.testClauseStructure(sem);
    this.testRoleTypes(sem);
    this.testNegationTypes(sem);
    this.testTimeTypes(sem);
    this.testModalityTypes(sem);

    return [...this.tests];
  }

  /**
   * Test schema consistency
   */
  private testSchemaConsistency(sem: LunumSem): void {
    const passed = sem.schema === 'lunum-sem/0.1-draft';
    this.tests.push({
      name: 'schema-consistency',
      property: 'schema',
      expectedType: 'lunum-sem/0.1-draft',
      passed,
      error: passed ? undefined : `Expected lunum-sem/0.1-draft, got ${sem.schema}`
    });
  }

  /**
   * Test world consistency
   */
  private testWorldConsistency(sem: LunumSem): void {
    const passed = typeof sem.world === 'string' && sem.world.length > 0;
    this.tests.push({
      name: 'world-consistency',
      property: 'world',
      expectedType: 'string',
      passed,
      error: passed ? undefined : `World must be non-empty string`
    });
  }

  /**
   * Test kind consistency
   */
  private testKindConsistency(sem: LunumSem): void {
    const passed = typeof sem.kind === 'string' && sem.kind.length > 0;
    this.tests.push({
      name: 'kind-consistency',
      property: 'kind',
      expectedType: 'string',
      passed,
      error: passed ? undefined : `Kind must be non-empty string`
    });
  }

  /**
   * Test clause structure
   */
  private testClauseStructure(sem: LunumSem): void {
    const passed = Array.isArray(sem.clauses) && sem.clauses.length > 0;
    this.tests.push({
      name: 'clause-structure',
      property: 'clauses',
      expectedType: 'array',
      passed,
      error: passed ? undefined : `Clauses must be non-empty array`
    });

    // Test each clause
    for (let i = 0; i < sem.clauses.length; i++) {
      const clause = sem.clauses[i];
      const hasPredicate = typeof clause.predicate === 'string' && clause.predicate.length > 0;
      
      if (!hasPredicate) {
        this.tests.push({
          name: `clause-${i}-predicate`,
          property: `clauses[${i}].predicate`,
          expectedType: 'string',
          passed: false,
          error: `Clause ${i} must have non-empty predicate`
        });
      }
    }
  }

  /**
   * Test role types
   */
  private testRoleTypes(sem: LunumSem): void {
    for (let i = 0; i < sem.clauses.length; i++) {
      const clause = sem.clauses[i];
      const roles = clause.roles;
      const passed = typeof roles === 'object' && roles !== null;
      
      this.tests.push({
        name: `clause-${i}-roles`,
        property: `clauses[${i}].roles`,
        expectedType: 'object',
        passed,
        error: passed ? undefined : `Clause ${i} roles must be object`
      });
    }
  }

  /**
   * Test negation types
   */
  private testNegationTypes(sem: LunumSem): void {
    for (let i = 0; i < sem.clauses.length; i++) {
      const clause = sem.clauses[i];
      const passed = clause.negated === undefined || typeof clause.negated === 'boolean';
      
      this.tests.push({
        name: `clause-${i}-negation`,
        property: `clauses[${i}].negated`,
        expectedType: 'boolean',
        passed,
        error: passed ? undefined : `Clause ${i} negated must be boolean`
      });
    }
  }

  /**
   * Test time types
   */
  private testTimeTypes(sem: LunumSem): void {
    for (let i = 0; i < sem.clauses.length; i++) {
      const clause = sem.clauses[i];
      const passed = clause.time === undefined || typeof clause.time === 'object' || typeof clause.time === 'string';
      
      this.tests.push({
        name: `clause-${i}-time`,
        property: `clauses[${i}].time`,
        expectedType: 'object|string',
        passed,
        error: passed ? undefined : `Clause ${i} time must be object or string`
      });
    }
  }

  /**
   * Test modality types
   */
  private testModalityTypes(sem: LunumSem): void {
    for (let i = 0; i < sem.clauses.length; i++) {
      const clause = sem.clauses[i];
      const passed = clause.modality === undefined || typeof clause.modality === 'string';
      
      this.tests.push({
        name: `clause-${i}-modality`,
        property: `clauses[${i}].modality`,
        expectedType: 'string',
        passed,
        error: passed ? undefined : `Clause ${i} modality must be string`
      });
    }
  }

  /**
   * Get test results
   */
  getResults(): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    passRate: number;
  } {
    const totalTests = this.tests.length;
    const passedTests = this.tests.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = totalTests > 0 ? passedTests / totalTests : 0;

    return {
      totalTests,
      passedTests,
      failedTests,
      passRate
    };
  }

  /**
   * Clear test results
   */
  clear(): void {
    this.tests = [];
  }
}

// ── Export ─────────────────────────────────────────────────────────

export const conformanceVectorExports = [
  ConformanceVectorGenerator,
  PropertyTestRunner
] as const;