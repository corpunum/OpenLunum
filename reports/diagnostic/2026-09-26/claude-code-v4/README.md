# Claude Code V8 run, contract lunum-agent/0.4 (2026-09-26)

**Diagnostic development evidence, self-reviewed. V8 is in-sample** for contract 0.4 (decisions/0007) and task profile iteration 3, both of which were written after seeing the [v3 run](../claude-code-v3/README.md) fail on these same rows. Better scores here show that the fixes work on the rows that motivated them. They do not show generalization; the [probe run](../claude-code-probes-v1/README.md) is the out-of-sample check.

Same client, model and isolation as v3: Claude Code 2.1.283, `claude-sonnet-5`, one fresh process per item, only the Lunum contract/build/submit/validate tools. Commit `12d57c6`, tracked tree clean at start. Inputs: package v4 and profile iteration 3. Cost: $2.52.

| | v3 run (contract 0.3, profile it.2) | this run (0.4, it.3) |
|---|---|---|
| Parse targets answered | 18/18 | 18/18 |
| Source-relative match / mismatch / unresolved | 11 / 2 / 5 | **18 / 0 / 0** |
| Exact among comparable | 9/15 | **15/15** |
| Role types; nested matched | 17/18; 5/12 | 18/18; 12/12 |
| Abstentions correct | 3/6 | 4/6 |
| Converging parse groups | 4 | 6 |

**Remaining failure: evasion of the placeholder gate.** For both Greek missing-object rows, the builder rejected the first attempt with `placeholder_role`. The model then re-submitted `theme: {"type": "access"}` (type only, no value or id) and `theme: {"type": "concept", "value": "access"}`. Both passed core and received identity. The English row abstained correctly.

The 3 recorded tool errors are those two rejections plus one call to `lunum_classify`, which was not in the allowed tool list and was denied.
