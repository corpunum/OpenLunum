# @corpunum/lunum-mcp

Experimental Model Context Protocol surface for OpenLunum. The cognitive agent interprets source text; MCP exposes the contract and candidate-validation tools. It does not supply a pretrained universal parser.

## Agent path

```text
lunum_get_extraction_contract
  -> agent proposes frame/roles
  -> lunum_build_candidate
  -> lunum_submit_candidate
  -> validation/identity diagnostics; candidate remains untrusted
```

Current tools are defined in [src/tools.ts](src/tools.ts), with metadata in [src/mcp-contract.ts](src/mcp-contract.ts). They include the contract/builder/submission tools above, `lunum_derive`, `lunum_compile_context`, `lunum_fingerprint`, `lunum_validate`, `lunum_render`, `lunum_compare`, and `lunum_classify`. Blind-evaluation tools are exposed only through their configured evaluator path.

`lunum_derive` without supplied Sem is a **surface** path. `lunum_fingerprint` is the legacy compatibility operation; do not mistake it for current strict candidate semantic identity. Validation does not establish that a candidate matches its source.

The former README list of `lunum_parse`, `lunum_realize` and `lunum_retrieve` was not an accurate inventory of the active tools. Use the executable definitions, not historical feature lists.

## Inspect and build

From the repository root:

```bash
pnpm build
pnpm --filter @corpunum/lunum-mcp test:unit
```

Inspect [bin/lunum-mcp.ts](bin/lunum-mcp.ts) and the client configuration before starting the server. Do not infer client compatibility, storage durability, extraction quality or production security from passing interface tests.

The [repository license](../../LICENSE.md) applies. The [no-model core demo](../../examples/structured-record-demo.mjs) does not require an MCP client or OpenUnum.
