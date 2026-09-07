# Cross-Language Parse Comparison

## Overview
- Experiment: parse-stage2-superqwen-frozen
- Run: 2026-09-01T10-00-09-679Z
- Total Items: 24
- Total Passed: 2
- Total Failed: 17
- Total Errors: 5

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.0000 | 0.0000 | 0.3154 | 0.2604 | 10832.29 |
| Greek (el) | 4 | 0 | 0.0000 | 0.0000 | 0.2679 | 0.2917 | 8790.92 |
| Spanish (es) | 4 | 0 | 0.0000 | 0.0000 | 0.4195 | 0.4356 | 10501.74 |
| Indonesian (id) | 4 | 0 | 0.0000 | 0.0000 | 0.3919 | 0.3036 | 11524.63 |
| French (fr) | 4 | 0 | 0.0000 | 0.0000 | 0.1364 | 0.1071 | 11651.96 |
| German (de) | 4 | 1 | 0.0000 | 0.0000 | 0.2619 | 0.2298 | 7315.94 |
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
- Recall Variance: 0.008701
- Latency Variance: 2433402.368762

## Failure Modes
- error: attempt 1: Validation failed: clauses[0].roles.amo: 2
- negated:0.consequence.0:false: 1
- predicate:0.consequence.0:notify: 1
- role:0.condition.0:object:review: 1
- role:0.consequence.0:agent:assistant: 1
- role:0.consequence.0:recipient:owner: 1
- role:0:agent:assistant: 1
- world:operations: 4
- kind:uncertain_fact: 1
- kind:fact: 1
- role:0:theme:client_request: 1
- world:access: 2
- error: attempt 1: Validation failed: clauses[0].roles.tim: 1
- kind:permission: 2
- modality:0:may: 2
- world:security: 3
- expected abstention but model returned a semantic candidate: 3
- role:0.condition.0:subject:backup: 1
- role:0:recipient:team: 1
- role:0:time:friday: 1
- role:0:order:first: 1
- role:0:theme:important_notifications: 1
- kind:procedure: 4
- predicate:0:hand_over: 1
- role:0:object:package: 1
- role:0:recipient:courier: 1
- role:1:agent:courier: 1
- role:1:object:package: 1
- error: attempt 1: Validation failed: clauses[0].condition: 2
- role:0:objects:design|test_notes|approval_form: 1
- role:0:quantity:3: 1
- world:engineering: 2
- kind:access_policy: 1
- role:0:audience:public: 1
- role:0:object:medical_report: 1
- role:1:visibility:private: 1
- world:privacy: 1
- kind:temporal_constraint: 1
- role:0:agent:operator: 1
- role:0:object:inspection: 1
- role:0:object:request: 1
- role:1:object:result: 1
- role:1:recipient:auditor: 1
- predicate:0.condition.0:verify: 1
- role:0.condition.0:object:files: 1
- role:0:agent:auditor: 1
- role:0:object:log: 1
- role:0:agent:admin: 1
- role:0:theme:external_approval: 1
- predicate:0:wait: 1
- role:0:environment:staging: 1
- role:0:object:approval: 1
