import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectAmbiguousRoundTrip,
  evaluateRoundTrip,
  applyRoundTripFallback,
  processRoundTrip,
  rollbackCanonicalOnFailure,
  RetentionRollbackLedger,
  DEFAULT_ROUND_TRIP_RETENTION_POLICY,
  type RoundTripAttempt
} from '../src/retention-fallback-rollback.js';
import { migrateFingerprint } from '../src/fingerprint-migration.js';
import type { LunumRecord, LunumSem } from '../src/types.js';

// ── Fixtures ─────────────────────────────────────────────────────────

function makeSem(overrides: Partial<LunumSem> = {}): LunumSem {
  return {
    schema: 'lunum-sem/0.1-draft',
    world: 'real',
    kind: 'fact',
    clauses: [{
      predicate: 'notify',
      roles: { agent: 'alice', recipient: 'bob' }
    }],
    ...overrides
  };
}

function makeRecord(sourceText: string, sem: LunumSem): LunumRecord {
  const fingerprint = migrateFingerprint(sem);
  return {
    recordVersion: 'lunum-record/0.2',
    source: { text: sourceText, language: 'en', role: 'user', ref: null },
    sem,
    fingerprint,
    renderings: {},
    policy: {
      eligible: true,
      category: 'test',
      risk: 'low' as const,
      confidence: 0.9,
      reasons: ['test reason']
    },
    meta: {}
  };
}

const GOLD_SEM = makeSem();

function successfulAttempt(): RoundTripAttempt {
  return {
    naturalText: 'Alice notifies Bob.',
    sourceLanguage: 'en',
    expectedSem: GOLD_SEM,
    realizedText: 'Alice notifies Bob.',
    parsedBackSem: makeSem()
  };
}

// ── Ambiguity detection ────────────────────────────────────────────

describe('detectAmbiguousRoundTrip', () => {
  it('reports no ambiguity with a single agreeing candidate', () => {
    const result = detectAmbiguousRoundTrip(successfulAttempt());
    assert.equal(result.ambiguous, false);
    assert.equal(result.totalCandidates, 1);
    assert.equal(result.agreementRate, 1);
  });

  it('reports no ambiguity signal with zero candidates (fail-safe: no evidence)', () => {
    const attempt: RoundTripAttempt = {
      naturalText: 'text',
      expectedSem: GOLD_SEM
    };
    const result = detectAmbiguousRoundTrip(attempt);
    assert.equal(result.ambiguous, false);
    assert.equal(result.totalCandidates, 0);
  });

  it('flags disagreement among alternative parses with different predicates', () => {
    const attempt: RoundTripAttempt = {
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem(),
      alternativeParses: [
        makeSem({ clauses: [{ predicate: 'alert', roles: { agent: 'alice', recipient: 'bob' } }] }),
        makeSem({ clauses: [{ predicate: 'inform', roles: { agent: 'alice', recipient: 'bob' } }] })
      ]
    };
    const result = detectAmbiguousRoundTrip(attempt);
    assert.equal(result.ambiguous, true);
    assert.equal(result.totalCandidates, 3);
    assert.ok(result.distinctFingerprints >= 2);
    assert.ok(result.reasons.some((r) => r.includes('disagree')));
  });

  it('flags score-margin divergence among candidates even without full disagreement', () => {
    const attempt: RoundTripAttempt = {
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem(),
      alternativeParses: [
        makeSem({ clauses: [{ predicate: 'notify', roles: {} }] }) // missing roles → lower recall
      ]
    };
    const result = detectAmbiguousRoundTrip(attempt, {
      ...DEFAULT_ROUND_TRIP_RETENTION_POLICY,
      ambiguityScoreMarginThreshold: 0.05
    });
    assert.equal(result.ambiguous, true);
    assert.ok(result.scoreMargin !== null && result.scoreMargin > 0.05);
  });

  it('does not flag ambiguity when candidates agree above the agreement threshold', () => {
    const attempt: RoundTripAttempt = {
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem(),
      alternativeParses: [makeSem(), makeSem(), makeSem()]
    };
    const result = detectAmbiguousRoundTrip(attempt);
    assert.equal(result.ambiguous, false);
    assert.equal(result.agreementRate, 1);
  });
});

// ── Round-trip evaluation ──────────────────────────────────────────

describe('evaluateRoundTrip', () => {
  it('classifies a clean round trip as success', () => {
    const evaluation = evaluateRoundTrip(successfulAttempt());
    assert.equal(evaluation.status, 'success');
    assert.deepEqual(evaluation.failureCodes, []);
  });

  it('classifies a parse error as failed', () => {
    const evaluation = evaluateRoundTrip({
      naturalText: 'text',
      expectedSem: GOLD_SEM,
      parseError: 'model returned invalid JSON'
    });
    assert.equal(evaluation.status, 'failed');
    assert.ok(evaluation.failureCodes.includes('parse_error'));
    assert.ok(evaluation.failureCodes.includes('missing_parsed_sem'));
  });

  it('classifies a missing parsed sem as failed (fail closed)', () => {
    const evaluation = evaluateRoundTrip({
      naturalText: 'text',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    });
    assert.equal(evaluation.status, 'failed');
    assert.ok(evaluation.failureCodes.includes('missing_parsed_sem'));
    assert.equal(evaluation.comparison, null);
  });

  it('classifies low retention recall as failed', () => {
    const evaluation = evaluateRoundTrip({
      naturalText: 'text',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem({ clauses: [{ predicate: 'unrelated', roles: {} }] })
    });
    assert.equal(evaluation.status, 'failed');
    assert.ok(evaluation.failureCodes.includes('low_recall'));
  });

  it('classifies disagreeing alternative parses as ambiguous, not failed, when the primary parse matches', () => {
    const evaluation = evaluateRoundTrip({
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem(),
      alternativeParses: [
        makeSem({ clauses: [{ predicate: 'alert', roles: { agent: 'alice', recipient: 'bob' } }] })
      ]
    });
    assert.equal(evaluation.status, 'ambiguous');
    assert.ok(evaluation.failureCodes.includes('ambiguous_disagreement'));
  });
});

// ── Automatic fallback ─────────────────────────────────────────────

describe('applyRoundTripFallback', () => {
  it('does not fall back on a successful round trip', () => {
    const record = applyRoundTripFallback(successfulAttempt());
    assert.equal(record.fellBack, false);
    assert.equal(record.naturalText, 'Alice notifies Bob.');
    assert.equal(record.preservedOriginal, true);
  });

  it('falls back to original text on failure', () => {
    const record = applyRoundTripFallback({
      naturalText: 'Original text preserved',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    });
    assert.equal(record.fellBack, true);
    assert.equal(record.naturalText, 'Original text preserved');
    assert.equal(record.evaluation.status, 'failed');
  });

  it('falls back on ambiguous round trips too', () => {
    const record = applyRoundTripFallback({
      naturalText: 'Original text preserved',
      expectedSem: GOLD_SEM,
      parsedBackSem: makeSem(),
      alternativeParses: [
        makeSem({ clauses: [{ predicate: 'alert', roles: { agent: 'alice', recipient: 'bob' } }] })
      ]
    });
    assert.equal(record.fellBack, true);
    assert.equal(record.evaluation.status, 'ambiguous');
  });
});

// ── Ledger: commit / rollback / audit trail ────────────────────────

describe('RetentionRollbackLedger', () => {
  it('commits a canonical form and records a store audit entry', () => {
    let now = 1000;
    const ledger = new RetentionRollbackLedger({ clock: () => now++ });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);
    const evaluation = evaluateRoundTrip(successfulAttempt());

    const entry = ledger.commit('rec-1', record, evaluation);

    assert.equal(entry.action, 'store');
    assert.equal(entry.sequence, 1);
    assert.equal(entry.previousFingerprint, null);
    assert.equal(entry.resultingFingerprint, record.fingerprint);
    assert.equal(entry.naturalTextPreserved, false);
    assert.equal(ledger.getCurrentVersion('rec-1')?.fingerprint, record.fingerprint);
  });

  it('rolls back to the prior version when a later round trip fails', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 42 });
    const goodRecord = makeRecord('Alice notifies Bob.', GOLD_SEM);
    const badSem = makeSem({ clauses: [{ predicate: 'unrelated', roles: {} }] });
    const badRecord = makeRecord('Alice notifies Bob (bad reparse).', badSem);

    const goodEval = evaluateRoundTrip(successfulAttempt());
    ledger.commit('rec-1', goodRecord, goodEval);

    const badEval = evaluateRoundTrip({
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: badSem
    });
    // Simulate that badRecord was tentatively stored before rollback is triggered.
    ledger.commit('rec-1', badRecord, badEval);
    assert.equal(ledger.getCurrentVersion('rec-1')?.fingerprint, badRecord.fingerprint);

    const rollbackEntry = ledger.rollback('rec-1', badEval);

    assert.equal(rollbackEntry.action, 'rollback');
    assert.equal(rollbackEntry.previousFingerprint, badRecord.fingerprint);
    assert.equal(rollbackEntry.resultingFingerprint, goodRecord.fingerprint);
    assert.equal(rollbackEntry.naturalTextPreserved, true);
    assert.equal(ledger.getCurrentVersion('rec-1')?.fingerprint, goodRecord.fingerprint);
  });

  it('rolling back with no prior version leaves no canonical form (natural text only)', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);
    const evaluation = evaluateRoundTrip({
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    });

    ledger.commit('rec-1', record, evaluateRoundTrip(successfulAttempt()));
    ledger.rollback('rec-1', evaluation); // undo the only version
    const entry = ledger.rollback('rec-1', evaluation); // nothing left to remove

    assert.equal(entry.previousFingerprint, null);
    assert.equal(entry.resultingFingerprint, null);
    assert.equal(ledger.getCurrentVersion('rec-1'), undefined);
  });

  it('accumulates a full, ordered, immutable audit trail across keys', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);
    const goodEval = evaluateRoundTrip(successfulAttempt());

    ledger.commit('rec-1', record, goodEval);
    ledger.recordFallback('rec-2', evaluateRoundTrip({
      naturalText: 'unparseable',
      expectedSem: GOLD_SEM,
      parseError: 'timeout'
    }));
    ledger.rollback('rec-1', evaluateRoundTrip({
      naturalText: 'x',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    }));

    const all = ledger.getAuditTrail();
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((e) => e.sequence), [1, 2, 3]);
    assert.deepEqual(all.map((e) => e.action), ['store', 'fallback', 'rollback']);

    const rec1Only = ledger.getAuditTrail('rec-1');
    assert.equal(rec1Only.length, 2);
    assert.deepEqual(rec1Only.map((e) => e.action), ['store', 'rollback']);

    // getAuditTrail returns a snapshot; mutating it must not affect the ledger.
    const snapshot = ledger.getAuditTrail() as RetentionAuditEntryMutable[];
    snapshot.pop();
    assert.equal(ledger.getAuditTrail().length, 3);
  });
});

type RetentionAuditEntryMutable = ReturnType<RetentionRollbackLedger['getAuditTrail']>[number];

// ── Orchestration: processRoundTrip ────────────────────────────────

describe('processRoundTrip', () => {
  it('commits the candidate record on a successful round trip', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);

    const result = processRoundTrip(ledger, {
      key: 'rec-1',
      attempt: successfulAttempt(),
      candidateRecord: record
    });

    assert.equal(result.evaluation.status, 'success');
    assert.equal(result.fallback.fellBack, false);
    assert.equal(result.auditEntry.action, 'store');
    assert.equal(ledger.getCurrentVersion('rec-1')?.fingerprint, record.fingerprint);
  });

  it('rolls back the previously stored canonical form when the round trip fails', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const goodRecord = makeRecord('Alice notifies Bob.', GOLD_SEM);
    processRoundTrip(ledger, { key: 'rec-1', attempt: successfulAttempt(), candidateRecord: goodRecord });

    const result = processRoundTrip(ledger, {
      key: 'rec-1',
      attempt: {
        naturalText: 'Alice notifies Bob.',
        expectedSem: GOLD_SEM,
        parsedBackSem: null
      }
    });

    assert.equal(result.evaluation.status, 'failed');
    assert.equal(result.fallback.fellBack, true);
    assert.equal(result.auditEntry.action, 'rollback');
    // reverted to the prior (only) version — no candidate stored for the failed attempt
    assert.equal(ledger.getCurrentVersion('rec-1')?.fingerprint, goodRecord.fingerprint);
  });

  it('records a review/fallback entry (not a rollback) for ambiguous round trips with nothing previously stored', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const result = processRoundTrip(ledger, {
      key: 'rec-new',
      attempt: {
        naturalText: 'Alice notifies Bob.',
        expectedSem: GOLD_SEM,
        parsedBackSem: makeSem(),
        alternativeParses: [
          makeSem({ clauses: [{ predicate: 'alert', roles: { agent: 'alice', recipient: 'bob' } }] })
        ]
      }
    });

    assert.equal(result.evaluation.status, 'ambiguous');
    assert.equal(result.auditEntry.action, 'fallback');
    assert.equal(ledger.getCurrentVersion('rec-new'), undefined);
  });
});

// ── Verified rollback (integration with rollback-process.ts) ──────

describe('rollbackCanonicalOnFailure', () => {
  it('combines ledger rollback with provenance-verified source rollback', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);
    ledger.commit('rec-1', record, evaluateRoundTrip(successfulAttempt()));

    const evaluation = evaluateRoundTrip({
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    });

    const result = rollbackCanonicalOnFailure(ledger, 'rec-1', record, evaluation);

    assert.equal(result.ledgerEntry.action, 'rollback');
    assert.equal(result.sourceRollback.success, true);
    assert.equal(result.sourceRollback.source.text, 'Alice notifies Bob.');
    assert.equal(ledger.getCurrentVersion('rec-1'), undefined);
  });

  it('flags failed source rollback when the record fingerprint has been tampered with', () => {
    const ledger = new RetentionRollbackLedger({ clock: () => 1 });
    const record = makeRecord('Alice notifies Bob.', GOLD_SEM);
    record.fingerprint = 'lfp:0.2:sha256:tampered';
    ledger.commit('rec-1', record, evaluateRoundTrip(successfulAttempt()));

    const evaluation = evaluateRoundTrip({
      naturalText: 'Alice notifies Bob.',
      expectedSem: GOLD_SEM,
      parsedBackSem: null
    });

    const result = rollbackCanonicalOnFailure(ledger, 'rec-1', record, evaluation);
    assert.equal(result.sourceRollback.success, false);
    assert.equal(result.sourceRollback.integrityStatus, 'failed');
  });
});
