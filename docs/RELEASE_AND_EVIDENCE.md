# Release and evidence policy

A release is a bundle of implementation, schemas, registries, conformance vectors, migration notes, and evidence. Version package APIs, semantic schemas, fingerprints, renderer profiles, model profiles, and datasets explicitly; do not treat one package version as sufficient provenance.

A feature may be called supported only when its evidence report is committed, reproducible, tied to exact versions, and independently reviewed. Historical Lunum results remain historical until reproduced by the current harness.

Pre-1.0 releases may break, but every fingerprint or persisted-schema change still requires a migration note because product databases may already contain Lunum records.
