import { test } from 'node:test';
import assert from 'node:assert';
import { 
  SUPPORTED_PARSE_LANGUAGES,
  englishBaseline,
  greekBaseline,
  englishParseRules,
  greekParseRules,
  BaselineParser
} from '../src/english-greek-baselines.js';

test('SUPPORTED_PARSE_LANGUAGES contains en and el', () => {
  assert.ok(SUPPORTED_PARSE_LANGUAGES.has('en'));
  assert.ok(SUPPORTED_PARSE_LANGUAGES.has('el'));
  assert.strictEqual(SUPPORTED_PARSE_LANGUAGES.size, 2);
});

test('englishBaseline has correct metadata', () => {
  assert.strictEqual(englishBaseline.language, 'en');
  assert.strictEqual(englishBaseline.version, '1.0.0');
  assert.strictEqual(englishBaseline.features.length, 6);
  assert.strictEqual(englishBaseline.limitations.length, 2);
});

test('greekBaseline has correct metadata', () => {
  assert.strictEqual(greekBaseline.language, 'el');
  assert.strictEqual(greekBaseline.version, '1.0.0');
  assert.strictEqual(greekBaseline.features.length, 6);
  assert.strictEqual(greekBaseline.limitations.length, 2);
});

test('englishParseRules has correct structure', () => {
  assert.ok(englishParseRules.length > 0);
  for (const rule of englishParseRules) {
    assert.ok(rule.pattern instanceof RegExp);
    assert.strictEqual(typeof rule.predicate, 'string');
    assert.strictEqual(typeof rule.confidence, 'number');
    assert.ok(rule.roleMap);
  }
});

test('greekParseRules has correct structure', () => {
  assert.ok(greekParseRules.length > 0);
  for (const rule of greekParseRules) {
    assert.ok(rule.pattern instanceof RegExp);
    assert.strictEqual(typeof rule.predicate, 'string');
    assert.strictEqual(typeof rule.confidence, 'number');
    assert.ok(rule.roleMap);
  }
});

test('BaselineParser getSupportedLanguages returns en and el', () => {
  const parser = new BaselineParser();
  const languages = parser.getSupportedLanguages();
  
  assert.ok(languages.includes('en'));
  assert.ok(languages.includes('el'));
});

test('BaselineParser parseEnglish parses statements', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseEnglish('Apple is a company');
  
  assert.ok(clauses.length > 0);
  assert.ok(clauses.some(c => c.predicate === 'statement'));
});

test('BaselineParser parseEnglish parses questions', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseEnglish('What is Apple?');
  
  assert.ok(clauses.length > 0);
  assert.ok(clauses.some(c => c.predicate === 'question'));
});

test('BaselineParser parseGreek parses statements', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseGreek('Η Apple είναι μια εταιρεία');
  
  assert.ok(clauses.length > 0);
  assert.ok(clauses.some(c => c.predicate === 'statement'));
});

test('BaselineParser parseGreek parses questions', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseGreek('Τι είναι η Apple;');
  
  assert.ok(clauses.length > 0);
  assert.ok(clauses.some(c => c.predicate === 'question'));
});

test('BaselineParser getEnglishRules returns rules', () => {
  const parser = new BaselineParser();
  const rules = parser.getEnglishRules();
  
  assert.ok(rules.length > 0);
});

test('BaselineParser getGreekRules returns rules', () => {
  const parser = new BaselineParser();
  const rules = parser.getGreekRules();
  
  assert.ok(rules.length > 0);
});