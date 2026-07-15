# ADR 0001: Independent core and product adapters

**Status:** Accepted

Lunum core is independent of every adopting product. Products consume a versioned package or service through product-owned adapters. OpenUnum is the first detailed reference integration but does not define the semantic schema.

This prevents product database, UI, and orchestration choices from becoming language rules while still allowing real product requirements to shape generalized APIs.
