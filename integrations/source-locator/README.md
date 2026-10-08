# @corpunum/lunum-locator

This package provides optional *source locators* for Lunum. It is an adapter: the core (`@corpunum/lunum`) never imports it. With no locator configured, Lunum behaves exactly as before.

It deliberately sits outside the pnpm workspace and outside `packages/mcp`. Instruction package v18 binds both the bytes of the served runtime (`packages/core/dist`, `packages/mcp/dist`) and the hash of `pnpm-lock.yaml`. An optional diagnostic must not move either of them, so it has no dependencies and imports the built core by relative path.

Build and test it with `pnpm test:locator`, which also runs as part of `pnpm test`.

A source locator answers one question about a literal: does it occur in an indexed corpus, and where? The answer is evidence about the corpus, not about meaning:

- A grounded reference is not thereby true.
- An unverified reference is not thereby false.

Nothing here edits, merges or deletes records.

## Provider contract

```ts
interface SourceLocator {
  readonly name: string;
  exists(literal: string, kind?: ReferenceKind): Promise<ExistsResult>;   // found | not_found | out_of_scope | unavailable, with file:line
  locate(text: string): Promise<LocatedSpan[]>;                           // spans of `text` found in the corpus
  nearDuplicates(text: string, options?): Promise<NearDuplicateCandidate[]>; // trigram-overlap candidates
}
```

`not_found` is only returned after a complete search with a fresh index. Every doubt is `unavailable`: a daemon that is down or slow, a root that is not covered, a stale index, or a truncated listing.

## Pieces

| Export | What it does |
| --- | --- |
| `extractReferences(text)` | Deterministic extraction (`lunum-refs/0.2`) of paths, file names, code identifiers, dotted config keys and semantic versions, with exact offsets. URLs, hashes, numbers and dates are not extracted. |
| `groundText` / `groundDiscourse` | Ground every reference, or every reference per discourse unit (core `analyzeDiscourse`). The report is `lunum-source-grounding/0.1`. Not-found references are labelled `unverified`. |
| `UnumsearchLocator` | Backend that talks to an [unumsearch](https://github.com/corpunum/unumsearch) daemon over its loopback HTTP API. The optional `pathExists` hook grounds absolute paths that the index skips, for example gitignored files. |
| `InMemoryLocator` | Deterministic, offline backend over a fixed document set, for tests and small corpora. |
| `TrigramIndex`, `trigramSet`, `jaccard` | Character-trigram blocking. |
| `nearDuplicateUnits` | Near-verbatim unit candidates across messages, with the core literal gate result attached. |

## MCP: `lunum-locator-mcp`

This is a separate, optional stdio MCP server with one tool, `lunum_ground`. It has no SDK dependency. Register it next to `lunum-mcp`:

```bash
pnpm build && pnpm build:locator
claude mcp add --scope user lunum-locator -- node /path/to/OpenLunum/integrations/source-locator/dist/mcp.js
```

Environment variables:

| Variable | Default |
| --- | --- |
| `LUNUM_LOCATOR` | `unumsearch` |
| `LUNUM_LOCATOR_URL` | `http://127.0.0.1:7781` |
| `LUNUM_LOCATOR_ROOTS` | Colon-separated list; when unset, the roots are derived from `/status` |
| `LUNUM_LOCATOR_TIMEOUT_MS` | `1500` |

Without a reachable daemon, every reference comes back `unavailable` and nothing is flagged.

## Measured status (experiments/source-locator-v1)

| Feature | Result against the bar | Status |
| --- | --- | --- |
| Grounding | Strict precision of unverified flags: 0.40. p95 latency: about 0.3 to 0.5 s per record. Both are below the pre-registered bar. | Diagnostic only. |
| Near-duplicate blocking at Jaccard 0.5 | Precision on real agent messages: 0/50. The pairs were templated lines that differ in IDs or counts. | Not recommended, and not wired anywhere. |

The primitives stay available for exact-text use. Any candidate still has to pass the core literal gate.
