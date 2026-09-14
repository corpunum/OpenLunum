# Public-artifact review response

Owner-requested corrective review, 2026-09-14, based on main `a2b5e93002b3d7ca8b1434e72853123aeaa85dd2`. This changes public presentation and onboarding, not core semantics or the active source-only experiment.

| Review point | Assessment | Action / remaining work |
|---|---|---|
| All-rights-reserved licensing conflicts with an open-source impression | Supported by the license at the time of the review. Public visibility is not an open-source grant. | Initially clarified README/LICENSE and package metadata. The owner subsequently explicitly authorized Apache-2.0; see the dated follow-up below and LICENSE.md. |
| Readiness percentages overstate evidence | Supported: README advertised near-completion while acknowledging missing live and external evidence. | Removed current percentage/activity scorecards; preserved the old tracker as superseded history. Added scoped implementation/evidence/limitations. |
| Tests/PRs greatly outnumber outside adoption | Activity is not adoption. Star/fork counts are also not a technical-quality metric. The repository does not establish unrelated-product adoption. | Removed activity-as-readiness marketing. No invented users, external pilots or production proof. |
| “Interlingua” overstates the shipped artifact | The current implementation is a constrained semantic IR with rendering/fingerprint machinery, not an established linguistic standard. | Lead with the concrete artifact; retain the long-term vision and historical terminology without representing it as achieved. |
| Human entry path is dominated by agent process | Supported by START_HERE/CONTRIBUTING and mandatory assignment wording. | Added a short visitor path, focused contribution checklist and runnable no-model example. Worker locks and semantic/CI protections remain for managed automation. |
| Sibling-product adapter is not an ecosystem | Supported as an evidence boundary; private/public status of another repo is irrelevant here and was not assumed. | Core demo has no sibling-product dependency; adapter is explicitly reference/shadow only. Independent adoption still needs a real consumer. |
| Need an end-to-end token/task demo | Agreed; not accomplished by documentation or the new supplied-Sem example. | The new example honestly demonstrates only the core path. A future consumer experiment needs named model/tokenizer, natural-text baseline, actual extraction, task quality, costs and failures. |
| Delete half the process | A useful direction, not a safe literal deletion request. | Shortened public entry docs; kept historical evidence and internal concurrency/protected-data safeguards. No extra governance framework was added. |

## License decision at the original correction

No open-source license was selected by the initial public-description correction. MIT, Apache-2.0 and copyleft licenses grant materially different rights and obligations; substituting one was not treated as a wording cleanup.

## Owner-authorized follow-up — 2026-09-14

The owner subsequently explicitly authorized releasing code they own or control under Apache-2.0, including commercial reuse and its patent grant, while preserving third-party terms. [Issue #698](https://github.com/corpunum/OpenLunum/issues/698) records that scope. The complete license is now in [LICENSE](../LICENSE), with [NOTICE](../NOTICE), consistent workspace metadata, package-local copies and [licensing guidance](../LICENSE.md). Existing package versions/private flags, external dataset/model licenses and historical evidence remain unchanged.

This resolves the missing rights grant for the covered original code; it does not establish adoption, semantic accuracy, token savings, or production readiness.

## Validation scope

The added `demo:core` is product-neutral but project-authored. It supplies Sem and demo-scoped IDs, tests identity distinctions and unpromoted natural fallback, and deliberately reports no token or task-quality result. It does not count as independent adoption or a new multilingual extraction benchmark.

No V5-V8 artifact, human-review record, source-only acceptance criterion, schema, frame, fingerprint implementation or protected dataset was changed by this task. Current experimental limitations remain visible in [STATUS](../STATUS.md).
