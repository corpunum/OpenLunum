# Cross-Language Parse Comparison

## Overview
- Experiment: parse-stage2-superqwen-frozen
- Run: 2026-09-01T08-12-47-899Z
- Total Items: 24
- Total Passed: 2
- Total Failed: 22
- Total Errors: 0

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 4 | 1 | 0.0000 | 0.0000 | 0.3712 | 0.3485 | 9901.75 |
| Greek (el) | 4 | 0 | 0.0000 | 0.0000 | 0.3973 | 0.3571 | 8720.57 |
| Spanish (es) | 4 | 0 | 0.0000 | 0.0000 | 0.4877 | 0.5038 | 9762.94 |
| Indonesian (id) | 4 | 0 | 0.0000 | 0.0000 | 0.3085 | 0.2098 | 12942.16 |
| French (fr) | 4 | 0 | 0.0000 | 0.0000 | 0.3346 | 0.2991 | 11570.95 |
| German (de) | 4 | 1 | 0.0000 | 0.0000 | 0.2976 | 0.2833 | 7426.99 |
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
- Recall Variance: 0.004129
- Latency Variance: 3238290.059427

## Failure Modes
- kind:fact: 2
- predicate:0:count: 1
- role:0:time:2026-10-21: 1
- role:0:value:42: 1
- negated:0.consequence.0:false: 1
- predicate:0.condition.0:approve: 1
- predicate:0.consequence.0:notify: 1
- role:0.condition.0:object:review: 1
- role:0.consequence.0:agent:assistant: 1
- role:0.consequence.0:recipient:owner: 1
- role:0:agent:assistant: 1
- world:operations: 5
- kind:uncertain_fact: 1
- predicate:0:complete: 1
- role:0:theme:client_request: 1
- world:access: 2
- kind:deadline: 1
- modality:0:must: 2
- role:0:object:upgrade: 1
- role:0:time:2026-11-13: 1
- world:engineering: 3
- modality:0:may: 2
- world:security: 3
- expected abstention but model returned a semantic candidate: 4
- predicate:0:notify: 1
- role:0:recipient:team: 1
- role:0:time:friday: 2
- role:0:order:first: 1
- role:0:theme:important_notifications: 1
- kind:procedure: 4
- predicate:0:hand_over: 1
- role:0:object:package: 1
- role:0:objects:design|test_notes|approval_form: 1
- role:0:quantity:3: 1
- kind:access_policy: 2
- role:0:audience:public: 1
- role:0:object:medical_report: 1
- role:1:visibility:private: 1
- world:privacy: 2
- kind:temporal_constraint: 1
- predicate:0.condition.0:after: 1
- predicate:0:run: 1
- role:0.condition.0:subject:certificate_update: 1
- role:0:agent:operator: 1
- role:0:object:inspection: 1
- predicate:0:keep: 1
- role:0:agent:owner: 1
- role:0:object:report: 1
- role:0:visibility:private: 1
- role:1:object:result: 1
- kind:retention_policy: 1
- role:0:duration:30: 1
- role:0:quantity:18: 1
- predicate:0.condition.0:verify: 1
- role:0.condition.0:object:files: 1
- role:0:agent:auditor: 1
- role:0:object:log: 1
- role:0:agent:admin: 1
- role:0:theme:external_approval: 1
- predicate:0:wait: 1
- role:0:environment:staging: 1
- role:0:object:approval: 1
