# Lunum Deterministic Pipeline — Qualitative Sanity Check

Date: 2026-07-19/20
Method: `node packages/cli/dist/src/cli.js pipeline --text "<input>" --mode full` (and `--mode parse`) run on 10 diverse hand-picked inputs, reading the raw JSON output by eye.

## Overall verdict (read this first)

**The deterministic CLI pipeline is not doing semantic parsing at all, and the eval metrics built on top of it cannot be trusted as evidence that it is.** For every one of the 10 inputs — a preference, a conditional, a destructive-delete request, a deadline, a question, a request to store an SSN, a multi-clause command chain, a one-word fragment, and a vague sentence — the pipeline produced the *exact same shape* of output:

- `lunumSem.kind` is always `"surface_telegraph"`
- there is always exactly **one** clause
- the predicate is always the literal string `"surface"`
- the one "role" is just the stopword-stripped input text dumped verbatim into a `text` field
- `category` is always `"simple_fact"` and `risk` is always `"low"` — **not because the classifier decided that**, but because those are hardcoded CLI flag defaults (`--category simple_fact --risk low`) that are never derived from the text. Passing `--category command --risk high` explicitly just echoes those values straight back through — proving the "classification" step in `pipeline --mode full` does no classification.
- the "render" step is just `R surface <original sentence, lightly cleaned>` — a near-identity echo, not a structured re-render of extracted roles/predicate/args.

This traces to a real code-level cause, not just bad luck on my 10 examples: in `packages/core/src/derive.ts`, `deriveLunumSidecar()` only builds a real structured record (via `createRecord`, with a proper predicate/role breakdown) **if it is given a pre-built `sem` object as input**. The CLI's `pipeline` command (`packages/cli/src/cli.ts`) never constructs or passes a `sem` — it calls `deriveLunumSidecar({ role, content, category, risk })` with no `sem`, which unconditionally routes into `deriveSurfaceSidecar()`, the stopword-stripping fallback, annotated internally with `"warning": "Heuristic surface record; not language-independent canonical semantics."` So the pipeline as wired is *structurally incapable* of producing real lunum-sem output — this isn't a parser that's just weak on hard cases, there is no parser in this path at all. There is a real, fairly detailed category/risk taxonomy in `packages/core/src/policy-classifier.ts` (preference, conditional_instruction, safety_constraint, command, etc., with sensible typical-risk defaults), but it is dead code as far as the CLI `pipeline` command is concerned — nothing calls it to classify input text.

Any "feature recall" or "exact match" metric computed against this pipeline's output is, at best, measuring how often a fixed stopword-stripping template happens to overlap with a gold answer, and cannot be evidence that the system understands sentence structure, roles, deletion vs. non-deletion, risk, or anything else. **Conclusion: not fundamentally working as a semantic parser in this configuration; the metrics are not trustworthy sanity signals.**

---

## Per-input results

### 1. Simple factual statement — "Test statement"
- Output: `kind=surface_telegraph`, predicate `surface`, role `text="Test statement"`. category=simple_fact, risk=low (both defaults, not derived).
- Rendered: `R surface Test statement`
- **Verdict: Questionable.** Technically harmless since the input already is a simple fact, but the "parse" did nothing beyond echo — no actual predicate/argument extraction to verify against.

### 2. Preference statement — "I prefer tea over coffee"
- Same shape: one `surface` clause, role text = `"i prefer tea over coffee"` (stopwords `-` removed weirdly leaves "over" in, "I" lowercased).
- Expected a real parser to find something like `predicate: prefer, roles: {preferred: tea, dispreferred: coffee}`.
- **Verdict: Broken.** No preference structure extracted whatsoever — "prefer" is just another token in a text blob.

### 3. Conditional instruction — "If the server goes down then restart it automatically"
- `lunumCode`: `"if server goes down then restart automatically"` — one flat clause, no condition/consequence split.
- category classified simple_fact/low risk (default), even though `policy-classifier.ts` defines `conditional_instruction` as a `natural_only` category with `typicalRisk: medium` — that logic is never invoked here.
- **Verdict: Broken.** A conditional automation instruction is exactly the kind of thing you'd want split into antecedent/consequent clauses and flagged non-trivial risk; instead it's an inert text blob tagged low-risk simple fact.

### 4. Destructive/deletion request — "Delete all log files older than 30 days"
- Same flat `surface` clause: `"delete all log files older than 30 days"`.
- category=simple_fact, risk=low (default, not derived) — a destructive filesystem action classified identically to "Test statement".
- **Verdict: Broken, and concerning.** If this pipeline's risk output were ever used for any kind of gating, a mass-delete instruction is indistinguishable from a no-op factual statement.

### 5. Scheduling/deadline statement — "The report is due next Friday at 5pm"
- `lunumCode`: `"report due next friday 5pm"` (stopwords stripped, no date/time normalization, no due-date role extracted).
- **Verdict: Broken.** No temporal entity extraction; "next Friday at 5pm" is just leftover tokens in the blob.

### 6. Question — "What time does the store close"
- `lunumCode`: `"what time store close"`. `kind` still `surface_telegraph` with a `surface` predicate — a question gets the exact same clause shape as a statement or command. No `kind: question` / interrogative marker anywhere, and the stripped "does" (an auxiliary, not in the stopword list oddly kept... actually "does" removed via EN_STOP list? check: EN_STOP includes "does" — yes it's stripped) makes it read like a fragment.
- **Verdict: Broken.** Nothing distinguishes a question from a statement.

### 7. Safety-sensitive / personal data — "Please store my social security number for verification"
- category=simple_fact, risk=low (defaults again). No PII detection, no elevated risk, no `safety_constraint`/`medical_text`-style categorization despite the taxonomy having exactly such categories available.
- `lunumCode`: `"please store my social security number verification"`.
- **Verdict: Broken and the most concerning example.** This is precisely the case where a real system should flag high risk / PII category, and it silently reports "low risk, simple fact," identical to the "Test statement" example.

### 8. Multi-clause complex sentence — "Book a flight to Paris, cancel my hotel reservation, and email me the confirmation"
- Three distinct actions (book, cancel, email) collapse into **one** `surface` clause with a single flattened text blob: `"book flight paris cancel my hotel reservation email me confirmation"`. `clauses: 1` in the realize step.
- **Verdict: Broken.** This is the clearest single-example proof of no real parsing: three imperative actions with clear objects (flight/Paris, hotel reservation, confirmation email) collapse to one undifferentiated bag of words. A genuine semantic parser should produce 3 clauses.

### 9. Very short fragment — "stop"
- `lunumCode`: `"stop"`. Single surface clause. This is one of the only cases where the flat wrapper is arguably "fine" simply because there's nothing to structurally parse in a one-word input.
- **Verdict: Sensible (trivially).** The only test case where the do-nothing behavior isn't actively misleading, purely because the input has no internal structure to lose.

### 10. Ambiguous/vague sentence — "Maybe we should look into that sometime"
- `lunumCode`: `"maybe we should look into sometime"`. category=simple_fact/low risk defaults; the taxonomy has an explicit `ambiguous` category (`typicalRisk: medium`) that goes completely unused.
- **Verdict: Broken.** A textbook case for the `ambiguous` category defined in the codebase's own taxonomy, and it's not applied.

---

## Summary table

| # | Input | kind/predicate | category/risk | Verdict |
|---|---|---|---|---|
| 1 | Test statement | surface_telegraph/surface | simple_fact/low (default) | Questionable |
| 2 | I prefer tea over coffee | surface_telegraph/surface | simple_fact/low (default) | Broken |
| 3 | If server goes down, restart it | surface_telegraph/surface | simple_fact/low (default) | Broken |
| 4 | Delete all log files >30 days | surface_telegraph/surface | simple_fact/low (default) | Broken |
| 5 | Report due next Friday 5pm | surface_telegraph/surface | simple_fact/low (default) | Broken |
| 6 | What time does the store close | surface_telegraph/surface | simple_fact/low (default) | Broken |
| 7 | Please store my SSN | surface_telegraph/surface | simple_fact/low (default) | Broken (safety-critical miss) |
| 8 | Book flight / cancel hotel / email confirm | surface_telegraph/surface (1 clause) | simple_fact/low (default) | Broken |
| 9 | stop | surface_telegraph/surface | simple_fact/low (default) | Sensible (trivial case) |
| 10 | Maybe we should look into that sometime | surface_telegraph/surface | simple_fact/low (default) | Broken |

## Root cause (code-level)

- `packages/cli/src/cli.ts` (pipeline command, around line 485-529): builds `category`/`risk` purely from CLI flags (`flag('category') ?? 'simple_fact'`, `flag('risk') ?? 'low'`), never from any analysis of `inputText`.
- `packages/core/src/derive.ts` `deriveLunumSidecar()`: only produces a real structured `sem` record via `createRecord()` if a `sem` is already supplied by the caller. The CLI pipeline never supplies one, so every call falls through to `deriveSurfaceSidecar()`, which always emits `kind: "surface_telegraph"`, one `surface` clause, and the raw (stopword-filtered) text — and self-labels this in `annotations.warning` as "Heuristic surface record; not language-independent canonical semantics."
- `packages/core/src/policy-classifier.ts` defines a genuinely reasonable taxonomy (preference, conditional_instruction, safety_constraint, command, ambiguous, etc. with sensible typical risk levels) but nothing in the CLI `pipeline` path calls `classifyByCategory`/`classifyContent` on the actual text — it's unused by this entry point.

## Practical implication

Whatever "feature recall" or "exact match" numbers exist for this pipeline are being computed against a fixed identity/stopword-strip transform, not a semantic parse. A destructive delete, a request to store an SSN, and a placeholder test sentence all produce bit-for-bit identical structure (`surface_telegraph` / `surface` / low risk / simple_fact). Before trusting any further metrics from this system, the immediate next step should be wiring the CLI `pipeline` command to actually construct a `sem` object (real predicate/role extraction) and to call the existing `policy-classifier.ts` logic on the input text — both pieces of real logic already exist in the codebase but are simply not connected to this entry point.
