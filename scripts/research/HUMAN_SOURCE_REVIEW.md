# Returning the human source review

`experiments/meaning-human-review-packet-v1/source-only.jsonl` is the pending
packet for #685 (8 English, 6 Greek sources). It stays unchanged. A reviewer
returns a **new** artifact; `validate-human-source-review.mjs` checks it
without any provider call.

```sh
pnpm build
node scripts/research/validate-human-source-review.mjs --template > review.json   # pre-bound blank form
# fill reviewer.{id,role,selfAttested,languages[].competence}, reviewedAt, and per item:
#   meaningAtoms, ambiguities, explicitNamesAndLiterals (verbatim from source), notes
node scripts/research/validate-human-source-review.mjs review.json [report.json]
```

Store the accepted artifact as a new versioned experiment directory (for
example `experiments/meaning-human-review-v1/review.json`) together with the
validation report; do not edit the packet.

The validator rejects an artifact that:

- is not bound to the exact packet bytes (path and SHA-256), or changes any
  item's id, language, source text or source hash, or omits/duplicates items;
- is not `reviewKind: "human"` with `modelAssisted: false`;
- lacks reviewer id, role, self-attestation flag or per-language competence;
  a `reviewed` item needs `fluent` or `native` competence in its language;
- has a missing, malformed or future `reviewedAt`;
- carries model output, proposed Sem, expected outcomes or dispositions
  (`sem`, `goldSem`, `candidateSem`, `expectedOutcome`, `disposition`, ...);
- has a `reviewed` item with no meaning description, or a listed name/literal
  that does not occur verbatim in the source. `declined` items need a reason.

It reports per-language counts and whether English and Greek coverage is
complete (#685 acceptance criterion). It does not judge whether a described
meaning is correct, does not promote gold and does not certify protected data.
Self-attested review is reported as self-attested.

## Owner-delegated model review

The owner may delegate the review to a model. The validator accepts that as
`reviewKind: "delegated-model"` with `modelAssisted: true`, a `reviewer.model`,
`selfAttested: false`, competence `model` for every language (never `native`
or `fluent`), and a `delegation` record (`authorizedBy`, `authorizedAt`,
verbatim `authorization`, `scope`). Its report says `humanReviewDeclared:
false` and `humanReviewCriterionSatisfied: false`: a delegated model review is
recorded honestly and never counts as the human/native review #685 asks for.
The first one is `experiments/meaning-delegated-model-review-v1/`.
