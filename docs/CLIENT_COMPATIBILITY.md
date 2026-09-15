# OpenLunum client compatibility evidence

This is project-authored interoperability evidence for the exact clients and server
build tested below. It is not evidence of outside adoption, semantic extraction
quality, token savings, or task-quality improvement.

## Shared deterministic server

Build the same checkout before testing:

    pnpm --filter @corpunum/lunum build
    pnpm --filter @corpunum/lunum-mcp build

The stdio command is:

    node /home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js

The recorded client runs used that canonical checkout path. For replay, replace
the path with the absolute path of the checkout just built. The report binds
the source implementation and candidate commits and records the SHA-256 of the
built server; the clean publication checkout independently produced the same
artifact hash. Verification is recorded in
reports/compatibility/2026-09-15/verification.json.
The published evidence is bound to the immutable ref
`compatibility-2026-09-15-candidate`, which resolves to the exact evidence
checkout after publication.

The current server exposes ten tools:

    lunum_derive
    lunum_get_extraction_contract
    lunum_submit_candidate
    lunum_build_candidate
    lunum_compile_context
    lunum_fingerprint
    lunum_validate
    lunum_render
    lunum_compare
    lunum_classify

The supplied deterministic fixture used for conformance is:

    {
      "world": "real",
      "kind": "preference",
      "predicate": "prefer",
      "roles": {
        "experiencer": {"type": "actor", "id": "maria"},
        "theme": {"type": "concept", "id": "quiet_mode"}
      }
    }

A successful run must show protocol tool-call evidence for contract retrieval,
frame building, candidate submission, and explicit abstention. The candidate
submission must remain promotable=false and trust.promoted=false. A mutation
that changes only clauses[0].negated to true must report the negation-flip hard
invariant. Malformed and forged provenance must be rejected by the server.

## Tested client matrix

| Client | Version | Requested model | Observed model/route | Discovery | Tool execution | Result |
|---|---|---|---|---|---|---|
| Codex CLI | 0.154.0 | gpt-5.6-luna | gpt-5.6-luna, OpenAI, ChatGPT login | PASS | PASS | MCP_PASS |
| Claude Code | 2.1.270 | claude-sonnet-4-6 | claude-sonnet-4-6, first-party, Claude.ai Pro | PASS | PASS | MCP_PASS |
| AGY | 1.2.2 standalone | claude-sonnet-4-6 | claude-sonnet-4-6 reported by init | PASS | NOT_RUN | headless MCP permission denied |
| Gemini CLI | 0.45.1 | none | none | PASS | NOT_RUN | Code Assist individual tier unsupported |

agy is a distinct standalone ELF executable, not an alias to gemini. Model
catalog access is not quota proof. No tested client exposed a reliable quota
balance; unknown cost is not treated as zero.

## Codex CLI

Minimal user configuration (merge this entry; do not replace the file):

    [mcp_servers.lunum]
    command = "node"
    args = ["/absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"]

    [mcp_servers.lunum.env]
    LUNUM_COMPACTION = "off"
    LUNUM_MULTILINGUAL = "off"
    LUNUM_CONTEXT_MODE = "natural"

Verify the registration:

    codex mcp list --json

The bounded noninteractive test used a temporary directory:

    codex exec --ephemeral --skip-git-repo-check --cd <temporary-directory> \
      --approve-for-me --model gpt-5.6-luna --json '<fixture conformance prompt>'

The existing global configuration had approval_policy="never"; that caused
MCP calls to fail because they require approval. approve-for-me was scoped to
this invocation and was used with a prompt that prohibited shell, filesystem,
network, and all tools except the named Lunum MCP tools. This is not a
recommendation to disable approval globally.

Expected interaction: Codex emits mcp_tool_call events whose server is lunum;
the server returns the contract, candidate, contained submission, abstention,
hard negation mismatch, and malformed-input error. The run used --ephemeral
and a temporary directory; no user configuration was changed.

Known limitation: Codex 0.154.0 has no project-scoped add flag in the tested
help output, so codex mcp add writes global configuration. This evidence is
limited to this version, route, model, and supplied-Sem fixture.

The repository-wide `pnpm verify` was attempted for this candidate but four
dispatcher tests collided on the repository's global lock. The same dispatcher
test passed 14/14 when run serially; this is recorded as a baseline limitation,
not treated as a green full gate.

## Claude Code

Minimal ephemeral configuration:

    {"mcpServers":{"lunum":{"command":"node","args":["/absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"]}}}

The tested command shape was:

    claude -p --verbose --strict-mcp-config \
      --mcp-config '<the JSON configuration above>' \
      --model claude-sonnet-4-6 --max-turns 8 \
      --allowed-tools mcp__lunum__lunum_get_extraction_contract \
        mcp__lunum__lunum_build_candidate \
        mcp__lunum__lunum_submit_candidate \
        mcp__lunum__lunum_compare \
      --output-format stream-json --no-session-persistence \
      '<fixture conformance prompt>'

Expected interaction: the init event reports the lunum server connected;
assistant events contain mcp__lunum__ tool uses and tool-result events contain
OpenLunum responses. The strict inline config and no-session-persistence
prevented changes to the existing global settings.

Known limitations: Claude may defer MCP schemas through ToolSearch and may
reorder independent calls. The preserved native Claude stream contains no
malformed `lunum_submit_candidate` tool-use event, so the older manifest's
`malformedRejected=false` is `NOT_TESTED`, not a server acceptance or a
proven client failure. The run proves this named version and model only.

## AGY

The temporary registration commands were:

    agy mcp add compat node \
      /home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js
    agy mcp list
    agy mcp remove compat

The tested model command was:

    agy --model <authorized-model-id> --mode plan \
      --output-format stream-json --print-timeout 4m \
      --print='<fixture conformance prompt>'

AGY initialization and cached per-tool schemas established discovery. The
actual call_mcp_tool reached the Lunum tool name but was denied by AGY's
interactive MCP permission gate in headless mode. Tool execution is therefore
NOT_RUN, not MCP_PASS. The dangerous permission-bypass flag was not used.
An effort=low variant was rejected before a model turn because the selected
model did not support that setting. The temporary named registration was
removed. A fresh audit of AGY 1.2.2 found no safe project-scoped permission
configuration for the registered server: `agy models` requires sign-in, and
headless MCP calls are soft-denied when not explicitly permitted. The
supported broad bypass was deliberately not used. Consequently this report
does not claim an AGY model execution or a Gemini model identity; an
authenticated entitlement plus narrow `mcp(<server>/<tool>)` allow rules must
be established before rerunning.

## Gemini CLI

The isolated project configuration shape was:

    {"mcpServers":{"compat":{"command":"node","args":["/absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"],"trust":true}}}

The tested setup was:

    gemini mcp add --scope project --trust compat node \
      /home/corpunum/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js
    GEMINI_CLI_TRUST_WORKSPACE=true gemini mcp list

Discovery was observed as Connected. The installed client then reported that
Gemini Code Assist for individuals is no longer supported and directed
migration to Antigravity; no model call was attempted. Tool execution is
NOT_RUN. The disposable project configuration was deleted after the test.

## Separate supplied-Sem sanity check

The public lunum_derive path was run separately with a supplied Sem alongside
Maria prefers quiet mode. It returned:

    success: true
    semantic: true
    renderer: generic-en-pivot/0.1
    fingerprint: lfp:0.1:sha256:ac441713f7fbf7c0d02e75058a150c67
    code: R prefer maria quiet_mode

This only checks deterministic handling of caller-supplied Sem. It does not
test automatic extraction, token savings, or task-quality improvement.

## Evidence and semantic boundary

Nonsecret commands, identities, outcomes, and selected protocol evidence are
persisted under reports/compatibility/2026-09-15/. The deterministic
child-process test is packages/mcp/test/stdio-compatibility.test.mjs.
These are development interoperability evidence, not protected semantic
evaluation data. V8 and issue #685 remain diagnostic; compatibility PASS does
not certify multilingual meaning.

The stdio test is also part of the normal `@corpunum/lunum-mcp` `test:unit`
script. Its current wiring and cleanup verification are recorded in
reports/compatibility/2026-09-15/stdio-wiring-verification.json.

## Diagnostic source-only comparison (2026-09-15)

The bounded comparison is recorded separately under
`reports/diagnostic/2026-09-15/`. It is explicitly
`DIAGNOSTIC DEVELOPMENT COMPARISON — NOT #685 QUALIFICATION` and does not
provide the missing human/native English review.

The initial captured streams are retained but excluded because V8 froze
`lunum-agent/0.2` while the tested server returned `lunum-agent/0.3`.
`client-run-v3/freeze-manifest.json` was committed before extraction and
freezes the exact returned contract hash
(`e17e3f702eb1a0b459b02ea0cb169ef92c9b27fe287d70d5d340a0b92c30d782`). The
same eight source-only items, V8 target subset,
client settings, one-attempt policy, and prompt-level isolation were used for
Codex and Claude; no repair pass was run. Native event streams, tool-call
evidence, ledgers, usage summaries, and mechanically generated scorer results
are retained in that directory.

The committed v3 run had no missing or malformed ledger entries. Codex
returned four parse candidates and four explicit abstentions; both abstention
targets were false parses. Claude returned eight parse candidates, so both
abstention targets were false parses. Source-relative matches were zero for
both clients; exact identity had a denominator of zero for Codex and three for
Claude, with zero exact matches. The obligation-versus-permission contrast was
fully available and distinct for Claude, but unavailable for Codex because of
missing endpoint outputs. These are small development diagnostics, not a
client or model ranking.

Official command references consulted:
- https://github.com/openai/codex/blob/main/codex-rs/docs/config.md
- https://geminicli.com/docs/tools/mcp-server/
- https://docs.anthropic.com/en/docs/claude-code/cli-usage

## Offline native-event replay

The committed native-event transformer is `scripts/research/replay-client-events.mjs`.
Reproduce the v3 audit without cloud access with:

    node scripts/research/replay-client-events.mjs

It reads the retained Codex and Claude JSONL streams and writes the new,
versioned `reports/diagnostic/2026-09-15/replay-v1/replay-ledger.json`.
Native event IDs are joined once; started/completed pairs, rejected
non-null submissions, explicit null submissions, builder fallbacks, accepted
Sem, and expected-versus-submitted source hashes remain separate. Historical
ledgers are not modified.

The v3 task-convention delivery was not proven by the historical streams. The
next extraction must deliver and hash
`experiments/natural-development-v8/extraction/public-instruction-package-v1.json`,
which is tested for core/task/scorer hash integrity and contains no gold.
