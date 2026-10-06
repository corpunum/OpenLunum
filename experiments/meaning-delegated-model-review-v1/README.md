# Delegated model source review v1 (#685)

**This is a model review, not a human or native-speaker review.** The owner
directed on 2026-10-06: "work also on OpenLunum autonomously, without a human
reviewer — you do the review." The reviewer is Claude (`claude-opus-5-5`,
Claude Code agent). It declares competence `model` for both languages and
does not claim native or fluent judgement.

| File | SHA-256 |
|---|---|
| `review.json` | `0a713b348037b5dde48468e6382ef8ec2208b6423831edf32bddfb7983530ec9` |
| packet `experiments/meaning-human-review-packet-v1/source-only.jsonl` (unchanged) | `4ce954ff391c6f7f3f513f5980509971c12531ab5f5d77df8d8cc0cc9666c698` |

`validation-report.json` was produced by
`node scripts/research/validate-human-source-review.mjs review.json validation-report.json`
using the validator's `delegated-model` mode, with 0 provider calls. It shows
14/14 items reviewed (8 EN, 6 EL), `humanReviewDeclared: false` and
`humanReviewCriterionSatisfied: false`.

## What the review found

Each item lists meaning atoms, ambiguities and verbatim literals. The review
did not use model output, proposed Sem or expected outcomes. Points that
matter for encoding:

- **Modal ambiguity:** e19 `can` and g01 `μπορεί να` are ambiguous between
  ability, permission and (in Greek) epistemic possibility. Neither is a
  fail-closed exact *permission* target. e13 `should` is weaker than `must`.
- **Greek imperative vs past:** `επανεκκίνησε`, `αρχειοθέτησε` and
  `ειδοποίησε` are formally both 2sg imperative and 3sg aorist indicative. g04
  is genuinely ambiguous; in g05 the conditional `αν … ξεπεράσει` forces the
  imperative; in g07 the imperative is preferred.
- **Scopes that must not be dropped:** the e09 exception ("except the
  auditor"), the e14 temporal scope ("during business hours"), the e10
  recurrence ("every night"), the e15 strict threshold (`more than 5` means
  greater than 5), and the g02 monetary limit (`έως 2.000 ευρώ`, Greek thousands
  separator: 2,000, not 2.0).
- **Unstated values that must not be invented:** the year in e11 and g07, the
  temperature scale in g05, the timezone in e10 and e14, and access level and
  grantor in e06.
- **Attachment:** in e11 "on 15 March" most naturally dates the deadline,
  not the sending.

## Frame decision

See [FRAME_DECISION.md](FRAME_DECISION.md): `allow`/`prohibit` keep the
separate `action` role (ADR 0008), and `theme` is the object.

## Limits

- It does not satisfy the #685 acceptance criterion for human/native
  English and Greek review. The validator reports this.
- It does not certify gold, Sem targets, protected data or training
  readiness. No historical artifact was changed.
- A single model reviewed its own language judgements. A human/native review
  of the same packet remains welcome and would supersede this one.
