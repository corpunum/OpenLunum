# Core module audit, 2026-10-16

**Question:** which `packages/core/src` modules are used by anything real, and are the unused ones dead, or worth keeping for later?

**Method:** [`scripts/research/core-module-audit.mjs`](../../../../scripts/research/core-module-audit.mjs). The output is [audit.json](audit.json). It is reproducible with:

```sh
node scripts/research/core-module-audit.mjs <openunum checkout> > audit.json
```

The script works as follows:
- **Consumers:**
  - OpenLunum's other packages (`src` and `bin` of mcp, cli, api, eval and adapter-openunum);
  - `examples/`, `integrations/` and `scripts/`;
  - **OpenUnum at `cd05edd`**, which vendors the core build under `src/memory/lunum-core/`.

  Tests are counted separately.
- **Imports through the index** are resolved by exported name. A file that loads the index also counts every distinctive exported name (8 or more characters) appearing in it. This over-counts use on purpose: the costly mistake would be calling live code dead.
- **The core-internal import graph** is then followed transitively.

## Result

| | Modules | Lines |
|---|---|---|
| Core total | 85 | 26,578 |
| Reached by a product path, a script or OpenUnum | 47 | 13,483 |
| **Reached only by their own tests** | **38** | **13,095 (49%)** |
| Reached by nothing, not even tests | 1 (`types-schema-conformance`, a compile-time type check, so this is by design) | 74 |

The review's "46 modules / 57%" figure ([review](../../../independent-evaluation/2026-10-16-fable-review/REPORT.md) §3g) over-counts by 8 modules. Those 8 are reached only through the core index, or only by scripts.

**No module is used only by OpenUnum.** OpenUnum uses 23 core modules. All of them are also used inside OpenLunum.

`packages/core` is `"private": true` and not published, so moving modules out affects no npm user. OpenUnum, the only external consumer, uses none of the 38.

## Are the 38 dead?

Not all of them. Most were written to satisfy readiness-scorecard items (the `R…` numbers in their headers) before there was a consumer. Each module was read and placed in one of three groups:

### Keep in core: 17 modules, 5,986 lines

These have a near-term consumer under the current plan.

| Modules | Why keep |
|---|---|
| `identity-migration`, `fingerprint-contract`, `fingerprint-support-contract` | [The v17 report](../../../independent-evaluation/2026-10-07-round2-v17-live/REPORT.md) shows identities split on `kind` and term-type labels. The likely fix is a fingerprint change, which needs exactly this migration and contract tooling. |
| `context-eligibility`, `context-mode-selector`, `hard-gates`, `compaction-gates`, `human-review-policy`, `safety-review-policy` | Gating which records may be served compactly. This is the decision any OpenUnum compaction needs, and today it is hand-wired. |
| `rollback-process`, `retention-fallback-rollback` | Reverting to source text when a record fails: the "refuse and keep the source" principle. |
| `correction-telemetry`, `observability` | Needed as soon as a real product loop exists (the review's step 6). |
| `llama-tokenizer`, `tokenizer-measurement`, `context-measurement` | Token measurement for local models, which OpenUnum runs. |
| `types-schema-conformance` | A compile-time check; "unused" by design. |

### Move to an experimental package: 15 modules, 5,381 lines

These are plausible later, but there is no plan to use them in the next 4–6 weeks.

| Modules | What they are |
|---|---|
| `token-atlas`, `token-optimization`, `token-optimization-compat`, `model-renderer-profiles`, `profile-selector`, `native-model`, `threshold-calibration` | Renderer profiles and token optimization for Lunum-Code. Renderer 0.1 is lossy and Lunum-Code costs more than natural text per fact (decisions/0012), so these wait on a renderer worth optimizing. |
| `agent-state-freeze`, `-retention`, `-tamper-evidence`, `-idempotency`, `agent-interop`, `workflow-audit`, `backup-restore` | Extensions of the agent-state protocol. The base `agent-state` is used; these extensions are not. They become useful if OpenUnum adopts agent-state. |
| `multilingual-memory-pilot` | A simulation, not a measurement. Its tests are worth keeping as Unicode fixtures. |

### Archive: 6 modules, 1,728 lines

These are out of scope for a library core.

| Modules | Why |
|---|---|
| `tenant-isolation`, `supply-chain`, `release-governance`, `release-provenance`, `support-contract`, `compatibility-matrix` | Product, release and security policy for a multi-tenant service that does not exist. `supply-chain` overlaps with `packages/eval/src/supply-chain-audit.ts`. |

## Recommendation

1. Moving them is a separate change.
2. Create `packages/core-experimental` (private) and move the 15, together with their tests.
3. Move the 6 to `research/archive/core-scaffold-2026-10/`, together with their tests, and keep them byte-identical.
4. Remove their exports from the core index. Run `pnpm verify` and confirm the 23 OpenUnum-used modules are untouched.

This audit moves nothing. It establishes that moving is safe.

## Limits

- The import resolution is regex-based, not a TypeScript program. It is biased toward over-counting use.
- OpenUnum was checked at one commit (`cd05edd`). Other products that copy the core would not be seen.
- The "keep / move / archive" grouping is a judgement by the authoring agent (self-reviewed). The owner should confirm it.
