# Cross-Language Parse Comparison

## Overview
- Experiment: parse-stage2-superqwen-frozen
- Run: 2026-09-01T08-34-11-292Z
- Total Items: 24
- Total Passed: 2
- Total Failed: 17
- Total Errors: 5

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.0000 | 0.0000 | 0.2462 | 0.2235 | 9051.23 |
| Greek (el) | 4 | 0 | 0.0000 | 0.0000 | 0.3036 | 0.2500 | 8777.09 |
| Spanish (es) | 4 | 0 | 0.0000 | 0.0000 | 0.3377 | 0.3674 | 9815.70 |
| Indonesian (id) | 4 | 0 | 0.0000 | 0.0000 | 0.3085 | 0.2098 | 13004.96 |
| French (fr) | 4 | 0 | 0.0000 | 0.0000 | 0.1818 | 0.1429 | 11623.37 |
| German (de) | 4 | 1 | 0.0000 | 0.0000 | 0.2976 | 0.2833 | 7457.15 |
| Japanese (ja) | 0 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.00 |
| Chinese (zh) | 0 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.00 |
| Portuguese (pt) | 0 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.00 |
| Arabic (ar) | 0 | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.00 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: Spanish
- Fastest: German
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 1.0000

## Variance
- Exact Rate Variance: 0.000000
- Recall Variance: 0.002631
- Latency Variance: 3424776.181503

## Failure Modes
- error: attempt 1: Validation failed: clauses[0].roles.qua: 2
- negated:0.consequence.0:false: 1
- predicate:0.condition.0:approve: 1
- predicate:0.consequence.0:notify: 1
- role:0.condition.0:object:review: 1
- role:0.consequence.0:agent:assistant: 1
- role:0.consequence.0:recipient:owner: 1
- role:0:agent:assistant: 1
- world:operations: 3
- kind:uncertain_fact: 1
- predicate:0:complete: 1
- kind:fact: 1
- role:0:theme:client_request: 1
- world:access: 2
- error: attempt 1: Validation failed: clauses[0].roles.tim: 2
- modality:0:may: 2
- world:security: 3
- expected abstention but model returned a semantic candidate: 4
- role:0:order:first: 1
- role:0:theme:important_notifications: 1
- kind:procedure: 4
- predicate:0:hand_over: 1
- role:0:object:package: 1
- role:0:objects:design|test_notes|approval_form: 1
- role:0:quantity:3: 1
- world:engineering: 2
- kind:access_policy: 1
- role:0:audience:public: 1
- role:0:object:medical_report: 1
- role:1:visibility:private: 1
- world:privacy: 1
- kind:temporal_constraint: 1
- predicate:0.condition.0:after: 1
- predicate:0:run: 1
- role:0.condition.0:subject:certificate_update: 1
- role:0:agent:operator: 1
- role:0:object:inspection: 1
- error: attempt 1: Validation failed: clauses[0].condition: 1
- role:1:object:result: 1
- predicate:0.condition.0:verify: 1
- role:0.condition.0:object:files: 1
- role:0:agent:auditor: 1
- role:0:object:log: 1
- role:0:agent:admin: 1
- role:0:theme:external_approval: 1
- predicate:0:wait: 1
- role:0:environment:staging: 1
- role:0:object:approval: 1
