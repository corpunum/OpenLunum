# ADR 0004: Language-neutral Sem and an initial English-pivot renderer

Status: accepted (refined 2026-10-22 by [ADR 0030](0030-english-pivot-translation-adapters.md): English is also the working language of extraction; other languages reach Lunum through translation adapters)

Lunum-Sem stores structured meaning independent of source or target language. The initial `generic-en-pivot/0.1` renderer uses readable English-like protocol tokens because it is practical for current general models. It is a measured representation profile, not canonical meaning. Natural-language output is produced by a separate realizer profile, and original source evidence is always retained.
