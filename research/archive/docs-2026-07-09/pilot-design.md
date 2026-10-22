# Pilot Design: Multilingual Preference & Constraint Memory (R16.1 + R16.2)

**Document version:** 1.0  
**Pilot phase:** Setup → Shadow Mode → Partial Traffic → Full  
**Target launch:** Q3 2026  

## Executive Summary

This pilot enables OpenLunum to store and retrieve multilingual user preferences and constraints through the semantic parsing pipeline (parse → canonicalize → realize → render). The pilot is designed as a narrow, well-defined use case with strict success metrics and automatic rollback triggers.

**Core idea:** When a user expresses a preference ("I prefer JSON output") in any language, the system:
1. Parses the text into a semantic structure (LunumSem)
2. Creates a fingerprint-based record for deduplication
3. Retrieves matching preferences across languages via exact fingerprint or semantic similarity
4. Renders the preference back into any target language

**Scope constraint:** Preferences, constraints (obligations/permissions), and conditional rules only—no document ingestion, no policy extraction beyond stored preferences.

---

## Pilot Scope

### Use Case: Agent Preference & Constraint Memory

#### In Scope
- **Preference storage:** "I prefer markdown format" → parsed → stored with fingerprint
- **Constraint modalities:** Obligations ("must cite sources"), permissions ("may use code examples"), prohibitions ("must not share personal data")
- **Multilingual support:** EN/EL/ES/JA → canonicalized to same fingerprint
- **Cross-language retrieval:** Query in Spanish, retrieve preference stored in English
- **Conditional rules:** "Use TypeScript when doing web development"
- **Original-text retention:** Preserve source language, source text, and provenance

#### Out of Scope
- Document corpus ingestion
- Policy category assignment beyond `preference` / `constraint`
- Real-time learning or feedback loops
- External API exposure (pilot is internal only)

### Phase Gates

| Phase | Duration | Traffic | Trigger | Success Criteria |
|-------|----------|---------|---------|------------------|
| **Setup** | 1 week | None | Branch created | Codebase compiles, tests pass, pilot data structure tests green |
| **Shadow Mode** | 2 weeks | 0% | Setup complete | Metrics collection works, fingerprint stability confirmed, no data corruption |
| **Partial Traffic** | 3 weeks | 5-10% of logged interactions | Shadow passes | Retention rate > 98%, fingerprint drift < 0.1%, latency < 50ms p95 |
| **Full Production** | Ongoing | 100% | All metrics healthy | Maintain all thresholds, rollback on any trigger |

---

## Architecture

### High-Level Pipeline

```
Source Text (any language)
    ↓
[Parse] → LunumSem (canonical semantic structure)
    ↓
[Canonicalize] → normalized clauses, sorted roles
    ↓
[Fingerprint] → deterministic hash (fingerprint)
    ↓
[Realize] → constraint graph (obligations, permissions)
    ↓
[Render] → target language output
    ↓
[Store] → LunumRecord with fingerprint, metadata, provenance
```

### Data Model

```typescript
// Stored preference entry
interface PreferenceEntry {
  record: LunumRecord;           // Full semantic record with fingerprint
  sourceLanguage: string;         // Original language (en, el, es, ja, etc.)
  storedAt: string;              // ISO timestamp
  fingerprint: string;            // Deduplication key
}

// Cross-language match result
interface CrossLanguageMatch {
  query: PreferenceEntry;
  match: PreferenceEntry;
  comparison: {
    exactFingerprint: boolean;    // Identical fingerprints
    featureRecall: number;        // 0-1, how many query features in match
    featurePrecision: number;     // 0-1, how many match features are in query
  };
}

// Success criteria thresholds
interface SuccessCriteria {
  retentionThresholdPercent: number;        // >= 98%
  fingerprintDriftThresholdPercent: number; // <= 0.1%
  roundTripFidelityThresholdPercent: number;// >= 99%
  latencyP95Ms: number;                     // <= 50ms
  multilingualConsistencyPercent: number;   // >= 99%
}
```

### Measurement Points

| Metric | Definition | Collection | Rollback Threshold |
|--------|-----------|------------|-------------------|
| **Retention Rate** | `(records_retrieved / records_stored) * 100%` | Count fingerprint matches on retrieval | < 98% |
| **Fingerprint Stability** | % of repeated ops with same fingerprint | Hash stability bench every 6h | > 0.1% drift |
| **Round-Trip Fidelity** | % of sems with exact match after canonicalize→render cycle | Test corpus validation | < 99% |
| **Latency P95** | 95th percentile retrieval time (ms) | Query latency histogram | > 50ms |
| **Multilingual Consistency** | % of identical fingerprints across language variants | Multilingual test suite | < 99% |
| **Data Corruption** | Any checksum/validation error on stored records | Error rate monitor | > 0 errors |

---

## Success Criteria (R16.1)

The pilot **PASSES** if **ALL** of the following are true during the active phase:

### Functional Success (Measured Daily)

1. **Retention Rate ≥ 98%**
   - Metric: `successful_retrievals / total_stores * 100%`
   - Measured on all language variants
   - Example: Store 1000 preferences → Query all 1000 → Expect ≥ 980 exact matches

2. **Fingerprint Determinism ≥ 99.9%**
   - Metric: `identical(fingerprint(sem_v1), fingerprint(sem_v1)) == true`
   - Re-canonicalize same sem 100 times → all fingerprints identical
   - Checked every 6 hours on test corpus

3. **Round-Trip Consistency ≥ 99%**
   - Metric: `identical(sem, canonicalize(sem)) == true`
   - Parse → Canonicalize → Compare → Should show 100% feature recall
   - Test on 500+ golden vectors (EN/EL/ES/JA)

4. **Multilingual Equivalence ≥ 99%**
   - Metric: `fingerprint(EN_pref) == fingerprint(EL_pref)` for identical meanings
   - Same sem in 4 languages → identical fingerprint
   - Tested on 200+ multilingual pairs

5. **Latency P95 ≤ 50ms**
   - Metric: Retrieval operation completion time
   - Measured on shadow mode traffic
   - Includes parse + canonicalize + fingerprint lookup

6. **Zero Data Corruption**
   - Metric: `validation_errors == 0`
   - No encoding issues, checksum failures, or record truncation
   - All stored records must validate on retrieval

### Non-Functional Success

7. **Test Coverage ≥ 85%**
   - All 10 scenarios in `pilot-agent-preference-memory.test.ts` pass
   - All 10 scenarios in `pilot-cli-knowledge-base.test.ts` pass
   - 5+ new scenarios in `pilot-success-criteria.test.ts` pass

8. **No Security Regressions**
   - No PII leaked through fingerprints
   - Negated constraints properly isolated (distinct fingerprints)
   - Modalities (obligation vs. permission) distinguishable

---

## Rollback Triggers (R16.2)

The pilot **AUTOMATICALLY ROLLS BACK** if **ANY** of these conditions occur:

### Hard Stops (Immediate Rollback)

| ID | Trigger | Threshold | Action | Justification |
|----|---------|-----------|---------|----|
| **R-1** | Data Corruption | 1+ validation error | Immediate rollback, investigate root cause | Integrity > availability |
| **R-2** | Fingerprint Drift | > 0.5% divergence in 24h | Rollback, audit canonicalization | Deduplication core invariant |
| **R-3** | Retention Collapse | < 95% | Rollback after 4h sustained | Data loss unacceptable |
| **R-4** | Latency Spike | P95 > 100ms for > 1h | Rollback, profile, re-optimize | User experience impact |
| **R-5** | Validation Failure | Invalid sems written | Rollback within 30 min | Schema contract violation |

### Soft Warnings (Manual Review, Likely Rollback)

| ID | Trigger | Threshold | Action | Timeline |
|----|---------|-----------|--------|----------|
| **W-1** | Retention Degradation | 98% → 97% | Alert + debug logs | Review within 2h |
| **W-2** | Fingerprint Skew | 0.1% → 0.3% | Alert + re-measure | Review within 4h |
| **W-3** | Multilingual Inconsistency | 99% → 97% | Alert on language pair | Review within 2h |
| **W-4** | Latency Creep | 40ms → 45ms p95 | Alert + profile | Review within 4h |

### Measurement Schedule

- **Every 1 hour:** Retention rate, latency p95, error rate
- **Every 6 hours:** Fingerprint stability bench, multilingual test suite
- **Every 24 hours:** Full health check, write to metrics store
- **On-demand:** Debug queries if any soft warning triggered

---

## Measurement & Observability

### Metrics Collection

All metrics are collected to `/packages/eval/src/pilot-metrics.ts` and written to:
- **Realtime:** Console output (shadow mode only)
- **Persistent:** `packages/eval-results/pilot-metrics-{timestamp}.json`
- **Aggregated:** `packages/eval-results/pilot-health-report-{phase}.json`

### Metric Format

```typescript
interface PilotMetricsSnapshot {
  timestamp: string;
  phase: 'setup' | 'shadow' | 'partial' | 'full';
  duration_hours: number;
  
  // Functional metrics
  retention_rate_percent: number;
  fingerprint_stability_percent: number;
  roundtrip_fidelity_percent: number;
  multilingual_consistency_percent: number;
  latency_p95_ms: number;
  validation_errors: number;
  
  // Metadata
  scenarios_run: number;
  scenarios_passed: number;
  languages_tested: string[];
  test_corpus_size: number;
}

interface PilotHealthReport {
  phase: string;
  start_time: string;
  end_time: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  metrics: PilotMetricsSnapshot[];
  triggered_rollbacks: RollbackEvent[];
  recommendations: string[];
}
```

### Dashboarding

During shadow mode and beyond, a simple HTML dashboard will be generated from metrics:
- Retention rate trend (24h, 7d)
- Fingerprint stability histogram
- Latency percentiles (p50, p95, p99)
- Multilingual pair coverage
- Rollback event timeline

---

## Implementation Plan

### Week 1: Setup Phase

- [x] Create `docs/pilot-design.md` (this file)
- [x] Create `packages/eval/src/pilot-success-criteria.ts` with types and `evaluatePilotHealth()`
- [x] Create `packages/eval/test/pilot-success-criteria.test.ts` with 5+ test cases
- [ ] Run `pnpm run verify` — all tests pass
- [ ] PR review & merge to `main`

### Week 2-3: Shadow Mode Phase

- [ ] Deploy to internal lab environment
- [ ] Collect 1000+ preference entries in 4 languages
- [ ] Run hourly health checks, store metrics to disk
- [ ] Monitor for any rollback triggers
- [ ] Generate pilot health report

### Week 4-6: Partial Traffic Phase

- [ ] Route 5-10% of live agent interactions through pilot
- [ ] Maintain SLA thresholds (retention ≥ 98%, latency ≤ 50ms)
- [ ] Run daily health checks
- [ ] If any hard stop triggers → immediate rollback
- [ ] If soft warnings → manual triage

### Week 7+: Full Production

- [ ] Route 100% of agent interactions through pilot
- [ ] Maintain all success criteria indefinitely
- [ ] Weekly health check reports
- [ ] Quarterly compliance audit

---

## Risk Register & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Fingerprint instability in production | Medium | Critical | Hourly determinism bench, fallback to hash v1 if divergence > 0.1% |
| Multilingual gaps (missing language pairs) | Low | Medium | Expand test corpus with rare pairs, add validation for new languages |
| Data loss on storage failure | Low | Critical | Write-through fingerprint verification, atomic transactions |
| Latency regression under load | Medium | High | Implement caching for frequent fingerprints, lazy-load renderings |
| PII leakage via fingerprint | Low | Critical | Audit fingerprint construction for direct data inclusion, encrypt at rest |
| Schema drift (new fields break canonicalization) | Low | Medium | Freeze schema during pilot (no new clause fields), version canonicalization algorithm |

---

## Rollback Procedure

If a hard stop is triggered:

1. **Immediate (< 5 min)**
   - Flag as `PILOT_ROLLBACK_INITIATED`
   - Halt new preference storage
   - Redirect queries to fallback (identity preference)

2. **Short-term (< 30 min)**
   - Collect debug logs & metrics
   - Export stored preferences to safe backup
   - Notify team via alert channel

3. **Investigation (4-24 hours)**
   - Root cause analysis
   - Post-mortem documentation
   - Fix engineering issue

4. **Re-entry (after fix validated)**
   - Tag new branch `pilot-recovery-v2`
   - Re-run setup phase tests
   - Restart from shadow mode if root cause found

---

## Success Definitions by Phase

### Setup Phase Complete ✓
- Codebase compiles with `pnpm run verify`
- `pilot-success-criteria.test.ts` all pass
- Types are strict (no `any`, `exactOptionalPropertyTypes: true`)
- Pilot data structure supports all 10 scenarios from existing pilots

### Shadow Mode Complete ✓
- Ran 1000+ hour of traffic (simulated or internal)
- Retention rate ≥ 98% maintained for entire phase
- Zero data corruption errors
- Fingerprint stability bench: 100% consistent
- Latency p95 ≤ 50ms on all operations
- Multilingual test suite 100% pass

### Partial Traffic Complete ✓
- All shadow mode criteria maintained
- 5-10% live traffic for 3 weeks
- No user complaints or anomalies
- Metrics dashboard operational
- Health report shows all green

### Full Production Complete ✓
- 100% live traffic for 1 month
- All success criteria maintained
- Zero hard stops / rollback events
- Weekly compliance audits pass
- Handoff documentation complete

---

## Appendix: Test Scenarios

### Core Scenarios (From Pilot Exploration)

1. **Cross-language fingerprint identity** — EN/EL same sem → same fingerprint
2. **Cross-language retrieval** — Store in EN, query with same sem → exact match
3. **Constraint modality separation** — Obligation vs. permission have distinct fingerprints
4. **Preference override detection** — Old vs. new preference share structure but differ in content
5. **Multilingual canonical equivalence** — Same sem in 4 languages → identical fingerprint
6. **Preference rendering** — Preference sems produce non-empty renderings
7. **Conditional preferences** — Conditional clauses survive full pipeline
8. **Negated constraints** — Negation flag preserved through pipeline
9. **Multi-constraint entry** — Multiple constraints all survive pipeline
10. **User correction flow** — Correction detectable after storage

### Success Criteria Scenarios (New)

11. **Retention rate calculation** — Correctly compute stored vs. retrieved
12. **Fingerprint stability** — Repeated canonicalize produces same hash
13. **Round-trip fidelity** — Parse + canonicalize + render cycle preserves meaning
14. **Latency measurement** — Capture p50, p95, p99 percentiles
15. **Rollback trigger detection** — Hard stops and soft warnings correctly identified

---

## Sign-Off

- **Pilot Designer:** OpenLunum Semantic Parsing Team
- **Target Approval Date:** TBD (post-review)
- **Expected Go-Live:** Q3 2026
