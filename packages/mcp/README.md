# @corpunum/lunum-mcp

An experimental Model Context Protocol server for OpenLunum. The agent interprets source text; this server gives it the extraction contract and the tools that check its proposals. It is not a parser, and passing validation does not mean a proposal is correct.

## Run it in Claude Code

The repository root has a `.mcp.json`. Opening the repository in Claude Code offers the `lunum` server, which starts through `scripts/lunum-mcp-launch.mjs`. The launcher installs dependencies if they are missing and rebuilds core and mcp before serving; `LUNUM_MCP_SKIP_BUILD=1` skips the rebuild.

To use it from another client, run the same launcher:

```json
{ "mcpServers": { "lunum": { "command": "node", "args": ["<repo>/scripts/lunum-mcp-launch.mjs"], "env": { "LUNUM_CONTEXT_MODE": "natural" } } } }
```

## Extraction path

```text
lunum_get_extraction_contract      contract lunum-agent/0.19 (frozen, ADR 0025): wire validation, frames, roles, aliases, abstention rules
  -> agent decides: parse or abstain
  -> lunum_build_candidate         frame-first builder (world, kind, predicate, roles, conditions)
  -> lunum_submit_candidate        validation, then identity or a failureClass with diagnostics
```

`lunum_submit_candidate` withholds identity and returns a `failureClass` for:
- a structural or protocol error;
- a frame violation, including `placeholder_role` and `ambiguous_negated_permission`;
- an ungrounded reference;
- `unretained_source_literal`: a number or identifier from the source that is missing from the candidate.

**A rejection means abstain.** Re-typing a role to get past validation defeats the check. The source text and provenance are kept either way.

## Other tools

| Tool | Purpose |
|---|---|
| `lunum_compile_context` | Build model-facing context from messages. The `mode` argument overrides the server default set by `LUNUM_CONTEXT_MODE` (below). |
| `lunum_validate` | Validate supplied Sem. |
| `lunum_render` | Render with the **default** renderer, `generic-en-pivot/0.1`, which is lossy. The lossless profile is available in core as `renderSem(sem, { profile: LOSSLESS_RENDERER })`, but not through this tool. |
| `lunum_compare` | Feature recall and precision, and hard mismatches, between two Sem objects. |
| `lunum_classify` | Decide whether compact representation is eligible for a content category. |
| `lunum_derive` | Without supplied Sem, this is a **surface** heuristic path. Its output is never semantic and never eligible for identity. |
| `lunum_fingerprint` | Legacy compatibility fingerprint. **Not** the strict `lfp:2.1` identity that submission issues. |
| `lunum_eval_next`, `lunum_eval_submit` | Blind-evaluation tools, exposed only on a configured evaluator path. |

The definitions are in [src/tools.ts](src/tools.ts), and the metadata in [src/mcp-contract.ts](src/mcp-contract.ts).

## Context modes (`LUNUM_CONTEXT_MODE`)

| Mode | What the model sees | Evidence |
|---|---|---|
| `natural` (default) | Source text | Baseline |
| `identity_dedup` | Source text, with later messages that carry the same core-issued identity dropped | About −60% tokens on a self-built memory QA set. Sonnet 20/20; Haiku 1 error in 5 of 9 runs (decisions/0012, 0013) |
| `lunum`, `mixed`, `shadow_mixed` | Lunum-Code rendering, all or partly | The default renderer 0.1 loses answers (decisions/0009). Not recommended. |

## Handoff appendix (`lunum-handoff-appendix`)

Headless command that turns a transcript into a facts appendix of at most 3.5k tokens (hard cap, 4 bytes per token, so 14,000 bytes) to sit beside a hand-written handoff index. No MCP transport, no prompts, no network, no model calls.

```bash
node dist/bin/lunum-handoff-appendix.js --in session.jsonl --out appendix.md [--max-tokens 3500]
```

- Input: a Claude Code `.jsonl` transcript (user and assistant text only; tool calls, tool results, attachments and system reminders are skipped) or a JSON messages array `[{role, content}]`.
- Output: a 3-line header (source, generated time in Z, token estimate), then bullets under Decisions, Open items, Numbers and ids, Paths and Pending. Selection is regex-based and deterministic; it keeps the most recent and most specific lines and drops prose. It is a heuristic and can miss facts or keep noise.
- Redaction of API-key-like strings, bearer and JWT tokens, `key=value` secrets, URL credentials, long opaque tokens and email addresses is built in.
- Exit code 0 on success, 1 on any error (message on stderr). On success one JSON stats line goes to stdout.

## Test

```bash
pnpm build
pnpm --filter @corpunum/lunum-mcp test:unit   # includes a real stdio handshake test
```

Passing interface tests do not establish client compatibility, storage durability, extraction quality or production security. The [repository license](../../LICENSE.md) applies.
