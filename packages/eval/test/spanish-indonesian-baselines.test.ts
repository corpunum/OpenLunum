import { test } from 'node:test';
import assert from 'node:assert';
import { 
  BaselineParser,
  SUPPORTED_PARSE_LANGUAGES,
  spanishBaseline,
  indonesianBaseline,
  type ParseLanguage
} from '../src/spanish-indonesian-baselines.js';

test('Spanish baseline has correct metadata', () => {
  assert.strictEqual(spanishBaseline.language, 'es');
  assert.strictEqual(spanishBaseline.version, '1.0.0');
  assert.ok(spanishBaseline.features.length > 0);
  assert.ok(spanishBaseline.limitations.length > 0);
});

test('Indonesian baseline has correct metadata', () => {
  assert.strictEqual(indonesianBaseline.language, 'id');
  assert.strictEqual(indonesianBaseline.version, '1.0.0');
  assert.ok(indonesianBaseline.features.length > 0);
  assert.ok(indonesianBaseline.limitations.length > 0);
});

test('SUPPORTED_PARSE_LANGUAGES contains es and id', () => {
  assert.ok(SUPPORTED_PARSE_LANGUAGES.has('es'));
  assert.ok(SUPPORTED_PARSE_LANGUAGES.has('id'));
  assert.strictEqual(SUPPORTED_PARSE_LANGUAGES.size, 2);
});

test('BaselineParser parses Spanish statements', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseSpanish('Apple es una empresa');
  
  const statement = clauses.find(c => c.predicate === 'statement');
  assert.ok(statement);
  assert.ok(statement.roles.subject);
});

test('BaselineParser parses Spanish questions', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseSpanish('¿Quién es Apple?');
  
  const question = clauses.find(c => c.predicate === 'question');
  assert.ok(question);
  assert.ok(question.roles.questionWord);
});

test('BaselineParser parses Spanish locations', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseSpanish('Madrid está en España');
  
  const location = clauses.find(c => c.predicate === 'location');
  assert.ok(location);
  assert.ok(location.roles.subject);
});

test('BaselineParser parses Spanish negations', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseSpanish('No es correcto');
  
  const negation = clauses.find(c => c.predicate === 'negation');
  assert.ok(negation);
  assert.strictEqual(negation.negated, true);
});

test('BaselineParser parses Indonesian statements', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseIndonesian('Google adalah perusahaan');
  
  const statement = clauses.find(c => c.predicate === 'statement');
  assert.ok(statement);
  assert.ok(statement.roles.subject);
});

test('BaselineParser parses Indonesian questions', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseIndonesian('Siapa Google?');
  
  const question = clauses.find(c => c.predicate === 'question');
  assert.ok(question);
  assert.ok(question.roles.questionWord);
});

test('BaselineParser parses Indonesian locations', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseIndonesian('Jakarta terletak di Indonesia');
  
  const location = clauses.find(c => c.predicate === 'location');
  assert.ok(location);
  assert.ok(location.roles.subject);
});

test('BaselineParser parses Indonesian negations', () => {
  const parser = new BaselineParser();
  const clauses = parser.parseIndonesian('Tidak benar');
  
  const negation = clauses.find(c => c.predicate === 'negation');
  assert.ok(negation);
  assert.strictEqual(negation.negated, true);
});

test('BaselineParser getSupportedLanguages returns es and id', () => {
  const parser = new BaselineParser();
  const langs = parser.getSupportedLanguages();
  
  assert.ok(langs.includes('es'));
  assert.ok(langs.includes('id'));
  assert.strictEqual(langs.length, 2);
});

test('BaselineParser parse method works for both languages', () => {
  const parser = new BaselineParser();
  
  const esResult = parser.parse('Test es importante', 'es');
  assert.ok(Array.isArray(esResult));
  
  const idResult = parser.parse('Test adalah penting', 'id');
  assert.ok(Array.isArray(idResult));
});

test('BaselineParser throws for unsupported language', () => {
  const parser = new BaselineParser();
  
  assert.throws(
    () => parser.parse('Test', 'fr' as ParseLanguage),
    /Unsupported language/
  );
});

test('BaselineParser getSpanishRules returns rules', () => {
  const parser = new BaselineParser();
  const rules = parser.getSpanishRules();
  
  assert.ok(rules.length > 0);
  assert.ok(rules.every(r => r.pattern && r.predicate && r.confidence));
});

test('BaselineParser getIndonesianRules returns rules', () => {
  const parser = new BaselineParser();
  const rules = parser.getIndonesianRules();
  
  assert.ok(rules.length > 0);
  assert.ok(rules.every(r => r.pattern && r.predicate && r.confidence));
});