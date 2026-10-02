# Recorded meaning diagnostics: explicit contract-0.13 replay binding

This manifest supersedes v1 **only for replay on agent contract 0.13**. It
references exactly the same 30 sources, native streams, historical contract
0.10 package, ledgers and self-reviewed targets. No gold, source, model output
or historical metric was changed. The 14 unresolved targets remain unresolved.

The unchanged scorer checks the actual wire schema independently of candidate
submission. Consequently this binding is not a new extraction-quality result.
It distinguishes the current diagnostic contract from the contract used by the
historical agent. Neither is mislabeled as live 0.13 evidence.

After building, replay to a **new** output path:

```sh
node scripts/research/score-recorded-meaning.mjs \
  experiments/meaning-scoring-recorded-v2/input-manifest.json /tmp/new-meaning-report.json
```

The output uses exclusive creation. Frozen v1 remains reproducible at its
original implementation SHA, and intentionally fails binding on current core.
This is post-hoc/self-reviewed diagnostic material, not protected evaluation.
