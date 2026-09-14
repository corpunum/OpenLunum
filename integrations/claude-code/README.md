# Claude Code integration — Lunum MCP server

**Status:** Working — MCP server with stdio transport, 7 real tools, tested.

## Setup

The repo ships a `.mcp.json` at the project root. When you start Claude Code inside the OpenLunum directory, it auto-discovers the MCP server and registers all 7 `lunum_*` tools.

```json
{
  "mcpServers": {
    "lunum": {
      "command": "node",
      "args": ["./packages/mcp/dist/bin/lunum-mcp.js"],
      "env": {
        "LUNUM_COMPACTION": "auto",
        "LUNUM_MULTILINGUAL": "off",
        "LUNUM_CONTEXT_MODE": "mixed"
      }
    }
  }
}
```

Prerequisites: `pnpm install && pnpm build` (or at minimum `pnpm --filter @corpunum/lunum --filter @corpunum/lunum-mcp build`).

For global install (any repo, not just OpenLunum), add the server to `~/.claude.json`:

```json
{
  "mcpServers": {
    "lunum": {
      "command": "node",
      "args": ["/absolute/path/to/OpenLunum/packages/mcp/dist/bin/lunum-mcp.js"]
    }
  }
}
```

## Configuration

All options can be set via env vars in `.mcp.json` or a shared config file at `~/.config/lunum/config.json`.

| Env var | Values | Default | Purpose |
|---|---|---|---|
| `LUNUM_COMPACTION` | `on`, `off`, `auto` | `auto` | Enable/disable surface telegraph compaction |
| `LUNUM_MULTILINGUAL` | `on`, `off` | `off` | Enable multilingual support |
| `LUNUM_CONTEXT_MODE` | `natural`, `lunum`, `mixed`, `shadow_mixed` | `mixed` | Context compilation mode |
| `LUNUM_MAX_CONTEXT_ITEMS` | integer | `1000` | Max items in the context manager |

Each tool also accepts per-call overrides via its arguments.

## Tools

### `lunum_derive`

Derive a Lunum sidecar from input text. This is the main entry point — give it text, get back a semantic representation, fingerprint, compact code, and policy classification.

Without a pre-parsed Sem, it uses **surface telegraph** (heuristic stopword removal, no LLM needed, instant). Typical savings: ~22% character reduction (range 12–50% depending on content density).

**When to use:** Whenever you want to create a Lunum representation of text — for compaction, fingerprinting, or downstream comparison.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Source text to derive from |
| `role` | string | no | Message role: `user`, `assistant`, `system` (default: `user`) |
| `category` | string | no | Content category for policy classification (e.g., `factual_claim`, `instruction`) |
| `sem` | object | no | Pre-parsed Lunum-Sem; if provided, uses full semantic path instead of surface telegraph |

**Example input:**
```json
{ "text": "The cat sat on the mat" }
```

**Example output:**
```json
{
  "success": true,
  "sidecar": {
    "lunumCode": "cat sat mat",
    "lunumSem": { "schema": "lunum-sem/0.1-draft", "kind": "surface_telegraph", "world": "real", "clauses": [...] },
    "lunumFp": "lsf:0.1:sha256:9ac66dfb23e682b5675f1397",
    "lunumMeta": { "eligible": false, "semantic": false, "renderer": "surface-telegraph/0.1", "sourceChars": 22, "codeChars": 11 }
  }
}
```

---

### `lunum_compile_context`

Compile an array of conversation messages into compacted context with token counts and savings estimates. Supports four modes that control how messages are rendered.

**When to use:** When you want to measure or apply context compaction across a conversation history. Useful for understanding how much context budget Lunum saves.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `messages` | array | yes | Array of `{ role, content }` message objects. Can include optional `lunum_code` and `lunum_meta` fields for pre-derived Lunum content. |
| `mode` | string | no | `natural` (original text only), `lunum` (compact code only), `mixed` (eligible items use code, rest use natural), `shadow_mixed` (natural output but measures mixed savings). Default from config. |

**Example input:**
```json
{
  "messages": [
    { "role": "user", "content": "Explain how photosynthesis works in plants" },
    { "role": "assistant", "content": "Photosynthesis is the process by which plants convert sunlight into energy" }
  ],
  "mode": "mixed"
}
```

**Example output:**
```json
{
  "success": true,
  "mode": "mixed",
  "naturalTokens": 28,
  "lunumTokens": 28,
  "mixedTokens": 28,
  "selectedTokens": 28,
  "ratio": 1,
  "estimatedSavings": "0.0%",
  "messageCount": 2
}
```

Note: savings increase when messages include pre-derived `lunum_code` from `lunum_derive`.

---

### `lunum_fingerprint`

Generate a deterministic semantic fingerprint for a Lunum-Sem object. Identical meaning always produces the same fingerprint — useful for deduplication, caching, and cross-session retrieval.

**When to use:** When you need a stable identity for a piece of semantic content. Two independently parsed but semantically identical inputs produce the same fingerprint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sem` | object | yes | Lunum-Sem object to fingerprint |
| `length` | number | no | Digest length in hex characters (16–64, default 32) |

**Example input:**
```json
{
  "sem": {
    "schema": "lunum-sem/0.1-draft",
    "world": "real",
    "kind": "factual_claim",
    "clauses": [{ "predicate": "state", "roles": { "theme": "sky", "attribute": "blue" }, "negated": false }]
  }
}
```

**Example output:**
```json
{
  "success": true,
  "fingerprint": "lfp:0.1:sha256:a1b2c3d4e5f6789012345678"
}
```

---

### `lunum_validate`

Validate a Lunum-Sem object against the frozen schema. Returns whether the object is valid and a list of specific errors if not.

**When to use:** Before passing a Sem to other tools (fingerprint, render, compare) to catch structural issues early.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sem` | object | yes | Lunum-Sem object to validate |

**Example input:**
```json
{
  "sem": {
    "schema": "lunum-sem/0.1-draft",
    "world": "real",
    "kind": "factual_claim",
    "clauses": [{ "predicate": "state", "roles": { "theme": "sky" }, "negated": false }]
  }
}
```

**Example output (valid):**
```json
{ "success": true, "valid": true, "errors": [] }
```

**Example output (invalid):**
```json
{ "success": true, "valid": false, "errors": ["world is required", "clauses must be a non-empty array"] }
```

---

### `lunum_render`

Render a Lunum-Sem to a compact code string using the default renderer profile. The output is a human-readable but compressed representation.

**When to use:** When you have a valid Sem and want to see or store its compact textual rendering.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sem` | object | yes | Lunum-Sem object to render |

**Example input:**
```json
{
  "sem": {
    "schema": "lunum-sem/0.1-draft",
    "world": "real",
    "kind": "factual_claim",
    "clauses": [{ "predicate": "state", "roles": { "theme": "sky", "attribute": "blue" }, "negated": false }]
  }
}
```

**Example output:**
```json
{
  "success": true,
  "profile": "compact/0.1",
  "code": "R state sky blue",
  "semantic": true
}
```

---

### `lunum_compare`

Compare two Lunum-Sem objects and return detailed metrics: feature recall, precision, missing/extra features, exact match status, and hard-mismatch detection.

**When to use:** When you need to verify semantic equivalence between two representations — e.g., checking if a parse-back preserved meaning, or if two translations express the same thing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `expected` | object | yes | Reference (gold standard) Lunum-Sem |
| `actual` | object | yes | Lunum-Sem to compare against the reference |
| `explain` | boolean | no | Include detailed explanation with reasoning (default: false) |

**Example input:**
```json
{
  "expected": {
    "schema": "lunum-sem/0.1-draft", "world": "real", "kind": "factual_claim",
    "clauses": [{ "predicate": "state", "roles": { "theme": "sky", "attribute": "blue" }, "negated": false }]
  },
  "actual": {
    "schema": "lunum-sem/0.1-draft", "world": "real", "kind": "factual_claim",
    "clauses": [{ "predicate": "state", "roles": { "theme": "sky", "attribute": "blue" }, "negated": false }]
  },
  "explain": true
}
```

**Example output:**
```json
{
  "success": true,
  "comparison": {
    "exactFingerprint": true,
    "exactCanonical": true,
    "featureRecall": 1,
    "featurePrecision": 1,
    "missingFeatures": [],
    "extraFeatures": [],
    "hardMismatch": false
  }
}
```

---

### `lunum_classify`

Classify content by category and return an eligibility decision — whether Lunum compact representation is safe to use for this content, based on the safety policy.

**When to use:** Before deciding to compact or render content. Some categories (safety-critical, medical, legal) may require natural-language fallback rather than compact representation.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | yes | Content category: `factual_claim`, `instruction`, `opinion`, `question`, `greeting`, `code_snippet`, etc. |
| `confidence` | number | no | Parse confidence 0–1 (default: 0.5) |
| `sourceText` | string | no | Original source text for additional context |
| `semantic` | boolean | no | Whether the input was semantically parsed vs surface heuristic (default: false) |

**Example input:**
```json
{ "category": "factual_claim", "confidence": 0.95, "semantic": true }
```

**Example output:**
```json
{
  "success": true,
  "decision": {
    "eligible": true,
    "category": "factual_claim",
    "risk": "low",
    "confidence": 0.95,
    "reasons": []
  }
}
```

---

## Future integrations

The same MCP server works with any tool that supports MCP over stdio. Planned integrations:

| Tool | Path | Status |
|---|---|---|
| **Claude Code** | Native MCP via `.mcp.json` | **Working** |
| **OpenClaw** | MCP bridge + native plugin | Planned |
| **OpenUnum** | Product adapter (existing) + MCP | Planned |
| **OpenCode** | Via OpenClaw MCP bridge | Planned |
| **Pi / Agy** | Native `defineTool` extension (not MCP) | Planned |
| **Codex** | Via OpenClaw MCP bridge | Planned |
