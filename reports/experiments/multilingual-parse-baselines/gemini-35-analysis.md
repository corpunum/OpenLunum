# Multilingual Parse Baseline Analysis: Nemotron-120B NIM

## Failure Mode Analysis

Analysis of `parse-summary.json` and `cross-language-report.md` reveals three primary failure modes across English, Greek, Spanish, and Indonesian:

1. **`conditional_instruction` Failures (4 items)**: The model misclassifies item `kind` as `instruction` or `conditional` rather than `conditional_instruction`. Additionally, it omits or flattens structured condition sub-clauses (`predicate: below`, `subject: battery_level`, `value: 20`) into single concept strings or out-of-schema `annotation` fields.
2. **`safety_constraint` Failures (3 items)**: The model defaults to `obligation` instead of `safety_constraint` and collapses nested confirmation conditions into flattened concept IDs (e.g., `id: user_confirmed`) rather than structured nested clause predicates (`predicate: confirmed`, `agent: user`).
3. **`project_state` Failures (3 items)**: The model misidentifies `kind` as `statement` instead of `project_state` and converts ISO date values into snake_case object IDs (e.g., `date_2026_09_30`) instead of preserving literal date strings (`2026-09-30`).

---

## Recommended Parse Prompt Improvements

To address these systematic errors, the parsing prompt should be updated with:

1. **Explicit `kind` Taxonomy**: Provide an exhaustive enum of valid `kind` values (`conditional_instruction`, `safety_constraint`, `project_state`, `preference`) alongside precise trigger definitions and negative examples (disallowing generic terms like `instruction` or `obligation`).
2. **Structured Condition Schema & Few-Shot Examples**: Add explicit JSON schema rules and few-shot demonstrations showing how to structure nested condition clauses (`condition.0` with `predicate`, `subject`, `value`, `negated: false`) rather than flattening them into string IDs or top-level annotations.
3. **Literal Value Guidelines**: Clarify role value formatting, explicitly instructing the model to preserve literal ISO dates (`YYYY-MM-DD`) and numerical values rather than converting them into `lower_snake_case` identifiers.
4. **Strict Output Guardrails**: Enforce strict JSON output with zero preamble to prevent formatting syntax errors and generation timeouts.
