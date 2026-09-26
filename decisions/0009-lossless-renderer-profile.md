# ADR 0009 — Lossless renderer profile `generic-en-pivot/0.2`

**Status:** Implemented 2026-09-26. Self-reviewed. The default renderer is still `generic-en-pivot/0.1`.

## Context

Building the standalone consumer benchmark exposed that the default Lunum-Code renderer `generic-en-pivot/0.1` does not preserve meaning:

- For a conditional with consequences it renders only the consequences. **The root action is dropped**: "…S-11 must enable feature F-11 and send notice N-11…" becomes `R if below b-11 20 then obligation send s-11 o-11 n-11`.
- Clause `time`, units, role names and term types are not rendered: "retries U-31 seven times on 2027-01-14" becomes `R retry rhea u-31 7`.

Any token saving measured on 0.1 output therefore mixes compression with deleted information. In the benchmark pilot, a 0.1 context answered "What must S-11 enable?" wrongly.

## Decision

Add `generic-en-pivot/0.2` (`LOSSLESS_RENDERER`), with 0.1 left byte-for-byte unchanged for existing consumers and goldens:

```text
R if below(subject=b-11, value=20 percent) then must enable(agent=s-11, theme=f-11) ; must send(agent=s-11, recipient=o-11, object=n-11)
R retry(agent=rhea, theme=u-31, count=7 times) @2027-01-14
R not allow(agent=lena, recipient=tomas, action=update)
```

- Role names are kept.
- `must`/`may` render obligation/permission; other modalities use their protocol name.
- The root clause is kept before its consequences.
- Conditions are joined with `and`.
- `@` marks clause time; units follow literal values.

## Limits

- Term types are still not rendered (`b-11` does not say it is a metric), and identifiers are lowercased by canonicalization. The benchmark measures whether that matters for answers.
- Rendering is not a fingerprint or canonicalization change: identities are unaffected.
- Whether 0.2 should become the default is a separate decision, to be made only after downstream-quality evidence (`experiments/consumer-memory-qa-v1`).
