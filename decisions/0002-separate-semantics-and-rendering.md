# ADR 0002: Separate semantics and rendering

**Status:** Accepted

Canonical meaning, fingerprints, and compact model-facing spelling are separate layers. Tokenizer-specific changes do not alter semantic identity unless meaning changes. This follows the central lesson of the Lunum 1→2.7 experiments.
