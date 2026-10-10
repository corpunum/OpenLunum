# ADR 0024: General source-bound frames for ordinary statements

**Status:** Implemented 2026-10-10 and self-reviewed by the Claude Code agent
(model `claude-opus-5-5`). There has been no human or native-speaker review.

| Component | Version |
| --- | --- |
| Protocol | `lunum-protocol/0.6` |
| Frames | `lunum-frame/0.8` |
| Agent contract | `lunum-agent/0.19` |
| Instructions | `agent-extraction-instructions/0.9` |
| Instruction package | v22 |
| Identity | `lfp:2.1` (unchanged) |
| Transport schema | unchanged |

## Problem

Through contract 0.18 a sentence could receive an identity only if it was one
of 39 operational predicates (`restart`, `deploy`, `allow`, `below`, ...).
Ordinary text such as "OpenUnum is a local-first agent framework.", "The main
model has 128 GB of unified memory." or "OpenUnum runs on your own hardware."
has no such predicate, so every such sentence abstained. A real website is
about 99.7% such text: the downstream corpunum.com integration measured 0.10%
of text units as Lunum before this change.

The obvious fix, one frame per verb, does not scale and would be an ontology
(the registry says it is not). The opposite fix, a free-form frame, would let a
candidate name any sentence at all.

## Decision

**Seven general predicates**, each with typed slots. Their slots hold the words
of the source, not a closed vocabulary:

| Predicate | Required | Optional | Shape |
| --- | --- | --- | --- |
| `define` | `subject`, `definition` | `scope` | X is a Y; X means Y |
| `describe` | `subject`, `attribute` | `scope`, `location`, `reason`, `duration` | X is fast; X has 128 GB |
| `assert` | `action` (verb phrase, never only is/are) and one of `subject`/`object` | `recipient`, `instrument`, `location`, `source`, `destination`, `manner`, `reason`, `purpose`, `scope`, `duration`, `result` | X runs on Y; imperatives omit the subject |
| `relate` | `subject`, `relation`, `object` | `scope` | X is part of Y; X is faster than Y |
| `enumerate` | `items` (array of at least two terms) | `subject` | a list, with an optional label |
| `quantify` | `subject`, `amount` (quantity, measure, range or date term) | `scope` | a stated amount with its unit |
| `topic` | `subject` | | a heading, label or title that makes no statement; a bare number or date shown on its own; a question that only poses itself |

Adjuncts shared by `define`, `describe`, `assert` and `relate`: `scope`,
`location`, `reason`, `purpose`, `condition`, `manner`, `result`, `duration` and
`connective` (the discourse word that introduces the clause: But, So, However).
A subordinate clause is kept whole, as words, in the adjunct it plays; it is
not parsed further.

**Compound sentences.** The builder takes `also`: up to three further root
clauses of the same statement, for independent clauses joined by "and" or only
by punctuation. World and kind are shared; clause order is significant.

Protocol 0.6 adds the seven predicates and the roles `relation`, `attribute`,
`definition`, `items` and `connective`. `ROLE_ORDER` (rendering) gains those new roles at the
end; existing roles keep their order, so existing renders are byte-identical.

**Source-bound check** (`packages/core/src/source-bound.ts`, new gate in
`submitCandidate`, failure class `unbound_source_content`). Open slots need a
deterministic anchor, so a Sem that uses a general predicate must be bound to
its source text:

1. every filler (a term's `value`, `id` or `unit` string) occurs in the source
   as a contiguous run of words (case, punctuation and markdown aside);
2. a filler that is only a pronoun (`it`, `this`, `they`, ...) is refused;
3. when every clause is a general frame, every word of the source not covered
   by a filler must be one the frame carries itself: articles, `is/are/was/
   were/be`, `do/does/did`, the prepositions `of in on at by for from to with
   as`, and `and`; digit tokens (literal retention owns numbers); a negation
   word if some clause is negated; a modal word if some clause has a modality.
   Any other word (`also`, `only`, `every`, `all`, `more`, `than`, `or`,
   `because`, `if`, `when`, `without`, ...) was dropped by the candidate, and
   the candidate gets no identity;
4. a `topic` is a label: its subject may not be longer than 20 words, nor end a
   declarative source sentence (`.`, `!` or `;`) if it has more than 14 words or
   contains a subject pronoun or finite auxiliary (`it`, `we`, `is`, `does`, ...).
   A short tagline such as "Your models." passes; "It grounds my autonomy." does
   not. A topic with no such marker that is a short statement ("Runs locally.")
   still passes, which is a stated limit;
5. English contractions are expanded (`n't` needs negated, `'ll`/`'d` need a
   modality; possessive `'s`, `'m`, `'re`, `'ve` are free);
6. the check is English only; another source language fails closed.

A Sem that mixes a legacy frame with a general condition or consequence gets
checks 1 and 2 only, because a legacy frame names its verb by predicate, not by
a source filler. A Sem with no general clause is not checked at all, so no
existing candidate changes.

Two frame-level rules: `assert.action` must not be only a copula (`copula_action`;
use `define`, `describe` or `relate`), and `enumerate.items` must be an array of
at least two named terms (`invalid_list_role`).

**Contract 0.19** adds two canonical rules (which frame to pick; what the
source-bound check requires) and the seven frames in the frame prompt block.

**Scope:** the transport schema, the `lfp:2.1` projection, literal retention and
every existing frame are unchanged. Registered predicates only gain siblings.

## What an identity on a general frame means

It means the core validated a *structured parse of this exact sentence*:
the slots are typed, every slot is source words, and no content word was left
out. It does not mean paraphrase-invariant meaning. "X is fast" and "X is
quick" get different identities, as do "X runs offline" and "X works
offline"; fillers are open text and the registry has never inferred synonymy
between open terms. A model still decides which frame fits; the core checks
the structure and the anchoring, not the choice of `define` over `describe`.

## Evidence

- `packages/core/test/general-frames.test.ts`: each frame accepted for a faithful
  candidate, golden `lfp:2.1` vectors, refusal of dropped words, unsourced
  fillers, pronoun fillers, copula actions, one-item lists, undeclared negation
  and modality, non-English sources, and unchanged legacy behaviour.
- [experiments/general-frames-v1](../experiments/general-frames-v1/RESULTS.md):
  replay of 391 recorded candidates: 302 identities before and after, 0
  withdrawn, 0 gained, 0 changed.
- Frozen package v22 and `meaning-scoring-recorded-v8` / `meaning-source-review-v7`
  rebind unchanged historical bytes.

## Not established

- **Yield and precision on real text are not claimed here.** They depend on a
  proposing model; the first measurement is in the downstream site integration.
- **Frame choice is not checked.** `describe` versus `define` versus `relate` for
  the same sentence can split one meaning across identities.
- **No paraphrase invariance** (see above), and tense of a copula is dropped.
- **English only.** Greek and other languages fail closed.
- **The closed class is a heuristic.** `in`/`on`/`at` are interchangeable
  leftovers, so "runs in X" and "runs on X" share an identity if the preposition
  is left outside the filler. The contract tells extractors to keep meaningful
  prepositions inside the filler.
- **Not live-qualified and not pre-registered.** Self-reviewed.
