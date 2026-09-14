# Cross-Language Parse Comparison

## Overview
- Experiment: parse-stage2-superqwen-diagnostic
- Run: 2026-09-01T07-57-33-676Z
- Total Items: 26
- Total Passed: 0
- Total Failed: 16
- Total Errors: 10

## Per-Language Metrics
| Language | Items | Passed | Exact Rate | Near-Only Rate | Recall | Precision | Latency (ms) |
|----------|-------|--------|------------|----------------|--------|-----------|--------------|
| English (en) | 3 | 0 | 0.0000 | 0.0000 | 0.3667 | 0.3250 | 14445.36 |
| Greek (el) | 3 | 0 | 0.0000 | 0.0000 | 0.2462 | 0.1693 | 12783.54 |
| Spanish (es) | 3 | 0 | 0.0000 | 0.0000 | 0.3157 | 0.2913 | 16781.38 |
| Indonesian (id) | 3 | 0 | 0.0000 | 0.0000 | 0.2619 | 0.2771 | 12442.23 |
| French (fr) | 3 | 0 | 0.0000 | 0.0000 | 0.2650 | 0.2485 | 12087.57 |
| German (de) | 3 | 0 | 0.0000 | 0.0000 | 0.2536 | 0.2481 | 14137.29 |
| Japanese (ja) | 2 | 0 | 0.0000 | 0.0000 | 0.1250 | 0.0400 | 18401.13 |
| Chinese (zh) | 2 | 0 | 0.0000 | 0.0000 | 0.3333 | 0.4000 | 11821.04 |
| Portuguese (pt) | 2 | 0 | 0.0000 | 0.0000 | 0.0357 | 0.0385 | 13300.87 |
| Arabic (ar) | 2 | 0 | 0.0000 | 0.0000 | 0.2667 | 0.2857 | 16182.88 |

## Cross-Language Analysis
- Best Exact Rate: English
- Best Recall: English
- Fastest: Chinese
- Overall Near-Semantic-Only Rate: 0.0000
- Consistency Score: 1.0000

## Variance
- Exact Rate Variance: 0.000000
- Recall Variance: 0.008699
- Latency Variance: 4432062.239432

## Failure Modes
- predicate:1:group: 1
- role:0:language:en: 1
- role:0:theme:bullet_points: 1
- role:1:agent:assistant: 1
- role:1:criterion:topic: 1
- role:1:object:weekly_digest: 1
- predicate:0.condition.0:differ: 1
- role:0.condition.0:reference:approved_manifest: 1
- role:0:environment:staging: 1
- world:engineering: 3
- error: attempt 1: Invalid Lunum-Sem: sem must be an objec: 10
- kind:fact: 1
- predicate:0:record: 1
- role:0:object:active_units: 1
- role:0:time:2026-10-14: 1
- role:0:value:37: 1
- kind:temporal_constraint: 1
- modality:0:must: 5
- predicate:0.condition.0:verify: 1
- role:0.condition.0:agent:auditor: 1
- role:0.condition.0:object:files: 1
- role:0:agent:auditor: 1
- world:security: 3
- kind:permission: 1
- modality:0:may: 2
- modality:1:may: 4
- role:0:agent:provider: 1
- world:access: 1
- kind:inventory_fact: 1
- predicate:1:unlabeled: 1
- role:0:nameditems:alpha|beta|gamma: 1
- role:0:quantity:12: 1
- role:0:subject:batch: 1
- role:1:quantity:9: 1
- role:1:subject:remaining: 1
- predicate:0.condition.0:finish: 1
- role:0.condition.0:agent:backup: 1
- role:0.condition.0:time:friday: 1
- role:0:object:third: 1
- role:0:time:2026-11-06: 1
- kind:access_constraint: 1
- negated:1.condition.0:true: 1
- predicate:1.condition.0:close: 1
- role:0:agent:assistant: 1
- role:0:object:this: 1
- role:1.condition.0:object:d-418: 1
- role:1:agent:delta: 1
- role:1:object:this: 1
- world:privacy: 1
- kind:deployment_state: 1
- modality:0:possible: 2
- predicate:0:complete: 2
- role:0:subject:north_region: 1
- kind:workflow_policy: 1
- predicate:1:defer: 1
- role:0:object:schema: 1
- role:1:object:notification: 1
- role:1:time:tomorrow: 1
- kind:procedure: 2
- modality:1:must: 1
- predicate:1.condition.0:approve: 1
- role:0:object:encrypted_log: 1
- role:0:recipient:auditor: 1
- role:1.condition.0:object:release: 1
- role:1:object:encrypted_log: 1
- negated:0.consequence.0:false: 2
- negated:0.consequence.1:false: 1
- predicate:0.consequence.0:clear: 1
- predicate:0.consequence.1:warn: 1
- predicate:0:monitor: 1
- role:0.condition.0:subject:storage: 1
- role:0.condition.0:value:18: 1
- role:0.consequence.0:agent:service: 1
- role:0.consequence.0:object:cache: 1
- role:0.consequence.1:agent:service: 1
- role:0.consequence.1:recipient:on_call: 1
- world:operations: 1
- role:0:agent:owner: 1
- role:0:objects:design_spec|test_log|approval_form: 1
- role:0:time:friday: 1
- kind:access_policy: 1
- kind:conditional_plan: 1
- negated:0.condition.0:false: 1
- predicate:0.condition.0:fail: 1
- predicate:0.consequence.0:notify: 1
- role:0.condition.0:subject:aurora_migration: 1
- role:0.consequence.0:agent:carlos: 1
- role:0.consequence.0:recipient:on_call: 1
- role:0:subject:aurora_migration: 1
- role:0:time:2026-12-19: 1
- kind:uncertain_fact: 1
- negated:1.condition.0:false: 1
- predicate:1:confirm: 1
- role:0:value:24: 1
- role:1:agent:auditor: 1
- role:1:object:attempts: 1
