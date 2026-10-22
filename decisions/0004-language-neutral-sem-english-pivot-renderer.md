# ADR 0004: Language-neutral Sem and an initial English-pivot renderer

Status: accepted

Lunum-Sem stores structured meaning independent of source or target language. The initial `generic-en-pivot/0.1` renderer uses readable English-like protocol tokens because it is practical for current general models. It is a measured representation profile, not canonical meaning. Natural-language output is produced by a separate realizer profile, and original source evidence is always retained.
