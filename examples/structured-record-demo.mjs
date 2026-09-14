/**
 * Deterministic supplied-Sem walkthrough. No extraction or translation is run.
 * The application explicitly assigns demo-scoped identifiers and annotations.
 * This is not an adoption, grounding, token-savings, or model-quality benchmark.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  compileContext, createRecord, renderSem, semanticFingerprint, submitCandidate,
} from '../packages/core/dist/src/index.js';

export function preferenceSem(negated = false) {
  return {
    schema: 'lunum-sem/0.1-draft', world: 'real', kind: 'preference',
    clauses: [{
      predicate: 'prefer', negated,
      roles: {
        experiencer: { type: 'actor', id: 'demo-user' },
        theme: { type: 'concept', id: 'concise-answers' },
      },
    }],
  };
}

export function runDemo() {
  // These source texts are display evidence. Matching Sem is supplied, not inferred.
  const sources = [
    { language: 'en', text: 'I prefer concise answers.' },
    { language: 'el', text: 'Προτιμώ σύντομες απαντήσεις.' },
  ];
  const sem = preferenceSem();
  const submissions = sources.map(source => submitCandidate({
    sourceText: source.text, sourceLanguage: source.language, candidateSem: sem,
    provenance: { extractorType: 'other', extractorId: 'supplied-sem-demo' },
  }));
  for (const result of submissions) {
    assert.equal(result.frameValid, true);
    assert.equal(result.candidateIdentityAvailable, true);
    assert.equal(result.promotable, false);
  }
  const reordered = structuredClone(sem);
  const roles = reordered.clauses[0].roles;
  reordered.clauses[0].roles = { theme: roles.theme, experiencer: roles.experiencer };
  const fp = semanticFingerprint(sem);
  assert.equal(semanticFingerprint(reordered), fp);
  assert.notEqual(semanticFingerprint(preferenceSem(true)), fp);

  const records = sources.map(source => createRecord({
    sourceText: source.text, sourceLanguage: source.language, sem,
  }));
  // Supply original content explicitly; a record alone is not message content.
  const context = compileContext(records.map(record => ({
    role: 'user', content: record.source.text, record,
  })), { mode: 'mixed' });
  assert.deepEqual(context.selectedMessages.map(row => row.content), sources.map(s => s.text));

  return {
    evidenceClass: 'deterministic-supplied-semantics-demo',
    automaticExtraction: false,
    suppliedIdentifiers: 'application-defined demo scope; no external resolver used',
    sourceTexts: submissions.map(result => result.source),
    fingerprint: fp,
    sameSuppliedSemSameIdentity: submissions.every(result => result.semanticFingerprint === fp),
    roleOrderStable: true,
    negationChangesIdentity: true,
    rendererPreview: renderSem(sem),
    promoted: submissions.some(result => result.promotable),
    naturalContextRetained: true,
    tokenSavings: null,
    taskQuality: null,
    limitations: 'Sem and alignment are supplied. No model, tokenizer measurement, retrieval benchmark, or independent adoption is demonstrated.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(runDemo(), null, 2)); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
